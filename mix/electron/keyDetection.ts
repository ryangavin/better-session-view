import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { read, write, type Manifest } from './manifest.ts';
import { hashOf } from './job.ts';
import { claim, hold, release, wasCancelled, type Lease } from './work.ts';
import { readKeyExperiments } from './keyExperiments.ts';
import { detectedKey, keyConfigMatches, KEY_DETECTION_VERSION, KEYFINDER_CONFIG, KEYFINDER_VERSION, type KeyDetection } from '../src/keyDetection.ts';
import { keyName, normalizedKey } from '../src/keyNames.ts';
export interface KeyDetectionTools {keyfinder:string;ffmpeg:string}
function command(file:string,args:string[],lease:Lease):Promise<string>{
  if(wasCancelled(lease))return Promise.reject(new Error('Key detection canceled'));
  return new Promise((resolve,reject)=>{
    const child=execFile(file,args,{timeout:15*60*1000,maxBuffer:1024*1024},(error,stdout,stderr)=>error?reject(new Error(`${path.basename(file)}: ${stderr||error.message}`)):resolve(stdout.trim()));hold(lease,child);
  });
}
function originalPath(root:string,file:string):string{
  const resolved=path.resolve(root,file);if(!resolved.startsWith(path.resolve(root)+path.sep))throw new Error('Original audio must remain inside the library');return resolved;
}
/** Only explicit analysis/import calls this; browsing never computes or promotes keys. */
export async function detectTrackKey(root:string,id:string,tools:KeyDetectionTools):Promise<Manifest>{
  const lease=claim('key-detect',id);if(!lease)throw new Error('The analysis engine is busy; retry key detection when it finishes');
  let temporary:string|undefined;
  try{
    const initial=await read(root),track=initial.tracks.find(t=>t.id===id);if(!track)throw new Error('Track no longer exists');
    const source=originalPath(root,track.file),hash=await hashOf(source);
    let detection=detectedKey(track);
    if(detection?.source.hash===hash)return initial;
    detection=null;
    // Research evidence is reusable only for the same original bytes and full profile.
    try{
      const held=await readKeyExperiments(root,id);
      for(const run of held.runs.slice().reverse()){
        const result=run.results.find(r=>r.backend==='libkeyfinder');
        if(run.file!==track.file||run.sourceHash!==hash||!result||result.version!==KEYFINDER_VERSION||result.input!=='original'||!keyConfigMatches(result.config))continue;
        if(result.status==='unknown'&&result.labels.length===0||result.status==='key'&&result.labels.length===1&&normalizedKey(result.labels[0])&&normalizedKey(result.labels[0])!=='Unknown'){
          detection={version:KEY_DETECTION_VERSION,algorithm:'libkeyfinder',detectorVersion:KEYFINDER_VERSION,source:{file:track.file,hash},config:{...KEYFINDER_CONFIG},status:result.status as 'key'|'unknown',label:result.status==='unknown'?'Unknown':keyName(result.labels[0]),confidence:'provisional',analyzedAt:run.at,experimentId:run.id};break;
        }
      }
    }catch{/* Corrupt/missing experiment evidence is never promoted; run the detector. */}
    if(!detection){
      try{await fs.access(tools.keyfinder);await fs.access(tools.ffmpeg);}catch{throw new Error('Key detector is not installed. Rebuild mix[flow] with its bundled tools (node mix/tools/prepare.ts), or reinstall the app.');}
      if(await command(tools.keyfinder,['--version'],lease)!==KEYFINDER_VERSION)throw new Error('Key detector version mismatch; rebuild or reinstall mix[flow]');
      temporary=await fs.mkdtemp(path.join(os.tmpdir(),'mix-key-detect-'));const pcm=path.join(temporary,'original.f32');
      await command(tools.ffmpeg,['-v','error','-nostdin','-i',source,'-vn','-ac','1','-ar','44100','-f','f32le',pcm],lease);
      const result=JSON.parse(await command(tools.keyfinder,[pcm],lease)) as {label:string;score:unknown};
      if(!normalizedKey(result.label)||result.score!==null)throw new Error('Invalid key detector result');
      const label=keyName(result.label);
      detection={version:KEY_DETECTION_VERSION,algorithm:'libkeyfinder',detectorVersion:KEYFINDER_VERSION,source:{file:track.file,hash},config:{...KEYFINDER_CONFIG},status:label==='Unknown'?'unknown':'key',label,confidence:'provisional',analyzedAt:new Date().toISOString()};
    }
    if(wasCancelled(lease))throw new Error('Key detection canceled');
    if(await hashOf(source)!==hash)throw new Error('Original audio changed during key detection; try again');
    const manifest=await read(root),current=manifest.tracks.find(t=>t.id===id);
    if(!current||current.file!==track.file)throw new Error('Track changed during key detection; result was not saved');
    current.keyDetection=detection; // Manual key and all concurrent metadata edits survive.
    await write(root,manifest);return manifest;
  }finally{try{if(temporary)await fs.rm(temporary,{recursive:true,force:true});}finally{release(lease);}}
}
/** Import succeeds even when one key cannot be detected; report a retryable failure. */
export async function detectImportedKeys(root:string,ids:readonly string[],tools:KeyDetectionTools):Promise<string[]>{
  const problems:string[]=[];
  for(const id of ids)try{await detectTrackKey(root,id,tools);}catch(error){problems.push(`Audio imported; key detection pending for ${id}: ${String(error)}`);}
  return problems;
}
