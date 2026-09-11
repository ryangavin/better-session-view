import { PeakLimiter } from './peakLimiter.ts';
declare const sampleRate:number;
declare class AudioWorkletProcessor { port:MessagePort; }
declare function registerProcessor(name:string,processor:new()=>AudioWorkletProcessor):void;
class OutputLimiter extends AudioWorkletProcessor {
  private limiter=new PeakLimiter(sampleRate);
  process(inputs:Float32Array[][],outputs:Float32Array[][]){
    const output=outputs[0];
    if(output?.[0]&&output[1])this.limiter.process(inputs[0]?.[0],inputs[0]?.[1],output[0],output[1]);
    return true;
  }
}
registerProcessor('mix-output-limiter',OutputLimiter);
