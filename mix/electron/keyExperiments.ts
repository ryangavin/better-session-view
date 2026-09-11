import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { read } from './manifest.ts';
import { hashOf } from './job.ts';
import { claim, hold, release, wasCancelled, type Lease } from './work.ts';
import { readPitchMap } from './pitchMap.ts';
import { transcriptionAt, readTranscription } from './transcribeJob.ts';
import { estimateKey, KEY_VERSION } from '../src/key.ts';
import { EXPERIMENT_BACKENDS, normalizedKey, type KeyBackend, type KeyBackendStatus, type KeyExperimentData, type KeyExperimentResult, type KeyExperimentRun, type KeyReference } from '../src/keyExperiments.ts';
export interface KeyExperimentTools { home:string; script:string; ffmpeg:string; keyfinder?:string }
const SETUP = 'Run node tools/mix-key-experiments-setup.ts from the source checkout; then refresh experiment backends.';
const semantics = {libkeyfinder:'No confidence score exposed by keyOfAudio; no probability inferred.',essentia:'KeyExtractor profile correlation strength, not probability; incomparable with bass coverage/support.',bass:'Fraction of usable bass pitch inside a scale; not probability or Essentia strength.'};
function command(file:string,args:string[],lease?:Lease, timeout=15*60*1000):Promise<string> {
  return new Promise((resolve,reject)=>{
    const child=execFile(file,args,{maxBuffer:2*1024*1024,timeout},(error,stdout,stderr)=>error?reject(new Error(`${path.basename(file)}: ${stderr || error.message}`)):resolve(stdout.trim()));
    if(lease){hold(lease,child);if(wasCancelled(lease))child.kill('SIGTERM');}
  });
}
export async function keyExperimentStatus(tools:KeyExperimentTools):Promise<KeyBackendStatus[]> {
  const result:KeyBackendStatus[]=[];
  for(const id of ['libkeyfinder','essentia'] as const) {
    try {
      await fs.access(tools.ffmpeg);
      const version=await command(id==='essentia'?path.join(tools.home,'venv/bin/python'):(tools.keyfinder??path.join(tools.home,'keyfinder')),id==='essentia'?[tools.script,'--version']:['--version'],undefined,10000);
      result.push({id,available:true,version,message:'Original audio; no stems required',license:id==='essentia'?'AGPLv3 / commercial options (UPF)':'GPL-3.0-or-later'});
    } catch(error) {result.push({id,available:false,version:'unavailable',message:`${String(error)}. ${SETUP}`,license:id==='essentia'?'AGPLv3 / commercial options (UPF)':'GPL-3.0-or-later'});}
  }
  result.push({id:'bass',available:true,version:String(KEY_VERSION),message:'Optional baseline: requires existing checksum-valid bass pitch map; never runs new bass inference.',license:'Existing app estimator'});
  return result;
}
async function songAt(root:string,id:string) {
  const track=(await read(root)).tracks.find(t=>t.id===id);
  if(!track)throw new Error('Track no longer exists');
  return track;
}
function within(root:string,file:string):string {
  const resolved=path.resolve(root,file);
  if(!resolved.startsWith(path.resolve(root)+path.sep))throw new Error('Audio path must remain in the library');
  return resolved;
}
const folder = (root:string,id:string) => path.join(root,'experiments','keys',Buffer.from(id).toString('hex'));
async function writeJSON(file:string,value:unknown) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temporary=`${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n'); await fs.rename(temporary,file);
}
export async function readKeyExperiments(root:string,id:string):Promise<KeyExperimentData> {
  await songAt(root,id);
  const where=folder(root,id);
  let files:string[]=[]; try {files=await fs.readdir(where);} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const runs:KeyExperimentRun[]=[];
  for(const file of files.filter(f=>f.endsWith('.json')&&f!=='reference.json')) runs.push(JSON.parse(await fs.readFile(path.join(where,file),'utf8')));
  let reference:KeyReference|null=null;try {reference=JSON.parse(await fs.readFile(path.join(where,'reference.json'),'utf8'));} catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  return {runs:runs.sort((a,b)=>a.at.localeCompare(b.at)),reference};
}
export async function saveKeyReference(root:string,id:string,labels:string[],provenance:string):Promise<KeyReference> {
  if(!Array.isArray(labels)||!labels.length||labels.length>24||labels.some(l=>typeof l!=='string'||!normalizedKey(l))||typeof provenance!=='string'||!provenance.trim())throw new Error('Provide verified key labels (for example C major; A minor) and reference provenance');
  const track=await songAt(root,id),sourceHash=await hashOf(within(root,track.file));
  const reference:KeyReference={sourceHash,labels:labels.map(l=>l.trim()),provenance:provenance.trim(),verification:'verified'};
  await writeJSON(path.join(folder(root,id),'reference.json'),reference);return reference;
}
export async function runKeyExperiment(root:string,id:string,backends:KeyBackend[],tools:KeyExperimentTools):Promise<KeyExperimentRun> {
  if(!Array.isArray(backends)||!backends.length||backends.some(b=>!EXPERIMENT_BACKENDS.includes(b))||new Set(backends).size!==backends.length)throw new Error('Select valid unique experiment backends');
  const lease=claim('key-experiment',id);if(!lease)throw new Error('The engine is busy');
  let temp:string|undefined;
  try {
    const track=await songAt(root,id),file=within(root,track.file),sourceHash=await hashOf(file);
    const statuses=await keyExperimentStatus(tools);
    const run:KeyExperimentRun={id:randomUUID(),trackId:id,title:track.title,at:new Date().toISOString(),sourceHash,file:track.file,results:[]};
    temp=await fs.mkdtemp(path.join(os.tmpdir(),'mix-key-experiment-'));
    const pcm=path.join(temp,'original.f32');
    let decoded=false;
    for(const backend of backends) {
      if(wasCancelled(lease))throw new Error('Experiment canceled');
      const status=statuses.find(s=>s.id===backend)!;
      const result:KeyExperimentResult={backend,version:status.version,input:backend==='bass'?'bass':'original',status:'error',labels:[],score:null,scoreMeaning:semantics[backend],runtimeMs:0,config:backend==='bass'?{summaryVersion:KEY_VERSION,cachedOnly:true}:{sampleRate:44100,channels:1,format:'f32le',...(backend==='essentia'?{profileType:'bgate',frameSize:4096,hopSize:4096,hpcpSize:12}:{profile:'libkeyfinder defaults',revision:'c78e8372e0188c0a11b7b55a653ea0cbbbf70fa5'})}};
      let start=performance.now();
      try {
        if(!status.available){result.status='unavailable';result.message=status.message;}
        else if(backend==='bass') {
          if(!track.stems||!track.model)throw new Error('No bass stems. Baseline is optional; original-mix backends remain usable.');
          const where=transcriptionAt(id,track.model),held=await readTranscription(root,where);
          const hash=await hashOf(within(root,`${track.stems}/bass.wav`));
          const map=await readPitchMap(root,where,hash,held?.pitchMap);
          if(!map||!held?.pitchMap)throw new Error('No valid cached bass pitch map. Optional baseline skipped; no inference started.');
          const estimate=estimateKey(map,{hash,mapHash:held.pitchMap.sha256,stems:track.stems,model:track.model});
          result.config={...result.config,bassHash:hash,mapHash:held.pitchMap.sha256,coverage:estimate.coverage};
          result.status=estimate.status==='unknown'?'unknown':estimate.alternatives.length>1?'ambiguous':'key';
          result.labels=result.status==='ambiguous'?estimate.alternatives.map(c=>c.label):estimate.candidates.map(c=>c.label);
          result.score=estimate.candidates[0]?.support??null;
          result.message='Diagnostic baseline only; never updates saved library keys.';
        } else {
          if(!decoded){await command(tools.ffmpeg,['-v','error','-nostdin','-i',file,'-vn','-ac','1','-ar','44100','-f','f32le',pcm],lease);decoded=true;}
          start=performance.now();
          const output=await command(backend==='essentia'?path.join(tools.home,'venv/bin/python'):(tools.keyfinder??path.join(tools.home,'keyfinder')),backend==='essentia'?[tools.script,pcm]:[pcm],lease);
          const value=JSON.parse(output) as {label:string;score:number|null};
          if(!normalizedKey(value.label)||(value.score!==null&&!Number.isFinite(value.score)))throw new Error('Invalid backend result');
          result.status=value.label==='Unknown'?'unknown':'key';result.labels=result.status==='key'?[value.label]:[];result.score=value.score;
        }
      } catch(error){result.status=backend==='bass'?'unavailable':'error';result.message=String(error);}
      result.runtimeMs=performance.now()-start;run.results.push(result);
    }
    // Bind every run to the bytes actually analyzed, independent of canonical metadata.
    if(await hashOf(file)!==sourceHash)throw new Error('Original audio changed during experiment; result was not saved');
    await writeJSON(path.join(folder(root,id),`${run.id}.json`),run);return run;
  } finally {try {if(temp)await fs.rm(temp,{recursive:true,force:true});} finally {release(lease);}}
}

/** Import only researched metadata; a person-verified reference is never overwritten. */
export async function importKeyReference(root:string,id:string,value:Omit<KeyReference,'sourceHash'>):Promise<'saved'|'preserved'> {
  if(!['published','disputed','missing','version-unverified'].includes(value.verification??'') || !value.provenance?.trim() || !Array.isArray(value.labels) || value.labels.some(l=>!normalizedKey(l)) || !Array.isArray(value.sources) || value.sources.some(s=>!/^https?:\/\//.test(s.url)||typeof s.value!=='string'||!s.recording?.trim()))throw new Error('Invalid published reference');
  if(value.verification==='published' && (!value.labels.length||!value.sources.length))throw new Error('Published references need a key and source');
  const existing=await readKeyExperiments(root,id);
  if(existing.reference && (!existing.reference.verification||existing.reference.verification==='verified'))return 'preserved';
  const track=await songAt(root,id),sourceHash=await hashOf(within(root,track.file));
  await writeJSON(path.join(folder(root,id),'reference.json'),{...value,sourceHash});return 'saved';
}
