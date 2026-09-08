// Dev-only sample capture. Its output is silence; no test signal reaches speakers.
class Capture extends AudioWorkletProcessor {
  constructor(){super();this.samples=new Float32Array(4096);this.used=0;this.start=0;}
  process(inputs,outputs){
    const input=inputs[0]?.[0];
    if(input){if(!this.used)this.start=currentFrame/sampleRate;this.samples.set(input,this.used);this.used+=input.length;
      if(this.used===this.samples.length){this.port.postMessage({at:this.start,samples:this.samples},[this.samples.buffer]);this.samples=new Float32Array(4096);this.used=0;}}
    for(const output of outputs)for(const channel of output)channel.fill(0);
    return true;
  }
}
registerProcessor('dj-check-capture',Capture);
