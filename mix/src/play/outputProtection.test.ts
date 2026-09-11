import { afterEach,expect,it,vi } from 'vitest';
import { OutputProtection } from './outputProtection.ts';
class Node {
  connect=vi.fn();disconnect=vi.fn();fftSize=0;onprocessorerror:(()=>void)|null=null;
  getFloatTimeDomainData(a:Float32Array){a.fill(0);}
}
function context(module:Promise<void>){
  const ctx={createGain:()=>new Node(),createChannelSplitter:()=>new Node(),createAnalyser:()=>new Node(),audioWorklet:{addModule:vi.fn(()=>module)}};
  return ctx as unknown as BaseAudioContext;
}
afterEach(()=>vi.unstubAllGlobals());
it('keeps output disconnected until ready and never falls back to unprotected audio on failure',async()=>{
  const error=vi.fn(),ctx=context(Promise.reject(new Error('load failed'))),protection=new OutputProtection(ctx,error);
  await expect(protection.ready).rejects.toThrow('load failed');
  expect(protection.input.connect).not.toHaveBeenCalled();expect(error).toHaveBeenCalledOnce();protection.dispose();
});
it('does not connect a worklet whose context owner was disposed while it loaded',async()=>{
  let done!:()=>void;const ctx=context(new Promise<void>(resolve=>done=resolve)),ctor=vi.fn(function(){return new Node();});
  vi.stubGlobal('AudioWorkletNode',ctor);
  const protection=new OutputProtection(ctx,vi.fn());protection.dispose();done();await protection.ready;
  expect(ctor).not.toHaveBeenCalled();expect(protection.input.connect).not.toHaveBeenCalled();
});
it('shares module loading, uses distinct processors, and mutes a failed processor',async()=>{
  const ctx=context(Promise.resolve()),nodes:Node[]=[],error=vi.fn();
  vi.stubGlobal('AudioWorkletNode',class extends Node{constructor(){super();nodes.push(this);}});
  const master=new OutputProtection(ctx,error),phones=new OutputProtection(ctx,error);
  await Promise.all([master.ready,phones.ready]);
  expect(ctx.audioWorklet.addModule).toHaveBeenCalledOnce();expect(nodes).toHaveLength(2);
  nodes[0].onprocessorerror?.();expect(master.input.disconnect).toHaveBeenCalled();expect(error).toHaveBeenCalledOnce();
  master.dispose();phones.dispose();
});
