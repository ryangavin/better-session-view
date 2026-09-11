import { ContinuousControls } from './continuous.ts';
import type { MixerCommands, MixerDeck } from '@openflow/widgets/mixer/model.ts';
/** CC1 is travel, never a track position. One wheel sweep moves four beats. */
export class ModWheelJog {
  private last:number|undefined;
  private identity='';
  private deck:string|undefined;
  private delta=0;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private changes=new ContinuousControls(event=>this.move(event.value));
  constructor(private selected:()=>MixerDeck|undefined,private commands:MixerCommands){}
  private key(){const d=this.selected();return `${d?.id??''}/${d?.track?.id??''}`;}
  changed(){if(this.identity!==this.key())this.reset(false);}
  receive(value:number){
    if(!Number.isInteger(value)||value<0||value>127)return;
    this.changed();this.identity=this.key();
    const before=this.last;this.last=value;
    if(before===undefined||before===value||this.selected()?.status!=='ready')return;
    this.changes.push({kind:'relative',index:0,value:(value-before)*4/127});
    if(this.timer!==undefined)clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.finish(),120);
  }
  private move(delta:number){
    const d=this.selected();if(!d||d.status!=='ready'||this.identity!==this.key()||!this.commands.moveDeck)return;
    if(!this.deck){this.deck=d.id;this.delta=0;this.commands.moveDeck(d.id,'begin');}
    this.delta+=delta;this.commands.moveDeck(d.id,'move',this.delta);
  }
  finish(){
    if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;
    this.changes.flush();const deck=this.deck;this.deck=undefined;this.delta=0;
    if(deck)this.commands.moveDeck?.(deck,'commit');
  }
  reset(flush=true){
    if(!flush)this.changes.cancel();
    this.finish();this.changes.cancel();this.last=undefined;this.identity=this.key();
  }
}
