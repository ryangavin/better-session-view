import workletUrl from './limiterWorklet.ts?worker&url';
import { LIMITER_DELAY } from './peakLimiter.ts';
const modules=new WeakMap<BaseAudioContext,Promise<void>>();
/** Stable input/output nodes; silence until the local worklet is ready, never a bypass. */
export class OutputProtection {
  readonly input:GainNode;
  readonly output:GainNode;
  readonly ready:Promise<void>;
  private node?:AudioWorkletNode;
  private meters:AnalyserNode[];
  private splitter:ChannelSplitterNode;
  private samples=new Float32Array(1024);
  private disposed=false;
  constructor(ctx:BaseAudioContext,onError:(error:unknown)=>void){
    this.input=ctx.createGain();this.output=ctx.createGain();
    this.splitter=ctx.createChannelSplitter(2);this.output.connect(this.splitter);
    this.meters=[0,1].map(i=>{const meter=ctx.createAnalyser();meter.fftSize=1024;this.splitter.connect(meter,i);return meter;});
    let module=modules.get(ctx);
    if(!module){
      module=ctx.audioWorklet?ctx.audioWorklet.addModule(workletUrl):Promise.reject(new Error('AudioWorklet unavailable'));
      modules.set(ctx,module);
    }
    this.ready=module.then(()=>{
      if(this.disposed)return;
      const node=this.node=new AudioWorkletNode(ctx,'mix-output-limiter',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
      node.onprocessorerror=()=>{this.input.disconnect();onError(new Error('Output limiter stopped; output muted.'));};
      this.input.connect(node);node.connect(this.output);
    }).catch(error=>{onError(new Error(`Output limiter unavailable; output muted: ${String(error)}`));throw error;});
    void this.ready.catch(()=>{}); // The playback boundary awaits and surfaces the same failure.
  }
  stereoLevels():readonly [number,number]{return this.meters.map(m=>{m.getFloatTimeDomainData(this.samples);let peak=0;for(const n of this.samples)peak=Math.max(peak,Math.abs(n));return peak;}) as [number,number];}
  level(){return Math.max(...this.stereoLevels());}
  dispose(){this.splitter.disconnect();this.meters.forEach(m=>m.disconnect());this.disposed=true;this.input.disconnect();this.node?.disconnect();this.output.disconnect();}
}
export function alignedCue(ctx:BaseAudioContext){
  const delay=ctx.createDelay(LIMITER_DELAY*2);delay.delayTime.value=Math.round(ctx.sampleRate*LIMITER_DELAY)/ctx.sampleRate;return delay;
}
