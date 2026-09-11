import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { empty, write, read, MANIFEST, type Track } from './manifest.ts';
import { runKeyExperiment, readKeyExperiments, saveKeyReference, importKeyReference } from './keyExperiments.ts';
import { claim, release, busyWork } from './work.ts';
vi.mock('node:child_process',()=>({execFile:vi.fn()}));
let root:string;
beforeEach(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'mix-key-test-'));
  await fs.mkdir(path.join(root,'audio'));await fs.writeFile(path.join(root,'audio/original.wav'),'original bytes');await fs.writeFile(path.join(root,'ffmpeg'),'decoder');
  await write(root,{...empty(),tracks:[{id:'song',title:'Song',file:'audio/original.wav',key:'F minor',stems:null,model:null} as Track]});
  vi.mocked(execFile).mockImplementation(((file:string,args:string[],_options:unknown,callback:(error:Error|null,stdout:string,stderr:string)=>void)=>{
    queueMicrotask(()=>callback(null,args.includes('--version')?'1.0':file.endsWith('ffmpeg')?'':JSON.stringify({label:'C major',score:null}),''));
    return {kill:vi.fn(),exitCode:0};
  }) as unknown as typeof execFile);
});
afterEach(async()=>{vi.clearAllMocks();await fs.rm(root,{recursive:true,force:true});});
const tools=()=>({home:root,script:path.join(root,'worker.py'),ffmpeg:path.join(root,'ffmpeg')});
it('decodes original once without stems, persists independent results and preserves manual metadata',async()=>{
  const before=await fs.readFile(path.join(root,MANIFEST),'utf8');
  const run=await runKeyExperiment(root,'song',['libkeyfinder','essentia','bass'],tools());
  expect(run.results.map(r=>r.status)).toEqual(['key','key','unavailable']);
  const calls=vi.mocked(execFile).mock.calls as unknown as [string,string[]][];
  expect(calls.filter(([f])=>f.endsWith('ffmpeg'))).toHaveLength(1);
  expect(calls.find(([f])=>f.endsWith('ffmpeg'))![1]).toContain(path.join(root,'audio/original.wav'));
  expect((await readKeyExperiments(root,'song')).runs).toEqual([run]);
  expect(await fs.readFile(path.join(root,MANIFEST),'utf8')).toBe(before);
  expect(busyWork()).toBeNull();
});
it('refuses an occupied worker without canceling it and releases its own slot after errors',async()=>{
  const lease=claim('separate','other')!;
  try{await expect(runKeyExperiment(root,'song',['libkeyfinder'],tools())).rejects.toThrow('busy');expect(busyWork()).toBe('other');}finally{release(lease);}
  await expect(runKeyExperiment(root,'absent',['libkeyfinder'],tools())).rejects.toThrow('no longer');expect(busyWork()).toBeNull();
});
it('records missing tools as unavailable and validates backend selection',async()=>{
  const run=await runKeyExperiment(root,'song',['libkeyfinder'],{...tools(),ffmpeg:'/does-not-exist'});
  expect(run.results[0].status).toBe('unavailable');expect(run.results[0].message).toContain('mix-key-experiments-setup');
  await expect(runKeyExperiment(root,'song',['bass','bass'],tools())).rejects.toThrow('unique');
});
it('imports published provenance separately, binds original bytes and preserves person-verified references',async()=>{
  const value={verification:'published' as const,labels:['8B'],provenance:'Published catalog',sources:[{url:'https://example.com/song',value:'8B',recording:'Exact recording'}]};
  expect(await importKeyReference(root,'song',value)).toBe('saved');
  expect((await readKeyExperiments(root,'song')).reference).toMatchObject(value);
  const verified=await saveKeyReference(root,'song',['Db minor'],'Checked the original by ear');
  expect(await importKeyReference(root,'song',value)).toBe('preserved');
  expect((await readKeyExperiments(root,'song')).reference).toEqual(verified);
  expect((await read(root)).tracks[0].key).toBe('F minor');
  await expect(saveKeyReference(root,'song',['A Dorian'],'guess')).rejects.toThrow('verified');
  await expect(importKeyReference(root,'song',{...value,labels:[]})).rejects.toThrow('need a key');
});
