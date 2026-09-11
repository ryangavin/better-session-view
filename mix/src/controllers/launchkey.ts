import type { MixerEngine } from '../play/engine.ts';

// Novation Launchkey MK4 Programmer's Reference, DAW interface (not MCU/HUI).
export const launchkeyMode = (enabled: boolean) => [0x9f, 0x0c, enabled ? 127 : 0];
export const controllerHex = (data: readonly number[]) => data.map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(' ');
export const KNOBS = ['Send A', 'Send B', 'Filter', 'EQ low', 'EQ mid', 'EQ high', 'Trim', 'Unused'] as const;
const ranges = [[0,100],[0,100],[-100,100],[-24,12],[-24,12],[-24,12],[-12,12]];
export type LaunchkeyEvent = {kind:'fader'|'knob'|'relative'; index:number; value:number} | {kind:'focus'; index:number} | {kind:'pad'; index:number} | {kind:'play'|'stop'} | {kind:'mode'; index:number; value:number};
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
  if(status === 0x90 && value > 0) {
    if(key >= 37 && key <= 45) return {kind:'focus',index:key-37};
    if(key >= 96 && key <= 103) return {kind:'pad',index:key-96};
    if(key >= 112 && key <= 119) return {kind:'pad',index:key-112+8};
  }
  return null;
}
export interface ControllerStatus {
  connected: boolean; pending: boolean; status: string; focus: number; sysex: boolean;
  inputs: readonly {id:string;name:string}[]; outputs: readonly {id:string;name:string}[];
  messages: readonly string[];
}
const portName = (port: MIDIPort) => /Launchkey.*MK4.*DAW/i.test(port.name ?? '');
const identity = (port: MIDIPort) => (port.name ?? '').replace(/\s+(In|Out)$/i,'');
/** Native MK4 connection is opt-in. A controller focus does not select a Prep song. */
export class LaunchkeyController {
  private value: ControllerStatus = {connected:false,pending:false,status:'Disconnected. Choose the Launchkey DAW pair.',focus:0,sysex:false,inputs:[],outputs:[],messages:[]};
  private listeners = new Set<() => void>();
  private access?: MIDIAccess;
  private input?: MIDIInput;
  private output?: MIDIOutput;
  private unsubscribe?: () => void;
  private epoch = 0;
  private enabled = true;
  private sent = new Map<string,string>();
  private touched = new Set<number>();
  private logTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingMessages: string[] = [];
  private modes = {pads:2,knobs:2,faders:1};
  snapshot = () => this.value;
  subscribe = (fn: () => void) => {this.listeners.add(fn); return () => {this.listeners.delete(fn);};};
  constructor(private engine: Pick<MixerEngine,'snapshot'|'subscribe'|'commands'>, private request = (sysex:boolean) => navigator.requestMIDIAccess({sysex})) {}
  private update(patch: Partial<ControllerStatus>) {
    if(patch.status && patch.status!==this.value.status)patch.messages=[`STATUS ${patch.status}`,...this.value.messages].slice(0,80);
    this.value={...this.value,...patch};this.listeners.forEach(fn=>fn());
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
  setEnabled(enabled:boolean) {this.enabled=enabled;if(!enabled)void this.disconnect('Disconnected: switch to Play before connecting.');}
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
        if(this.value.connected && (this.input?.state!=='connected'||this.output?.state!=='connected'))void this.disconnect('Launchkey disconnected. Reconnect explicitly when it returns.');
      };
      access.onstatechange=refresh;refresh();
      this.update({sysex:access.sysexEnabled,pending:false,status:this.value.inputs.length&&this.value.outputs.length?'Launchkey DAW ports found. Click Connect Launchkey.':'No connected Launchkey MK4 DAW pair found. See detected ports below.'});
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
      this.input=input;this.output=output;this.sent.clear();this.modes={pads:2,knobs:2,faders:1};
      input.onmidimessage=event=>{if(event.data)this.receive(Array.from(event.data));};
      this.update({connected:true,pending:false,status:'MIDI ports open; DAW mode requested. Waiting for Launchkey input.'});
      this.send('mode',launchkeyMode(true));
      this.send('pads-mode',[0xb6,29,2]);this.send('knobs-mode',[0xb6,30,2]);this.send('faders-mode',[0xb6,31,1]);
      if(this.value.sysex){this.send('display-config',[0xf0,0,0x20,0x29,2,0x14,4,32,1,0xf7]);}
      if(!this.value.connected)return;
      this.unsubscribe=this.engine.subscribe(()=>this.feedback());this.feedback();
    }catch(error){await Promise.allSettled([input.close(),output.close()]);if(epoch===this.epoch)await this.disconnect(`Connection failed: ${String(error)}`);}
  }
  private async closePorts() {
    this.unsubscribe?.();this.unsubscribe=undefined;
    const input=this.input,output=this.output;this.input=undefined;this.output=undefined;
    if(input)input.onmidimessage=null;
    if(output?.state==='connected'){try{output.send(launchkeyMode(false));this.log('OUT',launchkeyMode(false));}catch(error){this.diagnostic(`DAW mode release failed: ${String(error)}`);}}
    this.sent.clear();this.touched.clear();this.update({connected:false});
    const closed=await Promise.allSettled([input?.close(),output?.close()]);
    closed.forEach((result,i)=>{if(result.status==='rejected')this.diagnostic(`${i?'Output':'Input'} close failed: ${String(result.reason)}`);});
    if(input||output)this.diagnostic('Selected pair released.');
  }
  async disconnect(status='Disconnected; Launchkey returned to standalone mode.') {++this.epoch;this.update({pending:false,status});await this.closePorts();}
  dispose() {if(this.access)this.access.onstatechange=null;void this.disconnect();this.flushLog();this.listeners.clear();}
  clearLog=()=>{if(this.logTimer!==undefined)clearTimeout(this.logTimer);this.logTimer=undefined;this.pendingMessages=[];this.update({messages:[]});};
  focus=(index:number)=>{if(![0,1,2,3,8].includes(index))return;this.update({focus:index});this.sent.clear();this.feedback();};
  private send(key:string,packet:number[]) {
    if(!this.output||!this.value.connected)return;
    const signature=controllerHex(packet);if(this.sent.get(key)===signature)return;
    this.sent.set(key,signature);
    try{this.output.send(packet);this.log('OUT',packet);}catch(error){void this.disconnect(`MIDI output failed: ${String(error)}`);}
  }
  private knobValues() {const s=this.engine.snapshot(),d=s.decks[this.value.focus];return this.value.focus===8?[s.masterSendA,s.masterSendB,s.masterFilter,...s.masterEq,s.masterTrim]:d?[d.sendA,d.sendB,d.filter,...d.eq,d.trim]:[];}
  private text(target:number,field:number,text:string) {this.send(`text${target}/${field}`,[0xf0,0,0x20,0x29,2,0x14,6,target,field,...Array.from(text.normalize('NFKD').replace(/[^\x20-\x7e]/g,'?').slice(0,32),c=>c.charCodeAt(0)),0xf7]);}
  feedback() {
    const s=this.engine.snapshot();
    for(let i=0;i<9;i++) {
      const active=i<4||i===8;
      this.send(`select${i}`,[0x90,37+i,active?(this.value.focus===i?21:1):0]);
    }
    if(this.modes.knobs===2||this.modes.knobs===1||this.modes.knobs===4)this.knobValues().forEach((value,i)=>{if(!this.touched.has(21+i)){const [min,max]=ranges[i];this.send(`knob${i}`,[0xbf,21+i,Math.round((Math.max(min,Math.min(max,value))-min)/(max-min)*127)]);}});
    this.send('play-led',[0xb0,115,s.running?21:1]);this.send('stop-led',[0xb0,116,s.running?1:5]);
    const deck=s.decks[this.value.focus];
    if(this.modes.pads===2)for(let i=0;i<16;i++)this.send(`pad${i}`,[0x90,i<8?96+i:112+i-8,deck?.status==='ready'?(i===8&&deck.loop?.enabled?21:i<2?45:i===8||i===9||i===10||i===11?13:0):0]);
    if(this.value.sysex){this.text(32,0,'mix[flow]');this.text(32,1,this.value.focus===8?'Master FX':`Deck ${deck?.letter??'?'} FX`);for(let i=0;i<8;i++){this.text(21+i,0,KNOBS[i]);}}
  }
  receive(data:readonly number[]) {
    if(!this.value.connected||!this.enabled)return;
    this.log('IN',data);
    if(data.length===3&&data[0]===0xbe){if(data[2]===127)this.touched.add(data[1]);else{this.touched.delete(data[1]);this.sent.delete(`knob${data[1]-21}`);this.feedback();}return;}
    if([...this.sent.values()].includes(controllerHex(data)))return;
    const event=decodeLaunchkey(data);if(!event)return;
    if(this.value.status.includes('Waiting for Launchkey input'))this.update({status:'Receiving Launchkey DAW input.'});
    if(event.kind==='mode'){if(event.index===29)this.modes.pads=event.value;if(event.index===30)this.modes.knobs=event.value;if(event.index===31)this.modes.faders=event.value;this.sent.clear();this.feedback();return;}
    const state=this.engine.snapshot(),commands=this.engine.commands,deck=state.decks[this.value.focus];
    if(event.kind==='focus'){this.focus(event.index);return;}
    if(event.kind==='play'){if(!state.running)commands.setRunning(true);return;}
    if(event.kind==='stop'){commands.stopAll();return;}
    if(event.kind==='fader'&&this.modes.faders===1){const value=event.value/127*100;if(event.index===8)commands.setMaster('master',value);else if(event.index<4&&state.decks[event.index])commands.setDeck(state.decks[event.index].id,'gain',value);return;}
    if((event.kind==='knob'&&[1,2,4].includes(this.modes.knobs))||(event.kind==='relative'&&this.modes.knobs===5)){
      const i=event.index;if(i>=7)return;const [min,max]=ranges[i];
      // Device position feedback is not a new user change (including loopback ports).
      if(event.kind==='knob'&&this.sent.get(`knob${i}`)===controllerHex(data))return;
      // The hardware already holds this absolute position. Cache it before the
      // synchronous engine publish so feedback cannot reset a moving encoder.
      if(event.kind==='knob')this.sent.set(`knob${i}`,controllerHex(data));
      const value=event.kind==='relative'?Math.max(min,Math.min(max,(this.knobValues()[i]??min)+event.value*(max-min)/127)):min+event.value/127*(max-min);
      if(this.value.focus===8){if(i>=3&&i<=5)commands.setMasterEq(i-3,value);else commands.setMaster(i===0?'masterSendA':i===1?'masterSendB':i===2?'masterFilter':'masterTrim',value);}
      else if(deck){if(i>=3&&i<=5)commands.setDeckEq(deck.id,i-3,value);else commands.setDeck(deck.id,i===0?'sendA':i===1?'sendB':i===2?'filter':'trim',value);}
    }
    if(event.kind==='pad'&&this.modes.pads===2&&deck?.status==='ready'){
      if(event.index===0||event.index===1)commands.beatJump?.(deck.id,event.index===0?-1:1);
      if(event.index===8)commands.quickLoop?.(deck.id);
      if(event.index===9)commands.resizeLoop?.(deck.id,.5);
      if(event.index===10)commands.resizeLoop?.(deck.id,2);
      if(event.index===11)commands.setDeckLoopEnabled?.(deck.id,!deck.loop?.enabled);
    }
  }
}
