export interface ContinuousControl { kind:'fader'|'knob'|'relative'; index:number; value:number }
/** Leading update, then bounded latest-value batches. No growing event queue. */
export class ContinuousControls {
  private pending=new Map<string,ContinuousControl>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private last=-Infinity;
  constructor(private apply:(event:ContinuousControl)=>void,private now=()=>performance.now()){}
  get size(){return this.pending.size;}
  push(event:ContinuousControl){
    const key=`${event.kind==='fader'?'fader':'knob'}${event.index}`,previous=this.pending.get(key);
    this.pending.set(key,event.kind==='relative'&&previous?.kind==='relative'?{...event,value:previous.value+event.value}:event);
    const wait=1000/60-(this.now()-this.last);
    if(wait<=0)this.flush();
    else if(this.timer===undefined)this.timer=setTimeout(()=>{this.timer=undefined;this.flush();},Math.ceil(wait));
  }
  flush(){
    if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;
    if(!this.pending.size)return;
    const events=[...this.pending.values()];this.pending.clear();this.last=this.now();events.forEach(event=>this.apply(event));
  }
  cancel(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;this.pending.clear();this.last=-Infinity;}
}
