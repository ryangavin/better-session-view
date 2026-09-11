import { expect, it, vi } from 'vitest';
import { initialMixer } from '../play/decks.ts';
import type { MixerEngine } from '../play/engine.ts';
import { decodeLaunchkey, LaunchkeyController, launchkeyMode, rememberedPort } from './launchkey.ts';
function setup(sysex=false,auto=false) {
  let state=initialMixer();state={...state,decks:state.decks.map(d=>({...d,status:'ready' as const}))};
  const listeners=new Set<()=>void>();
  const emit=()=>listeners.forEach(fn=>fn());
  const commands={
    setDeck:vi.fn((id:string,key:string,value:number)=>{state={...state,decks:state.decks.map(d=>d.id===id?{...d,[key]:value}:d)};emit();}),
    setMaster:vi.fn((key:string,value:number)=>{state={...state,[key]:value};emit();}),
    setMasterEq:vi.fn(),setDeckEq:vi.fn(),cueDeck:vi.fn(),setDeckPlaying:vi.fn(),setDeckSync:vi.fn(),setRunning:vi.fn(),stopAll:vi.fn(),beatJump:vi.fn(),quickLoop:vi.fn(),resizeLoop:vi.fn(),setDeckLoopEnabled:vi.fn(),
  };
  const engine={snapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},commands} as unknown as Pick<MixerEngine,'snapshot'|'subscribe'|'commands'>;
  const input={id:'in',name:'Launchkey MK4 61 DAW Out',state:'connected',open:vi.fn(async()=>{}),close:vi.fn(async()=>{}),onmidimessage:null} as unknown as MIDIInput;
  const output={id:'out',name:'Launchkey MK4 61 DAW In',state:'connected',open:vi.fn(async()=>{}),close:vi.fn(async()=>{}),send:vi.fn()} as unknown as MIDIOutput;
  const access={inputs:new Map([['in',input]]),outputs:new Map([['out',output]]),sysexEnabled:sysex,onstatechange:null} as unknown as MIDIAccess;
  const request=vi.fn(async()=>access);
  let saved=JSON.stringify({enabled:auto,sysex,input:{id:'in',name:input.name},output:{id:'out',name:output.name}});
  const storage={getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}};
  const controller=new LaunchkeyController(engine,request,storage);
  const connect=async()=>{await controller.scan(sysex);await controller.connect('in','out');};
  const receive=(data:number[])=>controller.receive(data);
  return {controller,commands,input,output,access,request,connect,receive,emit,listeners,storage,engine};
}
it('parses native faders, absolute/relative knobs, note pads, and ignores other channels/releases/malformed data',()=>{
  expect(decodeLaunchkey([0xbf,5,64])).toEqual({kind:'fader',index:0,value:64});
  expect(decodeLaunchkey([0xbf,85,63])).toEqual({kind:'relative',index:0,value:-1});
  expect(decodeLaunchkey([0x90,45,127])).toEqual({kind:'focus',index:8});
  expect(decodeLaunchkey([0x90,112,127])).toEqual({kind:'pad',index:8,down:true});
  for(const data of [[0xbf,5],[0xbf,5,128],[0xbf,5,NaN],[0xb0,5,64],[0x90,60,127],[0xa0,112,127]])expect(decodeLaunchkey(data)).toBeNull();
});
it('requires explicit scan and connection; initializes native mode without playing or SysEx',async()=>{
  const f=setup();expect(f.request).not.toHaveBeenCalled();expect(f.output.open).not.toHaveBeenCalled();
  await f.connect();expect(f.output.send).toHaveBeenCalledWith(launchkeyMode(true));
  expect(f.commands.setRunning).not.toHaveBeenCalled();
  expect(vi.mocked(f.output.send).mock.calls.some(([p])=>Array.from(p)[0]===0xf0)).toBe(false);
  f.controller.dispose();
});
it('routes gain, master focus, FX knobs and loaded-deck loop pads to application actions',async()=>{
  const f=setup();await f.connect();
  f.receive([0xbf,5,0]);expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a','gain',0);
  f.receive([0xbf,13,127]);await vi.waitFor(()=>expect(f.commands.setMaster).toHaveBeenCalled());expect(f.commands.setMaster).toHaveBeenLastCalledWith('master',100);
  f.receive([0x90,38,127]);f.receive([0xbf,21,127]);await vi.waitFor(()=>expect(f.commands.setDeck).toHaveBeenCalledWith('deck-b','sendA',100));expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-b','sendA',100);
  f.receive([0x90,115,127]);expect(f.commands.beatJump).toHaveBeenLastCalledWith('deck-b',-1);
  f.receive([0x90,96,127]);expect(f.commands.quickLoop).toHaveBeenCalledWith('deck-b');
  f.receive([0x90,45,127]);f.receive([0xbf,22,127]);await vi.waitFor(()=>expect(f.commands.setMaster).toHaveBeenCalledWith('masterSendB',100));expect(f.commands.setMaster).toHaveBeenLastCalledWith('masterSendB',100);
  f.receive([0x90,115,127]);expect(f.commands.beatJump).toHaveBeenCalledTimes(1);
  f.receive([0xbf,115,127]);expect(f.commands.setRunning).toHaveBeenCalledWith(true);
  f.receive([0xbf,116,127]);expect(f.commands.stopAll).toHaveBeenCalledOnce();f.controller.dispose();
});
it('respects hardware mode changes and uses the MK4 relative pivot, not MCU signed magnitude',async()=>{
  const f=setup();await f.connect();f.receive([0xb6,30,5]);f.receive([0xbf,85,65]);
  expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a','sendA',100/127);
  f.commands.setDeck.mockClear();f.receive([0xb6,31,6]);f.receive([0xbf,5,50]);expect(f.commands.setDeck).not.toHaveBeenCalled();f.controller.dispose();
});
it('does not feed output back into actions or resend unchanged state, and suppresses touched knob feedback',async()=>{
  const f=setup();vi.mocked(f.output.send).mockImplementation(data=>f.receive(Array.from(data)));await f.connect();
  vi.mocked(f.output.send).mockClear();f.emit();await new Promise(r=>setTimeout(r,60));
  expect(f.commands.setDeck).not.toHaveBeenCalled();expect(f.commands.beatJump).not.toHaveBeenCalled();expect(f.output.send).not.toHaveBeenCalled();
  f.receive([0xbe,21,127]);f.commands.setDeck('deck-a','sendA',70);expect(f.output.send).not.toHaveBeenCalledWith([0xbf,21,89]);
  f.receive([0xbe,21,0]);await vi.waitFor(()=>expect(f.output.send).toHaveBeenCalledWith([0xbf,21,89]));f.controller.dispose();
});
it('disconnects both ports, drops late input, removes subscription, and explicitly reconnects',async()=>{
  const f=setup();await f.connect();Object.defineProperty(f.input,'state',{value:'disconnected',configurable:true});
  f.access.onstatechange?.({} as MIDIConnectionEvent);await Promise.resolve();
  expect(f.controller.snapshot().connected).toBe(false);expect(f.input.onmidimessage).toBeNull();expect(f.listeners.size).toBe(0);
  f.receive([0xbf,5,0]);expect(f.commands.setDeck).not.toHaveBeenCalled();expect(f.output.close).toHaveBeenCalled();
  Object.defineProperty(f.input,'state',{value:'connected'});await f.controller.connect('in','out');expect(f.controller.snapshot().connected).toBe(true);
  f.controller.setEnabled(false);expect(f.controller.snapshot().connected).toBe(false);expect(f.output.send).toHaveBeenCalledWith(launchkeyMode(false));f.controller.dispose();
});
it('cancels an outstanding port open without activating DAW mode',async()=>{
  const f=setup();await f.controller.scan(false);let resolve!:()=>void;
  vi.mocked(f.input.open).mockImplementation(()=>new Promise(r=>{resolve=()=>r(f.input);}));
  const connecting=f.controller.connect('in','out');await Promise.resolve();await Promise.resolve();
  await f.controller.disconnect();resolve();await connecting;
  expect(f.output.send).not.toHaveBeenCalledWith(launchkeyMode(true));expect(f.controller.snapshot().connected).toBe(false);f.controller.dispose();
});
it('accepts the hardware accelerated absolute stream without echoing old positions, but still follows mouse edits',async()=>{
  const f=setup();await f.connect();vi.mocked(f.output.send).mockClear();
  // Real capture contains +4 steps followed by backward resets when host echoed CC15.
  for(const value of [0x64,0x68,0x6c,0x70,0x74])f.receive([0xbf,0x15,value]);
  await vi.waitFor(()=>expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a','sendA',0x74/127*100));
  expect(vi.mocked(f.output.send).mock.calls.filter(([p])=>Array.from(p)[0]===0xbf)).toHaveLength(0);
  f.commands.setDeck('deck-a','sendA',30);await vi.waitFor(()=>expect(f.output.send).toHaveBeenCalledWith([0xbf,0x15,38]));
  expect(f.controller.snapshot().status).toBe('Receiving Launchkey DAW input.');f.controller.dispose();
});
it('batches packet log notifications without delaying knob commands',async()=>{
  vi.useFakeTimers();const f=setup();await f.connect();f.controller.clearLog();
  f.receive([0xbf,0x15,50]);expect(f.commands.setDeck).toHaveBeenCalledWith('deck-a','sendA',50/127*100);
  expect(f.controller.snapshot().messages.some(m=>m.startsWith('IN'))).toBe(false);
  vi.advanceTimersByTime(50);expect(f.controller.snapshot().messages).toContain('IN BF 15 32');
  f.controller.dispose();vi.useRealTimers();
});
it('restores a successful pair in Play and reconnects on return without starting audio',async()=>{
  const f=setup(false,true);f.controller.setEnabled(true);
  await vi.waitFor(()=>expect(f.controller.snapshot().connected).toBe(true));
  expect(f.commands.setRunning).not.toHaveBeenCalled();
  Object.defineProperty(f.input,'state',{value:'disconnected',configurable:true});f.access.onstatechange?.({} as MIDIConnectionEvent);
  await vi.waitFor(()=>expect(f.controller.snapshot().connected).toBe(false));
  Object.defineProperty(f.input,'state',{value:'connected'});f.access.onstatechange?.({} as MIDIConnectionEvent);
  await vi.waitFor(()=>expect(f.controller.snapshot().connected).toBe(true));
  expect(f.commands.setRunning).not.toHaveBeenCalled();f.controller.dispose();
});
it('persists explicit Disconnect as opt-out across a new app instance',async()=>{
  const f=setup(true,true);f.controller.setEnabled(true);await vi.waitFor(()=>expect(f.controller.snapshot().connected).toBe(true));
  await f.controller.disconnect();f.controller.setEnabled(false);f.controller.setEnabled(true);
  const next=new LaunchkeyController(f.engine,f.request,f.storage);next.setEnabled(true);
  expect(next.snapshot().autoConnect).toBe(false);expect(next.snapshot().sysex).toBe(true);expect(f.request).toHaveBeenCalledTimes(1);
  next.setAutoConnect(true);await vi.waitFor(()=>expect(next.snapshot().connected).toBe(true));next.dispose();f.controller.dispose();
});
it('uses a unique exact name if IDs changed, but does not choose an ambiguous or unrelated device',()=>{
  const saved={id:'old',name:'Launchkey MK4 61 DAW Out'},one={id:'new',name:saved.name,state:'connected'};
  expect(rememberedPort([one],saved)).toBe(one);
  expect(rememberedPort([one,{...one,id:'other'}],saved)).toBeUndefined();
  expect(rememberedPort([{...one,name:'Model16'}],saved)).toBeUndefined();
});
it('reports denied access without retrying on repeated Play effects',async()=>{
  const f=setup(false,true);f.request.mockRejectedValue(new Error('Permission denied'));
  f.controller.setEnabled(true);await vi.waitFor(()=>expect(f.controller.snapshot().pending).toBe(false));
  f.controller.setEnabled(true);f.controller.setEnabled(false);f.controller.setEnabled(true);
  expect(f.request).toHaveBeenCalledTimes(1);f.controller.dispose();
});
it('orders the selected-deck bottom row as Play, Cue, Sync, back, forward and releases the owning cue',async()=>{
  const f=setup();await f.connect();f.controller.focus(1);
  f.receive([0x90,112,45]);expect(f.commands.setDeckPlaying).toHaveBeenLastCalledWith('deck-b',true);
  f.receive([0x90,113,127]);expect(f.commands.cueDeck).toHaveBeenLastCalledWith('deck-b',true);
  f.receive([0x90,113,127]);expect(f.commands.cueDeck).toHaveBeenCalledTimes(1);
  // Cue can already be playing: Play must latch, never request pause.
  f.engine.snapshot().decks[1].playing=true;
  f.receive([0x90,112,127]);expect(f.commands.setDeckPlaying).toHaveBeenLastCalledWith('deck-b',true);
  f.receive([0x90,113,0]);expect(f.commands.cueDeck).toHaveBeenLastCalledWith('deck-b',false);
  f.receive([0x90,114,127]);expect(f.commands.setDeckSync).toHaveBeenLastCalledWith('deck-b',true);
  f.receive([0x90,115,127]);expect(f.commands.beatJump).toHaveBeenLastCalledWith('deck-b',-1);
  f.receive([0x90,116,127]);expect(f.commands.beatJump).toHaveBeenLastCalledWith('deck-b',1);
  f.receive([0x90,113,127]);f.receive([0x80,113,10]);expect(f.commands.cueDeck).toHaveBeenLastCalledWith('deck-b',false);
  f.receive([0x90,113,127]);f.controller.focus(0);expect(f.commands.cueDeck).toHaveBeenLastCalledWith('deck-b',false);
  f.receive([0x90,113,0]);expect(f.commands.cueDeck).not.toHaveBeenCalledWith('deck-a',false);
  f.receive([0x90,113,127]);await f.controller.disconnect();expect(f.commands.cueDeck).toHaveBeenLastCalledWith('deck-a',false);f.controller.dispose();
});
it('keeps paused Play/Cue green/orange, refreshes colors on mode return, and leaves Master pads inactive',async()=>{
  vi.useFakeTimers();const f=setup();await f.connect();
  expect(f.output.send).toHaveBeenCalledWith([0x90,112,22]);expect(f.output.send).toHaveBeenCalledWith([0x90,113,10]);
  f.engine.snapshot().decks[0].playing=true;f.engine.snapshot().decks[0].cueHeld=true;f.emit();await vi.advanceTimersByTimeAsync(50);
  expect(f.output.send).toHaveBeenCalledWith([0x90,112,21]);expect(f.output.send).toHaveBeenCalledWith([0x90,113,9]);
  vi.mocked(f.output.send).mockClear();f.receive([0xb6,29,2]);await vi.advanceTimersByTimeAsync(50);
  expect(f.output.send).toHaveBeenCalledWith([0x90,112,21]);
  f.controller.focus(8);await vi.advanceTimersByTimeAsync(50);expect(f.output.send).toHaveBeenCalledWith([0x90,112,0]);
  const presses=f.commands.setDeckPlaying.mock.calls.length;f.receive([0x90,112,127]);expect(f.commands.setDeckPlaying).toHaveBeenCalledTimes(presses);
  f.controller.dispose();vi.useRealTimers();
});
it('drops realtime and unused aftertouch cheaply without logging or application actions',async()=>{
  const f=setup();await f.connect();f.controller.clearLog();
  for(let i=0;i<1000;i++){f.receive([0xf8]);f.receive([0xa0,96,50]);}
  expect(f.controller.snapshot().messages).toEqual([]);expect(f.commands.setDeck).not.toHaveBeenCalled();expect(f.commands.beatJump).not.toHaveBeenCalled();f.controller.dispose();
});
it('coalesces a burst of app-state feedback to the newest position instead of sending a MIDI backlog',async()=>{
  const f=setup();await f.connect();vi.mocked(f.output.send).mockClear();
  for(let i=0;i<1000;i++)f.commands.setDeck('deck-a','sendA',i%101);
  expect(f.output.send).not.toHaveBeenCalled();await new Promise(r=>setTimeout(r,60));
  const positions=vi.mocked(f.output.send).mock.calls.map(([p])=>Array.from(p)).filter(p=>p[0]===0xbf&&p[1]===21);
  expect(positions).toEqual([[0xbf,21,Math.round((999%101)/100*127)]]);f.controller.dispose();
});
