/** MIDI-only neutral capture. Remember unsnapped relative travel so escape cannot stick. */
export class NeutralDetents {
  private held=new Map<number,{raw:number;output:number;latched:boolean}>();
  clear(){this.held.clear();}
  value(index:number,input:number,current:number,min:number,max:number,relative:boolean){
    const previous=this.held.get(index),same=previous?.output===current;
    const raw=Math.max(min,Math.min(max,relative?(same?previous.raw:current)+input*(max-min)/127:input));
    if(index!==1 && (index<3||index>7))return raw;
    const step=(max-min)/127;
    const latched=Math.abs(raw)<=step*(same&&previous.latched?4:2);
    const output=latched?0:raw;
    this.held.set(index,{raw,output,latched});
    return output;
  }
}
