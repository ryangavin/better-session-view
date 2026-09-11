import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { read, write, empty, editTrack, recordStems, type Track } from './manifest.ts';
import { hashOf } from './job.ts';
import { detectTrackKey, detectImportedKeys } from './keyDetection.ts';
import { KEYFINDER_CONFIG, KEYFINDER_VERSION, detectedKey } from '../src/keyDetection.ts';
import { keyLabel, keyFilters } from '../src/key.ts';
import { claim, release, busyWork } from './work.ts';
vi.mock('node:child_process',()=>({execFile:vi.fn()}));
let root:string, beforeResult:(()=>Promise<void>)|undefined;
const tools=()=>({keyfinder:path.join(root,'keyfinder'),ffmpeg:path.join(root,'ffmpeg')});
beforeEach(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'key-default-test-'));beforeResult=undefined;
  await fs.mkdir(path.join(root,'audio'));await fs.writeFile(path.join(root,'audio/song.wav'),'original');
  await fs.writeFile(tools().keyfinder,'tool');await fs.writeFile(tools().ffmpeg,'decoder');
  await write(root,{...empty(),tracks:[{id:'song',file:'audio/song.wav',title:'Song',artist:null,album:null,art:null,bpm:null,seconds:null,added:'2026-09-11',key:'F minor',model:null,stems:null,sources:[]} as Track]});
  vi.mocked(execFile).mockImplementation(((file:string,args:string[],_options:unknown,cb:(error:Error|null,out:string,err:string)=>void)=>{
    queueMicrotask(async()=>{if(!args.includes('--version')&&file.endsWith('keyfinder'))await beforeResult?.();cb(null,args.includes('--version')?KEYFINDER_VERSION:file.endsWith('ffmpeg')?'':JSON.stringify({label:'Db minor',score:null}),'');});
    return {kill:vi.fn(),exitCode:0};
  }) as unknown as typeof execFile);
});
afterEach(async()=>{vi.clearAllMocks();await fs.rm(root,{recursive:true,force:true});});
async function experiment(patch:Record<string,unknown>={},config:Record<string,unknown>={...KEYFINDER_CONFIG}){
  const folder=path.join(root,'experiments/keys',Buffer.from('song').toString('hex'));await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({id:'result',trackId:'song',file:'audio/song.wav',sourceHash:await hashOf(path.join(root,'audio/song.wav')),at:'2026-09-11',results:[{backend:'libkeyfinder',input:'original',version:KEYFINDER_VERSION,status:'key',labels:['E major'],config}],...patch}));
}
it('detects a stemless original and preserves a correction made during inference',async()=>{
  beforeResult=async()=>{await editTrack(root,'song',{key:'G minor',title:'Corrected'});};
  const track=(await detectTrackKey(root,'song',tools())).tracks[0];
  expect(track).toMatchObject({key:'G minor',title:'Corrected',keyDetection:{algorithm:'libkeyfinder',label:'C♯ minor',confidence:'provisional'}});
  expect(keyLabel(track)).toBe('G minor');expect(track.stems).toBeNull();expect(busyWork()).toBeNull();
  await editTrack(root,'song',{key:null});const cleared=(await read(root)).tracks[0];expect(keyLabel(cleared)).toBe('C♯ minor');expect(keyFilters(cleared)).toEqual(['C♯ minor']);
  await recordStems(root,'song',{model:'new',sources:['bass'],stems:'stems/new'});expect(detectedKey((await read(root)).tracks[0])?.label).toBe('C♯ minor');
});
it('promotes only a fingerprint/profile-matching experiment without invoking a worker',async()=>{
  await experiment();const track=(await detectTrackKey(root,'song',tools())).tracks[0];
  expect(track.keyDetection).toMatchObject({label:'E major',experimentId:'result'});expect(track.key).toBe('F minor');expect(execFile).not.toHaveBeenCalled();
  await detectTrackKey(root,'song',tools());expect(execFile).not.toHaveBeenCalled();
});
it.each(['hash','file','config','version'])('rejects stale %s experiment evidence and detects afresh',async(field)=>{
  if(field==='config')await experiment({}, {...KEYFINDER_CONFIG,sampleRate:48000});
  else if(field==='version')await experiment({results:[{backend:'libkeyfinder',input:'original',version:'0',status:'key',labels:['E major'],config:KEYFINDER_CONFIG}]});
  else await experiment(field==='hash'?{sourceHash:'stale'}:{file:'different.wav'});
  expect((await detectTrackKey(root,'song',tools())).tracks[0].keyDetection?.label).toBe('C♯ minor');expect(execFile).toHaveBeenCalled();
});
it('does not save changed audio, and does not steal another job',async()=>{
  const lease=claim('separate','other')!;try{await expect(detectTrackKey(root,'song',tools())).rejects.toThrow('busy');}finally{release(lease);}
  beforeResult=async()=>{await fs.writeFile(path.join(root,'audio/song.wav'),'changed');};
  await expect(detectTrackKey(root,'song',tools())).rejects.toThrow('audio changed');expect((await read(root)).tracks[0].keyDetection).toBeUndefined();expect(busyWork()).toBeNull();
});
it('keeps imports and continues after a failed key, and supports an explicit Unknown override',async()=>{
  expect(await detectImportedKeys(root,['missing','song'],tools())).toHaveLength(1);expect(detectedKey((await read(root)).tracks[0])).not.toBeNull();
  await editTrack(root,'song',{key:'Unknown'});expect(keyLabel((await read(root)).tracks[0])).toBe('Unknown');
  await detectTrackKey(root,'song',tools());expect((await read(root)).tracks[0].key).toBe('Unknown');
  await expect(editTrack(root,'song',{key:'D Dorian'})).rejects.toThrow('major/minor');
});
