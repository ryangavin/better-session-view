import { ModWheelJog } from './jog.ts';
import { NeutralDetents } from './detent.ts';
import { ContinuousControls, type ContinuousControl } from './continuous.ts';
import type { MixerEngine } from '../play/engine.ts';

// Novation Launchkey MK4 Programmer's Reference, DAW interface (not MCU/HUI).
export const launchkeyMode = (enabled: boolean) => [0x9f, 0x0c, enabled ? 127 : 0];
export const controllerHex = (data: readonly number[]) => data.map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(' ');
export const KNOBS = ['FX A', 'Filter', 'FX B', 'EQ low', 'EQ mid', 'EQ high', 'Trim', 'Master Trim'] as const;
const ranges = [[0,100],[-100,100],[0,100],[-24,12],[-24,12],[-24,12],[-24,12],[-24,12]];
export type LaunchkeyEvent = {kind:'fader'|'knob'|'relative'; index:number; value:number} | {kind:'focus'; index:number} | {kind:'pad'; index:number; down:boolean} | {kind:'play'|'stop'} | {kind:'mode'; index:number; value:number};
export function decodeLaunchkey(data: readonly number[]): LaunchkeyEvent | null {
  if (data.length !== 3 || data.some(v => !Number.isInteger(v)) || data.slice(1).some(v => v < 0 || v > 127)) return null;
  const [status,key,value] = data;
  if(status<0x80||status>0xef)return null;
  const type=status&0xf0;
  if(type === 0xb0 && key >= 29 && key <= 31) return {kind:'mode', index:key, value};
  if(type === 0xb0) {
    if(value>0 && key>=37 && key<=45)return {kind:'focus',index:key-37};
    if(key >= 5 && key <= 13) return {kind:'fader',index:key-5,value};
    if(key >= 21 && key <= 28) return {kind:'knob',index:key-21,value};
    if(key >= 85 && key <= 92) return {kind:'relative',index:key-85,value:value-64};
    if(value === 127 && key === 115) return {kind:'play'};
    if(value === 127 && key === 116) return {kind:'stop'};
  }
  if(type === 0x90 || type === 0x80) {
    const down=type===0x90 && value>0;
    if(key >= 96 && key <= 103) return {kind:'pad',index:key-96,down};
    if(key >= 112 && key <= 119) return {kind:'pad',index:key-112+8,down};
  }
  return null;
}
const PREFERENCE_KEY='mix.launchkey.controller.v1';
interface RememberedPair { enabled:boolean; sysex:boolean; input:{id:string;name:string}; output:{id:string;name:string}; wheel?:{id:string;name:string} }
const establishedPair:RememberedPair={enabled:true,sysex:true,input:{id:'',name:'Launchkey MK4 61 DAW Out'},output:{id:'',name:'Launchkey MK4 61 DAW In'}};
export function rememberedPort<T extends {id:string;name:string|null;state:string}>(ports:Iterable<T>, saved:{id:string;name:string}):T|undefined {
  const candidates=[...ports].filter(p=>p.state==='connected'&&p.name===saved.name);
  return candidates.find(p=>p.id===saved.id) ?? (candidates.length===1?candidates[0]:undefined);
}
export interface ControllerStatus {
  autoConnect:boolean;
  receiving:boolean;
  metrics:string;
  wheel:string;
  faderMode:string;
  selector:string;
  connected: boolean; pending: boolean; status: string; focus: number; sysex: boolean;
  inputs: readonly {id:string;name:string}[]; outputs: readonly {id:string;name:string}[];
  messages: readonly string[];
}
const portName = (port: MIDIPort) => /Launchkey.*MK4.*DAW/i.test(port.name ?? '');
const identity = (port: MIDIPort) => (port.name ?? '').replace(/\s+(In|Out)$/i,'');
/** Native MK4 connection is opt-in. A controller focus does not select a Prep song. */
export class LaunchkeyController {
  private value: ControllerStatus = {faderMode:'Fader mode not reported.',selector:'No fader-button presses received.',wheel:'Mod wheel not connected.',receiving:false,metrics:'No MIDI rate sample yet.',autoConnect:true,connected:false,pending:false,status:'Disconnected. Choose the Launchkey DAW pair.',focus:0,sysex:false,inputs:[],outputs:[],messages:[]};
  private listeners = new Set<() => void>();
  private access?: MIDIAccess;
  private input?: MIDIInput;
  private output?: MIDIOutput;
  private wheelInput?: MIDIInput;
  private wheelOpening=false;
  private wheelEpoch=0;
  private jog:ModWheelJog;
  private unsubscribe?: () => void;
  private epoch = 0;
  private enabled = true;
  private remembered:RememberedPair=establishedPair;
  private requested=false;
  private autoAttempt='';
  private closing=false;
  private deckColors:readonly (readonly number[])[]=[];
  lastButtonInput='No button packet received.';
  private displayTx=0;
  private displayLast='none';
  private displayError='';
  private displayConfigs=new Map<number,number>();
  private sent = new Map<string,string>();
  private controls=new ContinuousControls(event=>this.applyContinuous(event));
  private detents=new NeutralDetents();
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
    this.jog=new ModWheelJog(()=>this.engine.snapshot().decks[this.value.focus],this.engine.commands);
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
        else {this.tryAuto();if(this.value.connected)void this.connectWheel();}
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
      this.remembered={wheel:this.remembered.wheel,enabled:true,sysex:this.value.sysex,input:{id:input.id,name:input.name!},output:{id:output.id,name:output.name!}};this.save();this.update({autoConnect:true});
      this.input=input;this.output=output;this.sent.clear();this.displayTx=0;this.displayLast='none';this.displayError='';this.displayConfigs.clear();this.modes={pads:2,knobs:2,faders:1};
      input.onmidimessage=event=>{if(event.data)this.receive(Array.from(event.data),event.timeStamp);};
      this.update({faderMode:'Volume requested; awaiting mode report.',selector:'No fader-button presses received.',receiving:false,connected:true,pending:false,status:'MIDI ports open; DAW mode requested. Waiting for Launchkey input.'});
      this.send('mode',launchkeyMode(true));
      // Touch and position CCs overlap when input channels are intentionally ignored.
      this.send('touch-events',[0xb6,71,0]);
      this.send('pads-mode',[0xb6,29,2]);this.send('knobs-mode',[0xb6,30,2]);this.send('faders-mode',[0xb6,31,1]);
      if(this.value.sysex){this.send('display-config',[0xf0,0,0x20,0x29,2,0x14,4,32,1,0xf7]);this.send('selection-display-config',[0xf0,0,0x20,0x29,2,0x14,4,33,1,0xf7]);}
      if(!this.value.connected)return;
      this.unsubscribe=this.engine.subscribe(()=>{this.counts.publishes++;this.jog.changed();this.scheduleFeedback();});this.feedback();
      void this.connectWheel();
      this.metricsTimer=setInterval(()=>this.sampleMetrics(),1000);
    }catch(error){await Promise.allSettled([input.close(),output.close()]);if(epoch===this.epoch)await this.disconnect(`Connection failed: ${String(error)}. Use Connect to retry.`,false);}
  }
  private async connectWheel(){
    if(!this.value.connected||!this.access||!this.input||this.wheelOpening)return;
    if(this.wheelInput?.state==='connected')return;
    if(this.wheelInput){const old=this.wheelInput;this.wheelInput=undefined;old.onmidimessage=null;this.jog.reset(false);void old.close().catch(()=>{});}
    const name=this.input.name!.replace(/ DAW Out$/i,' MIDI Out');
    const saved=this.remembered.wheel?.name===name?this.remembered.wheel:{id:'',name};
    const wheel=rememberedPort(this.access.inputs.values(),saved);
    if(!wheel){if(this.value.wheel!=='Waiting for matching MIDI Out (mod wheel).')this.update({wheel:'Waiting for matching MIDI Out (mod wheel).'});return;}
    const epoch=++this.wheelEpoch;this.wheelOpening=true;
    try{
      await wheel.open();
      if(epoch!==this.wheelEpoch||!this.value.connected||wheel.state!=='connected'){await wheel.close();return;}
      this.wheelInput=wheel;this.jog.reset(false);
      wheel.onmidimessage=event=>{if(event.data)this.receiveWheel(Array.from(event.data),event.timeStamp);};
      this.remembered={...this.remembered,wheel:{id:wheel.id,name:wheel.name!}};this.save();
      this.update({wheel:`Mod wheel linked: ${wheel.name}; awaiting CC1.`});
    }catch(error){if(epoch===this.wheelEpoch)this.update({wheel:`Mod wheel unavailable: ${String(error)}`});}
    finally{if(epoch===this.wheelEpoch)this.wheelOpening=false;}
  }
  receiveWheel(data:readonly number[],timestamp=performance.now()){
    if(!this.value.connected||this.wheelInput?.state!=='connected'||!this.enabled||data.length!==3||data[0]<0xb0||data[0]>0xbf||data[1]!==1||data.some(v=>!Number.isInteger(v))||data[2]<0||data[2]>127)return;
    this.counts.input++;this.counts.maxAge=Math.max(this.counts.maxAge,Math.max(0,performance.now()-timestamp));
    this.log('WHEEL IN',data);
    const status=`Mod wheel receiving CC1, channel ${data[0]-0xb0+1}.`;
    if(this.value.wheel!==status)this.update({wheel:status});
    this.jog.receive(data[2]);
  }
  private async closePorts() {
    this.closing=true;
    ++this.wheelEpoch;this.wheelOpening=false;this.jog.reset();
    this.controls.flush();this.controls.cancel();this.detents.clear();this.releaseCues();
    if(this.feedbackTimer!==undefined)clearTimeout(this.feedbackTimer);this.feedbackTimer=undefined;
    if(this.metricsTimer!==undefined)clearInterval(this.metricsTimer);this.metricsTimer=undefined;
    this.unsubscribe?.();this.unsubscribe=undefined;
    const input=this.input,output=this.output,wheel=this.wheelInput;this.input=undefined;this.output=undefined;this.wheelInput=undefined;
    if(wheel)wheel.onmidimessage=null;
    if(input)input.onmidimessage=null;
    if(output?.state==='connected'){try{output.send(launchkeyMode(false));this.log('OUT',launchkeyMode(false));}catch(error){this.diagnostic(`DAW mode release failed: ${String(error)}`);}}
    this.sent.clear();this.update({connected:false,receiving:false,wheel:'Mod wheel disconnected.'});
    const closed=await Promise.allSettled([input?.close(),output?.close(),wheel?.close()]);
    closed.forEach((result,i)=>{if(result.status==='rejected')this.diagnostic(`${i?'Output':'Input'} close failed: ${String(result.reason)}`);});
    if(input||output)this.diagnostic('Selected pair released.');
    this.closing=false;
  }
  async disconnect(status='Disconnected; automatic connection is off.',intentional=true) {++this.epoch;if(intentional){this.remembered={...this.remembered,enabled:false};this.save();}this.update({autoConnect:this.remembered.enabled,pending:false,status});await this.closePorts();}
  dispose() {if(this.access)this.access.onstatechange=null;void this.disconnect('Controller released.',false);this.flushLog();this.listeners.clear();}
  clearLog=()=>{if(this.logTimer!==undefined)clearTimeout(this.logTimer);this.logTimer=undefined;this.pendingMessages=[];this.update({messages:[]});};
  focus=(index:number)=>{
    if(![0,1,2,3,8].includes(index))return;
    if(index!==this.value.focus){this.controls.flush();this.jog.reset();this.detents.clear();this.releaseCues();this.update({focus:index});this.scheduleFeedback();}
    this.selectionDisplay(true);
  };
  get displayDiagnostic(){
    const permission=this.access?.sysexEnabled===true,gate=this.value.sysex;
    const state=!this.value.connected?'Disconnected':!permission||!gate?'Blocked: SysEx is not enabled on this connection':'SysEx enabled';
    return `${state}. Display commands sent: ${this.displayTx}. Stationary configured: ${this.displayConfigs.has(32)?'yes':'no'}; selection configured: ${this.displayConfigs.has(33)?'yes':'no'}. Last: ${this.displayLast}.${this.displayError?` Send error: ${this.displayError}`:''} Sent means the MIDI API accepted the command, not that the keyboard displayed it.`;
  }
  private send(key:string,packet:number[]) {
    if(!this.output||!this.value.connected)return;
    const signature=controllerHex(packet);if(this.sent.get(key)===signature)return;
    this.sent.set(key,signature);
    const display=packet[0]===0xf0&&(packet[6]===4||packet[6]===6);
    try{this.sending=true;this.output.send(packet);
      if(display){this.displayTx++;const target=packet[7]===32?'stationary':packet[7]===33?'selection':`parameter ${packet[7]}`;this.displayLast=`${target} ${packet[6]===4?(packet[8]===127?'trigger':`configure layout ${packet[8]}`):`text field ${packet[8]}`}`;if(packet[6]===4&&packet[8]>0&&packet[8]<127)this.displayConfigs.set(packet[7],packet[8]);}
      this.counts.output++;this.counts.bytes+=packet.length;if(packet[0]===0xf0)this.counts.sysex++;this.log('OUT',packet);}catch(error){if(display)this.displayError=String(error);void this.disconnect(`MIDI output failed: ${String(error)}. Use Connect to retry.`,false);}finally{this.sending=false;}
  }
  setDeckColors=(colors:readonly (readonly number[])[])=>{
    if(colors.length!==4||colors.some(rgb=>rgb.length!==3||rgb.some(v=>!Number.isFinite(v)||v<0||v>255)))return;
    if(JSON.stringify(colors)===JSON.stringify(this.deckColors))return;
    this.deckColors=colors.map(rgb=>[...rgb]);for(let i=0;i<4;i++)this.sent.delete(`select${i}`);this.scheduleFeedback();
  };
  private knobValues() {const s=this.engine.snapshot(),d=s.decks[this.value.focus];return this.value.focus===8?[s.masterSendA,s.masterFilter,s.masterSendB,s.masterEq[2],s.masterEq[1],s.masterEq[0],0,s.masterTrim]:d?[d.sendA,d.filter,d.sendB,d.eq[2],d.eq[1],d.eq[0],d.trim,s.masterTrim]:[];}
  private text(target:number,field:number,text:string) {this.send(`text${target}/${field}`,[0xf0,0,0x20,0x29,2,0x14,6,target,field,...Array.from(text.normalize('NFKD').replace(/[^\x20-\x7e]/g,'?').slice(0,32),c=>c.charCodeAt(0)),0xf7]);}
  private selectionText():readonly [string,string]{
    const deck=this.engine.snapshot().decks[this.value.focus];
    return this.value.focus===8?['Master','mix[flow]']: [`Deck ${deck?.letter??'ABCD'[this.value.focus]}`,deck?.track?.title?.trim()||'Empty deck'];
  }
  private selectionDisplay(temporary=false){
    if(!this.value.connected||!this.value.sysex)return;
    const [name,title]=this.selectionText();this.text(32,0,name);this.text(32,1,title);
    if(temporary){
      this.text(33,0,name);this.text(33,1,title);
      // A trigger is an event, not cached state: pressing the same selector repeats it.
      this.sent.delete('selection-display-trigger');
      this.send('selection-display-trigger',[0xf0,0,0x20,0x29,2,0x14,4,33,127,0xf7]);
    }
  }
  feedback() {
    if(!this.value.connected)return;this.counts.feedback++;
    const s=this.engine.snapshot();
    for(let i=0;i<9;i++) {
      const active=i<4||i===8;
      const selected=this.value.focus===i;
      if(i<4&&!selected&&this.value.sysex&&this.deckColors[i]){
        const rgb=this.deckColors[i].map(v=>Math.round(v/255*127*.35));
        this.send(`select${i}`,[0xf0,0,0x20,0x29,2,0x14,1,0x53,37+i,...rgb,0xf7]);
      }else {
        const dim=[10,50,38,22];
        this.send(`select${i}`,[0xb0,37+i,i<4?(selected?21:dim[i]):active?(selected?21:1):0]);
      }
    }
    if(this.modes.knobs===2||this.modes.knobs===1||this.modes.knobs===4)this.knobValues().forEach((value,i)=>{if(!(i===6&&this.value.focus===8)&&!this.controls.size){const [min,max]=ranges[i];this.send(`knob${i}`,[0xbf,21+i,Math.round((Math.max(min,Math.min(max,value))-min)/(max-min)*127)]);}});
    this.send('play-led',[0xb0,115,s.running?21:1]);this.send('stop-led',[0xb0,116,s.running?1:5]);
    const deck=s.decks[this.value.focus];
    if(this.modes.pads===2)for(let i=0;i<16;i++){
      let color=0;
      if(deck) {
        if(i===8)color=deck.playing?21:22;
        else if(i===9)color=deck.cueHeld?9:10;
        else if(i===10)color=deck.synced?21:22;
        else if(i===11||i===12)color=45;
        else if(i<4){
          const active=deck.status==='ready'&&(i===0||i===3)&&deck.loop?.enabled;
          const ink=this.deckColors[this.value.focus];
          if(this.value.sysex&&ink){
            this.send(`pad${i}`,[0xf0,0,0x20,0x29,2,0x14,1,0x43,96+i,...ink.map(v=>Math.round(v/255*127*(active?1:.35))),0xf7]);
            continue;
          }
          color=(active?[9,49,37,21]:[10,50,38,22])[this.value.focus];
        }
      }
      this.send(`pad${i}`,[0x90,i<8?96+i:112+i-8,color]);
    }
    if(this.value.sysex){
      this.selectionDisplay();
      for(let i=0;i<8;i++)this.text(21+i,0,i===6&&this.value.focus===8?'Unused':KNOBS[i]);
      for(let i=0;i<9;i++){
        // Numeric layout, automatic display on movement; no touch trigger.
        this.send(`fader-display${i}`,[0xf0,0,0x20,0x29,2,0x14,4,5+i,0x44,0xf7]);
        this.text(5+i,0,i<4?`Deck ${'ABCD'[i]} Level`:'Unused');
      }
    }
  }
  receive(data:readonly number[],timestamp=performance.now()) {
    if(!this.value.connected||!this.enabled||this.sending)return;
    this.counts.input++;
    if(data.length===1&&data[0]>=0xf8){this.counts.clock++;return;}
    this.counts.maxAge=Math.max(this.counts.maxAge,Math.max(0,performance.now()-timestamp));
    // Poly-aftertouch is unused: do not spend rendering/logging work on its stream.
    if((data[0]&0xf0)===0xa0)return;
    this.log('IN',data);
    const event=decodeLaunchkey(data);
    if(data.length===3&&((data[0]&0xf0)===0x80||(data[0]&0xf0)===0x90||(data[0]&0xf0)===0xb0&&data[1]>=37&&data[1]<=45))this.lastButtonInput=`IN ${controllerHex(data)} · ${event?.kind??'unhandled'}`;
    if(!event)return;
    if(!this.value.receiving){this.update({receiving:true,status:'Receiving Launchkey DAW input.'});this.scheduleFeedback();}
    if(event.kind==='mode'){this.controls.flush();this.jog.reset();this.detents.clear();this.releaseCues();if(event.index===29)this.modes.pads=event.value;if(event.index===30)this.modes.knobs=event.value;if(event.index===31){this.modes.faders=event.value;this.update({faderMode:event.value===1?'Volume confirmed.':`Mode ${event.value} reported; choose Volume for DAW faders.`});}this.sent.clear();this.scheduleFeedback();return;}
    const state=this.engine.snapshot(),commands=this.engine.commands,deck=state.decks[this.value.focus];
    if(event.kind==='focus'){const assigned=event.index<4||event.index===8;this.focus(event.index);this.update({selector:`Button ${event.index+1}: ${controllerHex(data)}${assigned?` → ${this.selectionText().join(' · ')}`:' received (unassigned).'}`});return;}
    if(event.kind==='pad'||event.kind==='play'||event.kind==='stop')this.jog.finish();
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
    if(event.kind==='fader'&&this.modes.faders===1){const value=event.value/127*100;if(event.index<4&&state.decks[event.index])commands.setDeck(state.decks[event.index].id,'gain',value);return;}
    if((event.kind==='knob'&&[1,2,4].includes(this.modes.knobs))||(event.kind==='relative'&&this.modes.knobs===5)){
      const i=event.index;if(i>=8||i===6&&this.value.focus===8)return;const [min,max]=ranges[i];
      // Device position feedback is not a new user change (including loopback ports).
      if(event.kind==='knob'&&this.sent.get(`knob${i}`)===controllerHex([0xbf,21+i,event.value]))return;
      // The hardware already holds this absolute position. Cache it before the
      // synchronous engine publish so feedback cannot reset a moving encoder.
      if(event.kind==='knob')this.sent.set(`knob${i}`,controllerHex([0xbf,21+i,event.value]));
      const current=this.knobValues()[i]??min;
      const value=this.detents.value(i,event.kind==='relative'?event.value:min+event.value/127*(max-min),current,min,max,event.kind==='relative');
      // A soft detent changes the app value, never the moving encoder's position.
      if(event.kind==='knob')this.sent.set(`knob${i}`,controllerHex([0xbf,21+i,Math.round((value-min)/(max-min)*127)]));
      if(value===current)return;
      if(i===7){commands.setMaster('masterTrim',value);return;}
      if(this.value.focus===8){if(i>=3&&i<=5)commands.setMasterEq(5-i,value);else commands.setMaster(i===0?'masterSendA':i===1?'masterFilter':i===2?'masterSendB':'masterTrim',value);}
      else if(deck){if(i>=3&&i<=5)commands.setDeckEq(deck.id,5-i,value);else commands.setDeck(deck.id,i===0?'sendA':i===1?'filter':i===2?'sendB':'trim',value);}
    }
  }
}
