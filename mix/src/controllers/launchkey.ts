import { ContinuousControls, type ContinuousControl } from './continuous.ts';
import type { MixerEngine } from '../play/engine.ts';

// Novation Launchkey MK4 Programmer's Reference, DAW interface (not MCU/HUI).
export const launchkeyMode = (enabled: boolean) => [0x9f, 0x0c, enabled ? 127 : 0];
export const controllerHex = (data: readonly number[]) => data.map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(' ');
export const KNOBS = ['FX A', 'Filter', 'FX B', 'Unused', 'EQ low', 'EQ mid', 'EQ high', 'Trim'] as const;
const ranges = [[0,100],[-100,100],[0,100],[0,0],[-24,12],[-24,12],[-24,12],[-12,12]];
export type LaunchkeyEvent = {kind:'fader'|'knob'|'relative'; index:number; value:number} | {kind:'focus'; index:number} | {kind:'pad'; index:number; down:boolean} | {kind:'play'|'stop'} | {kind:'mode'; index:number; value:number};
export function decodeLaunchkey(data: readonly number[]): LaunchkeyEvent | null {
  if (data.length !== 3 || data.some(v => !Number.isInteger(v)) || data.slice(1).some(v => v < 0 || v > 127)) return null;
  const [status,key,value] = data;
  if(status === 0xb6 && key >= 29 && key <= 31) return {kind:'mode', index:key, value};
  if(status === 0xbf) {
    if(key >= 5 && key <= 13) return {kind:'fader',index:key-5,value};
    if(key >= 21 && key <= 28) return {kind:'knob',index:key-21,value};
    if(key >= 85 && key <= 92) return {kind:'relative',index:key-85,value:value-64};
    if(value === 127 && key === 115) return {kind:'play'};
    if(value === 127 && key === 116) return {kind:'stop'};
  }
  if(status === 0x90 || status === 0x80) {
    const down=status===0x90 && value>0;
    if(down && key >= 37 && key <= 45) return {kind:'focus',index:key-37};
    if(key >= 96 && key <= 103) return {kind:'pad',index:key-96,down};
    if(key >= 112 && key <= 119) return {kind:'pad',index:key-112+8,down};
  }
  return null;
}
const PREFERENCE_KEY='mix.launchkey.controller.v1';
interface RememberedPair { enabled:boolean; sysex:boolean; input:{id:string;name:string}; output:{id:string;name:string} }
const establishedPair:RememberedPair={enabled:true,sysex:true,input:{id:'',name:'Launchkey MK4 61 DAW Out'},output:{id:'',name:'Launchkey MK4 61 DAW In'}};
export function rememberedPort<T extends {id:string;name:string|null;state:string}>(ports:Iterable<T>, saved:{id:string;name:string}):T|undefined {
  const candidates=[...ports].filter(p=>p.state==='connected'&&p.name===saved.name);
  return candidates.find(p=>p.id===saved.id) ?? (candidates.length===1?candidates[0]:undefined);
}
export interface ControllerStatus {
  autoConnect:boolean;
  receiving:boolean;
  metrics:string;
  connected: boolean; pending: boolean; status: string; focus: number; sysex: boolean;
  inputs: readonly {id:string;name:string}[]; outputs: readonly {id:string;name:string}[];
  messages: readonly string[];
}
const portName = (port: MIDIPort) => /Launchkey.*MK4.*DAW/i.test(port.name ?? '');
const identity = (port: MIDIPort) => (port.name ?? '').replace(/\s+(In|Out)$/i,'');
/** Native MK4 connection is opt-in. A controller focus does not select a Prep song. */
export class LaunchkeyController {
  private value: ControllerStatus = {receiving:false,metrics:'No MIDI rate sample yet.',autoConnect:true,connected:false,pending:false,status:'Disconnected. Choose the Launchkey DAW pair.',focus:0,sysex:false,inputs:[],outputs:[],messages:[]};
  private listeners = new Set<() => void>();
  private access?: MIDIAccess;
  private input?: MIDIInput;
  private output?: MIDIOutput;
  private unsubscribe?: () => void;
  private epoch = 0;
  private enabled = true;
  private remembered:RememberedPair=establishedPair;
  private requested=false;
  private autoAttempt='';
  private closing=false;
  private sent = new Map<string,string>();
  private touched = new Set<number>();
  private controls=new ContinuousControls(event=>this.applyContinuous(event));
  private heldCues=new Set<string>();
  private feedbackTimer:ReturnType<typeof setTimeout>|undefined;
  private metricsTimer:ReturnType<typeof setInterval>|undefined;
  private counts={input:0,clock:0,applied:0,output:0,bytes:0,sysex:0,publishes:0,feedback:0,notifications:0,maxAge:0};
  private sending=false;
  private sampleMetrics(){
    const c=this.counts;this.counts={input:0,clock:0,applied:0,output:0,bytes:0,sysex:0,publishes:0,feedback:0,notifications:0,maxAge:0};
    this.update({metrics:`Last second: MIDI in ${c.input} (clock ${c.clock} ignored) · control applies ${c.applied} · mixer publishes ${c.publishes} · feedback passes ${c.feedback} · MIDI out ${c.output}/${c.bytes} bytes (${c.sysex} SysEx) · panel notifications ${c.notifications} · event age max ${Math.round(c.maxAge)}ms · pending ${this.controls.size}`});
  }
  private releaseCues(){for(const id of this.heldCues)this.engine.commands.cueDeck?.(id,false);this.heldCues.clear();}
  private scheduleFeedback(){if(this.value.connected&&this.feedbackTimer===undefined)this.feedbackTimer=setTimeout(()=>{this.feedbackTimer=undefined;this.feedback();},50);}
  private logTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingMessages: string[] = [];
  private modes = {pads:2,knobs:2,faders:1};
  snapshot = () => this.value;
  subscribe = (fn: () => void) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
  constructor(private engine: Pick<MixerEngine,'snapshot'|'subscribe'|'commands'>, private request = (sysex:boolean) => navigator.requestMIDIAccess({sysex}), private storage:Pick<Storage,'getItem'|'setItem'>|null=typeof localStorage==='undefined'?null:localStorage) {
    try {const saved=JSON.parse(this.storage?.getItem(PREFERENCE_KEY)??'null');if(saved&&typeof saved.enabled==='boolean'&&typeof saved.sysex==='boolean'&&[saved.input,saved.output].every(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&/Launchkey.*MK4.*DAW/.test(p.name)))this.remembered=saved;}catch{/* Invalid preference uses only the established device name. */}
    this.value={...this.value,autoConnect:this.remembered.enabled,sysex:this.remembered.sysex};
  }
  private save() {try{this.storage?.setItem(PREFERENCE_KEY,JSON.stringify(this.remembered));}catch{this.diagnostic('Could not save controller preference; this session still works.');}}
  setAutoConnect=(enabled:boolean)=>{
    this.remembered={...this.remembered,enabled};this.save();this.update({autoConnect:enabled});
    if(enabled){this.autoAttempt='';if(this.access)this.tryAuto();else {this.requested=false;void this.restore();}}
  };
  private async restore() {
    if(!this.enabled||!this.remembered.enabled||this.requested)return;
    this.requested=true;await this.scan(this.remembered.sysex);
  }
  private tryAuto() {
    if(!this.enabled||!this.remembered.enabled||this.value.pending||this.value.connected||this.closing||!this.access)return;
    const input=rememberedPort(this.access.inputs.values(),this.remembered.input),output=rememberedPort(this.access.outputs.values(),this.remembered.output);
    if(!input||!output){this.autoAttempt='';this.update({status:'Waiting for the remembered Launchkey DAW pair. If names are ambiguous, choose the pair manually.'});return;}
    const attempt=`${input.id}/${output.id}`;if(this.autoAttempt===attempt)return;this.autoAttempt=attempt;
    this.diagnostic('Automatically reconnecting the remembered Launchkey DAW pair.');void this.connect(input.id,output.id);
  }
  private update(patch: Partial<ControllerStatus>) {
    if(patch.status && patch.status!==this.value.status)patch.messages=[`STATUS ${patch.status}`,...this.value.messages].slice(0,80);
    this.value={...this.value,...patch};this.counts.notifications++;this.listeners.forEach(fn=>fn());
  }
  private diagnostic(text:string) {this.update({messages:[`INFO ${text}`,...this.value.messages].slice(0,80)});}
  private log(direction:string, data: readonly number[]) {
    this.pendingMessages.unshift(`${direction} ${controllerHex(data)}`);
    this.pendingMessages.length=Math.min(80,this.pendingMessages.length);
    if(this.logTimer===undefined)this.logTimer=setTimeout(()=>this.flushLog(),50);
  }
  private flushLog() {
    if(this.logTimer!==undefined)clearTimeout(this.logTimer);this.logTimer=undefined;
    if(this.pendingMessages.length){const messages=[...this.pendingMessages,...this.value.messages].slice(0,80);this.pendingMessages=[];this.update({messages});}
  }
  setEnabled(enabled:boolean) {this.enabled=enabled;if(!enabled){this.autoAttempt='';void this.disconnect('Disconnected in Prep; auto-connect resumes in Play.',false);}else if(this.access)this.tryAuto();else void this.restore();}
  async scan(sysex:boolean) {
    const epoch=++this.epoch;
    this.update({pending:true,status:'Requesting MIDI access…'});
    this.diagnostic(`Discovery requested; SysEx ${sysex?'requested':'off'}.`);
    try {
      if(this.value.connected)await this.closePorts();
      const access=await this.request(sysex);
      if(epoch!==this.epoch)return;
      if(this.access)this.access.onstatechange=null;
      this.access=access;
      this.diagnostic(`MIDI permission granted; SysEx ${access.sysexEnabled?'enabled':'disabled'}.`);
      const refresh=()=>{
        const inputs=[...access.inputs.values()],outputs=[...access.outputs.values()];
        this.diagnostic(`Detected ${inputs.length} inputs: ${inputs.map(p=>`${p.name} (${p.state})`).join('; ')||'none'}`);
        this.diagnostic(`Detected ${outputs.length} outputs: ${outputs.map(p=>`${p.name} (${p.state})`).join('; ')||'none'}`);
        this.update({inputs:[...access.inputs.values()].filter(p=>p.state==='connected'&&portName(p)).map(p=>({id:p.id,name:p.name!})),outputs:[...access.outputs.values()].filter(p=>p.state==='connected'&&portName(p)).map(p=>({id:p.id,name:p.name!}))});
        if(this.value.connected && (this.input?.state!=='connected'||this.output?.state!=='connected')){this.autoAttempt='';void this.disconnect('Launchkey disconnected; waiting for the remembered pair.',false).then(()=>this.tryAuto());}
        else this.tryAuto();
      };
      access.onstatechange=refresh;refresh();
      this.update({sysex:access.sysexEnabled,pending:false,status:this.value.inputs.length&&this.value.outputs.length?'Launchkey DAW ports found.':'No connected Launchkey MK4 DAW pair found. See detected ports below.'});
      this.tryAuto();
    } catch(error) {if(epoch===this.epoch)this.update({pending:false,status:`MIDI unavailable: ${String(error)}. For controls without display text, retry with SysEx unchecked.`});}
  }
  async connect(inputId:string,outputId:string) {
    if(!this.enabled){this.update({status:'Switch to Play before connecting.'});return;}
    const input=this.access?.inputs.get(inputId),output=this.access?.outputs.get(outputId);
    if(!input||!output||!portName(input)||!portName(output)||identity(input)!==identity(output)){this.update({status:'Choose a matching Launchkey MK4 DAW pair.'});return;}
    const epoch=++this.epoch;
    this.update({pending:true,status:'Opening chosen DAW pair…'});
    this.diagnostic(`Selected input: ${input.name}; output: ${output.name}.`);
    await this.closePorts();
    try {
      const opened=await Promise.allSettled([input.open(),output.open()]);
      const failure=opened.find(result=>result.status==='rejected');
      if(failure?.status==='rejected')throw failure.reason;
      if(epoch!==this.epoch){await Promise.allSettled([input.close(),output.close()]);return;}
      if(input.state!=='connected'||output.state!=='connected')throw new Error('The MIDI pair disconnected');
      this.diagnostic('Both MIDI ports opened successfully.');
      this.remembered={enabled:true,sysex:this.value.sysex,input:{id:input.id,name:input.name!},output:{id:output.id,name:output.name!}};this.save();this.update({autoConnect:true});
      this.input=input;this.output=output;this.sent.clear();this.modes={pads:2,knobs:2,faders:1};
      input.onmidimessage=event=>{if(event.data)this.receive(Array.from(event.data),event.timeStamp);};
      this.update({receiving:false,connected:true,pending:false,status:'MIDI ports open; DAW mode requested. Waiting for Launchkey input.'});
      this.send('mode',launchkeyMode(true));
      this.send('pads-mode',[0xb6,29,2]);this.send('knobs-mode',[0xb6,30,2]);this.send('faders-mode',[0xb6,31,1]);
      if(this.value.sysex){this.send('display-config',[0xf0,0,0x20,0x29,2,0x14,4,32,1,0xf7]);}
      if(!this.value.connected)return;
      this.unsubscribe=this.engine.subscribe(()=>{this.counts.publishes++;this.scheduleFeedback();});this.feedback();
      this.metricsTimer=setInterval(()=>this.sampleMetrics(),1000);
    }catch(error){await Promise.allSettled([input.close(),output.close()]);if(epoch===this.epoch)await this.disconnect(`Connection failed: ${String(error)}. Use Connect to retry.`,false);}
  }
  private async closePorts() {
    this.closing=true;
    this.controls.flush();this.controls.cancel();this.releaseCues();
    if(this.feedbackTimer!==undefined)clearTimeout(this.feedbackTimer);this.feedbackTimer=undefined;
    if(this.metricsTimer!==undefined)clearInterval(this.metricsTimer);this.metricsTimer=undefined;
    this.unsubscribe?.();this.unsubscribe=undefined;
    const input=this.input,output=this.output;this.input=undefined;this.output=undefined;
    if(input)input.onmidimessage=null;
    if(output?.state==='connected'){try{output.send(launchkeyMode(false));this.log('OUT',launchkeyMode(false));}catch(error){this.diagnostic(`DAW mode release failed: ${String(error)}`);}}
    this.sent.clear();this.touched.clear();this.update({connected:false,receiving:false});
    const closed=await Promise.allSettled([input?.close(),output?.close()]);
    closed.forEach((result,i)=>{if(result.status==='rejected')this.diagnostic(`${i?'Output':'Input'} close failed: ${String(result.reason)}`);});
    if(input||output)this.diagnostic('Selected pair released.');
    this.closing=false;
  }
  async disconnect(status='Disconnected; automatic connection is off.',intentional=true) {++this.epoch;if(intentional){this.remembered={...this.remembered,enabled:false};this.save();}this.update({autoConnect:this.remembered.enabled,pending:false,status});await this.closePorts();}
  dispose() {if(this.access)this.access.onstatechange=null;void this.disconnect('Controller released.',false);this.flushLog();this.listeners.clear();}
  clearLog=()=>{if(this.logTimer!==undefined)clearTimeout(this.logTimer);this.logTimer=undefined;this.pendingMessages=[];this.update({messages:[]});};
  focus=(index:number)=>{if(![0,1,2,3,8].includes(index)||index===this.value.focus)return;this.controls.flush();this.releaseCues();this.update({focus:index});this.sent.clear();this.scheduleFeedback();};
  private send(key:string,packet:number[]) {
    if(!this.output||!this.value.connected)return;
    const signature=controllerHex(packet);if(this.sent.get(key)===signature)return;
    this.sent.set(key,signature);
    try{this.sending=true;this.output.send(packet);this.counts.output++;this.counts.bytes+=packet.length;if(packet[0]===0xf0)this.counts.sysex++;this.log('OUT',packet);}catch(error){void this.disconnect(`MIDI output failed: ${String(error)}. Use Connect to retry.`,false);}finally{this.sending=false;}
  }
  private knobValues() {const s=this.engine.snapshot(),d=s.decks[this.value.focus];return this.value.focus===8?[s.masterSendA,s.masterFilter,s.masterSendB,0,...s.masterEq,s.masterTrim]:d?[d.sendA,d.filter,d.sendB,0,...d.eq,d.trim]:[];}
  private text(target:number,field:number,text:string) {this.send(`text${target}/${field}`,[0xf0,0,0x20,0x29,2,0x14,6,target,field,...Array.from(text.normalize('NFKD').replace(/[^\x20-\x7e]/g,'?').slice(0,32),c=>c.charCodeAt(0)),0xf7]);}
  feedback() {
    if(!this.value.connected)return;this.counts.feedback++;
    const s=this.engine.snapshot();
    for(let i=0;i<9;i++) {
      const active=i<4||i===8;
      this.send(`select${i}`,[0x90,37+i,active?(this.value.focus===i?21:1):0]);
    }
    if(this.modes.knobs===2||this.modes.knobs===1||this.modes.knobs===4)this.knobValues().forEach((value,i)=>{if(i!==3&&!this.touched.has(21+i)&&!this.controls.size){const [min,max]=ranges[i];this.send(`knob${i}`,[0xbf,21+i,Math.round((Math.max(min,Math.min(max,value))-min)/(max-min)*127)]);}});
    this.send('play-led',[0xb0,115,s.running?21:1]);this.send('stop-led',[0xb0,116,s.running?1:5]);
    const deck=s.decks[this.value.focus];
    if(this.modes.pads===2)for(let i=0;i<16;i++){
      let color=0;
      if(deck?.status==='ready') {
        if(i===8)color=deck.playing?21:22;
        else if(i===9)color=deck.cueHeld?9:10;
        else if(i===10)color=deck.synced?21:22;
        else if(i===11||i===12)color=45;
        else if(i<4)color=(i===0||i===3)&&deck.loop?.enabled?13:14;
      }
      this.send(`pad${i}`,[0x90,i<8?96+i:112+i-8,color]);
    }
    if(this.value.sysex){this.text(32,0,this.value.receiving?'mix[flow] active':'mix[flow] linked');this.text(32,1,this.value.focus===8?'Master FX':`Deck ${deck?.letter??'?'} FX`);for(let i=0;i<8;i++){this.text(21+i,0,KNOBS[i]);}}
  }
  receive(data:readonly number[],timestamp=performance.now()) {
    if(!this.value.connected||!this.enabled||this.sending)return;
    this.counts.input++;
    if(data.length===1&&data[0]>=0xf8){this.counts.clock++;return;}
    this.counts.maxAge=Math.max(this.counts.maxAge,Math.max(0,performance.now()-timestamp));
    // Poly-aftertouch is unused: do not spend rendering/logging work on its stream.
    if(data[0]===0xa0)return;
    this.log('IN',data);
    if(data.length===3&&data[0]===0xbe){if(data[2]===127)this.touched.add(data[1]);else{this.touched.delete(data[1]);this.sent.delete(`knob${data[1]-21}`);this.scheduleFeedback();}return;}
    const event=decodeLaunchkey(data);if(!event)return;
    if(!this.value.receiving){this.update({receiving:true,status:'Receiving Launchkey DAW input.'});this.scheduleFeedback();}
    if(event.kind==='mode'){this.controls.flush();this.releaseCues();if(event.index===29)this.modes.pads=event.value;if(event.index===30)this.modes.knobs=event.value;if(event.index===31)this.modes.faders=event.value;this.sent.clear();this.scheduleFeedback();return;}
    const state=this.engine.snapshot(),commands=this.engine.commands,deck=state.decks[this.value.focus];
    if(event.kind==='focus'){this.focus(event.index);return;}
    if(event.kind==='play'){if(!state.running)commands.setRunning(true);return;}
    if(event.kind==='stop'){this.releaseCues();commands.stopAll();return;}
    if(event.kind==='fader'||event.kind==='knob'||event.kind==='relative'){this.controls.push(event);return;}
    if(event.kind==='pad'&&this.modes.pads===2){
      const index=event.index;
      // Release the deck that owns the audition, including after a focus change.
      if(index===9){
        if(!event.down){this.releaseCues();return;}
        if(deck?.status==='ready'&&!this.heldCues.has(deck.id)){this.heldCues.add(deck.id);commands.cueDeck?.(deck.id,true);}
        return;
      }
      if(!event.down||deck?.status!=='ready')return;
      if(index===8)commands.setDeckPlaying?.(deck.id,this.heldCues.has(deck.id)||!deck.playing);
      if(index===10)commands.setDeckSync?.(deck.id,!deck.synced);
      if(index===11||index===12)commands.beatJump?.(deck.id,index===11?-1:1);
      if(index===0)commands.quickLoop?.(deck.id);
      if(index===1)commands.resizeLoop?.(deck.id,.5);
      if(index===2)commands.resizeLoop?.(deck.id,2);
      if(index===3)commands.setDeckLoopEnabled?.(deck.id,!deck.loop?.enabled);
    }
  }
  private applyContinuous(event:ContinuousControl){
    if(!this.value.connected)return;
    this.counts.applied++;
    const state=this.engine.snapshot(),commands=this.engine.commands,deck=state.decks[this.value.focus];
    if(event.kind==='fader'&&this.modes.faders===1){const value=event.value/127*100;if(event.index===8)commands.setMaster('master',value);else if(event.index<4&&state.decks[event.index])commands.setDeck(state.decks[event.index].id,'gain',value);return;}
    if((event.kind==='knob'&&[1,2,4].includes(this.modes.knobs))||(event.kind==='relative'&&this.modes.knobs===5)){
      const i=event.index;if(i===3||i>=8)return;const [min,max]=ranges[i];
      // Device position feedback is not a new user change (including loopback ports).
      if(event.kind==='knob'&&this.sent.get(`knob${i}`)===controllerHex([0xbf,21+i,event.value]))return;
      // The hardware already holds this absolute position. Cache it before the
      // synchronous engine publish so feedback cannot reset a moving encoder.
      if(event.kind==='knob')this.sent.set(`knob${i}`,controllerHex([0xbf,21+i,event.value]));
      const value=event.kind==='relative'?Math.max(min,Math.min(max,(this.knobValues()[i]??min)+event.value*(max-min)/127)):min+event.value/127*(max-min);
      if(this.value.focus===8){if(i>=4&&i<=6)commands.setMasterEq(i-4,value);else commands.setMaster(i===0?'masterSendA':i===1?'masterFilter':i===2?'masterSendB':'masterTrim',value);}
      else if(deck){if(i>=4&&i<=6)commands.setDeckEq(deck.id,i-4,value);else commands.setDeck(deck.id,i===0?'sendA':i===1?'filter':i===2?'sendB':'trim',value);}
    }
  }
}
