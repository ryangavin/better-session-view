export const LIMITER_DELAY = .005;
export const LIMITER_CEILING = 10 ** (-1 / 20);
/** Stereo-linked sample-peak limiter. Fixed memory and amortized O(1) work per frame. */
export class PeakLimiter {
  readonly delay: number;
  private left: Float32Array;
  private right: Float32Array;
  private peaks: Float64Array;
  private indices: Float64Array;
  private head=0; private tail=0; private frame=0; private gain=1;
  private release:number;
  constructor(rate:number){
    this.delay=Math.round(rate*LIMITER_DELAY);
    this.left=new Float32Array(this.delay+1);this.right=new Float32Array(this.delay+1);
    this.peaks=new Float64Array(this.delay+2);this.indices=new Float64Array(this.delay+2);
    this.release=1-Math.exp(-1/(rate*.05));
  }
  process(left:Float32Array|undefined,right:Float32Array|undefined,outLeft:Float32Array,outRight:Float32Array){
    const capacity=this.peaks.length,size=this.left.length;
    for(let i=0;i<outLeft.length;i++,this.frame++){
      const n=this.frame,write=n%size;
      const l=left?.[i]??0,r=right?.[i]??l;
      this.left[write]=Number.isFinite(l)?l:0;this.right[write]=Number.isFinite(r)?r:0;
      const peak=Math.max(Math.abs(this.left[write]),Math.abs(this.right[write]));
      while(this.head!==this.tail&&this.indices[this.head]<n-this.delay)this.head=(this.head+1)%capacity;
      while(this.head!==this.tail&&this.peaks[(this.tail+capacity-1)%capacity]<=peak)this.tail=(this.tail+capacity-1)%capacity;
      this.peaks[this.tail]=peak;this.indices[this.tail]=n;this.tail=(this.tail+1)%capacity;
      const maximum=this.peaks[this.head],target=maximum>LIMITER_CEILING?LIMITER_CEILING/maximum:1;
      this.gain=Math.min(target,this.gain+(1-this.gain)*this.release);
      const read=(n-this.delay+size)%size;
      outLeft[i]=n<this.delay?0:this.left[read]*this.gain;
      outRight[i]=n<this.delay?0:this.right[read]*this.gain;
    }
  }
}
