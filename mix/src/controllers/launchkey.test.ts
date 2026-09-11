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
    moveDeck:vi.fn(),setMasterEq:vi.fn(),setDeckEq:vi.fn(),cueDeck:vi.fn(),setDeckPlaying:vi.fn(),setDeckSync:vi.fn(),setRunning:vi.fn(),stopAll:vi.fn(),beatJump:vi.fn(),quickLoop:vi.fn(),resizeLoop:vi.fn(),setDeckLoopEnabled:vi.fn(),
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
it('parses native faders, absolute/relative knobs, note pads, and ignores unrelated IDs/releases/malformed data',()=>{
  expect(decodeLaunchkey([0xbf,5,64])).toEqual({kind:'fader',index:0,value:64});
  expect(decodeLaunchkey([0xbf,85,63])).toEqual({kind:'relative',index:0,value:-1});
  expect(decodeLaunchkey([0xbf,45,127])).toEqual({kind:'focus',index:8});
  expect(decodeLaunchkey([0x90,112,127])).toEqual({kind:'pad',index:8,down:true});
  for(const data of [[0xbf,5],[0xbf,5,128],[0xbf,5,NaN],[0x1bf,5,64],[0x90,60,127],[0xa0,112,127]])expect(decodeLaunchkey(data)).toBeNull();
});
it('requires explicit scan and connection; initializes native mode without playing or SysEx',async()=>{
  const f=setup();expect(f.request).not.toHaveBeenCalled();expect(f.output.open).not.toHaveBeenCalled();
  await f.connect();expect(f.output.send).toHaveBeenCalledWith(launchkeyMode(true));
  expect(f.output.send).toHaveBeenCalledWith([0xb6,71,0]);
  expect(f.commands.setRunning).not.toHaveBeenCalled();
  expect(vi.mocked(f.output.send).mock.calls.some(([p])=>Array.from(p)[0]===0xf0)).toBe(false);
  f.controller.dispose();
});
it('routes gain, master focus, FX knobs and loaded-deck loop pads to application actions',async()=>{
  const f=setup();await f.connect();
  f.receive([0xbf,5,0]);expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a','gain',0);
  f.receive([0xbf,13,127]);expect(f.commands.setMaster).not.toHaveBeenCalled();
  f.receive([0xbf,38,127]);f.receive([0xbf,21,127]);await vi.waitFor(()=>expect(f.commands.setDeck).toHaveBeenCalledWith('deck-b','sendA',100));expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-b','sendA',100);
  f.receive([0x90,115,127]);expect(f.commands.beatJump).toHaveBeenLastCalledWith('deck-b',-1);
  f.receive([0x90,96,127]);expect(f.commands.quickLoop).toHaveBeenCalledWith('deck-b');
  f.receive([0xbf,45,127]);f.receive([0xbf,23,127]);await vi.waitFor(()=>expect(f.commands.setMaster).toHaveBeenCalledWith('masterSendB',100));expect(f.commands.setMaster).toHaveBeenLastCalledWith('masterSendB',100);
  f.receive([0x90,115,127]);expect(f.commands.beatJump).toHaveBeenCalledTimes(1);
  f.receive([0xbf,115,127]);expect(f.commands.setRunning).toHaveBeenCalledWith(true);
  f.receive([0xbf,116,127]);expect(f.commands.stopAll).toHaveBeenCalledOnce();f.controller.dispose();
});
it('respects hardware mode changes and uses the MK4 relative pivot, not MCU signed magnitude',async()=>{
  const f=setup();await f.connect();f.receive([0xb6,30,5]);f.receive([0xbf,85,65]);
  expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a','sendA',100/127);
  f.commands.setDeck.mockClear();f.receive([0xb6,31,6]);f.receive([0xbf,5,50]);expect(f.commands.setDeck).not.toHaveBeenCalled();f.controller.dispose();
});
it('does not feed output back into actions or resend unchanged state',async()=>{
  const f=setup();vi.mocked(f.output.send).mockImplementation(data=>f.receive(Array.from(data)));await f.connect();
  vi.mocked(f.output.send).mockClear();f.emit();await new Promise(r=>setTimeout(r,60));
  expect(f.commands.setDeck).not.toHaveBeenCalled();expect(f.commands.beatJump).not.toHaveBeenCalled();expect(f.output.send).not.toHaveBeenCalled();
  f.controller.dispose();
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


it('matches FX A, Filter, FX B for deck/master input, feedback and display labels',async()=>{
  vi.useFakeTimers();const f=setup(true);await f.connect();
  for(const focus of [0,8]) {
    f.controller.focus(focus);
    const keys=focus===8?['masterSendA','masterFilter','masterSendB']:['sendA','filter','sendB'];
    for(let i=0;i<3;i++){
      f.receive([0xbf,21+i,127]);await vi.advanceTimersByTimeAsync(20);
      if(focus===8)expect(f.commands.setMaster).toHaveBeenLastCalledWith(keys[i],100);
      else expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a',keys[i],100);
      f.receive([0xbf,21+i,0]);await vi.advanceTimersByTimeAsync(20);
      if(focus===8)expect(f.commands.setMaster).toHaveBeenLastCalledWith(keys[i],i===1?-100:0);
      else expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a',keys[i],i===1?-100:0);
    }
    if(focus===8){f.commands.setMaster('masterSendA',25);f.commands.setMaster('masterFilter',0);f.commands.setMaster('masterSendB',75);}
    else{f.commands.setDeck('deck-a','sendA',25);f.commands.setDeck('deck-a','filter',0);f.commands.setDeck('deck-a','sendB',75);}
    vi.mocked(f.output.send).mockClear();await vi.advanceTimersByTimeAsync(50);
    expect(f.output.send).toHaveBeenCalledWith([0xbf,21,32]);expect(f.output.send).toHaveBeenCalledWith([0xbf,22,64]);expect(f.output.send).toHaveBeenCalledWith([0xbf,23,95]);
    // Relative filter has a bipolar range and reads its own current center.
    f.receive([0xb6,30,5]);f.receive([0xbf,86,65]);await vi.advanceTimersByTimeAsync(20);
    if(focus===8)expect(f.engine.snapshot().masterFilter).toBe(0);
    else expect(f.engine.snapshot().decks[0].filter).toBe(0);
    f.receive([0xb6,30,2]);await vi.advanceTimersByTimeAsync(50);
  }
  for(const [i,label] of ['FX A','Filter','FX B'].entries())expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,6,21+i,0,...Array.from(label,c=>c.charCodeAt(0)),0xf7]);
  f.controller.dispose();vi.useRealTimers();
});


it('orders Low/Mid/High/deck Trim on 4–7 and always addresses Master Trim on knob 8',async()=>{
  vi.useFakeTimers();const f=setup(true);await f.connect();
  for(const focus of [0,8]){
    f.controller.focus(focus);await vi.advanceTimersByTimeAsync(50);
    for(let i=3;i<6;i++){
      f.receive([0xbf,21+i,127]);await vi.advanceTimersByTimeAsync(20);
      if(focus===8)expect(f.commands.setMasterEq).toHaveBeenLastCalledWith(5-i,12);
      else expect(f.commands.setDeckEq).toHaveBeenLastCalledWith('deck-a',5-i,12);
    }
    for(const command of Object.values(f.commands))command.mockClear();
    f.receive([0xbf,27,127]);await vi.advanceTimersByTimeAsync(20);
    if(focus===8)expect(Object.values(f.commands).every(fn=>fn.mock.calls.length===0)).toBe(true);
    else expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-a','trim',12);
    f.receive([0xbf,28,127]);await vi.advanceTimersByTimeAsync(20);
    expect(f.commands.setMaster).toHaveBeenLastCalledWith('masterTrim',12);
    f.receive([0xb6,30,5]);f.receive([0xbf,92,63]);await vi.advanceTimersByTimeAsync(20);
    expect(f.commands.setMaster).toHaveBeenLastCalledWith('masterTrim',12-36/127);
    const state=f.engine.snapshot();state.masterTrim=0;
    if(focus===8)state.masterEq=[-24,-12,0];else{state.decks[0].eq=[-24,-12,0];state.decks[0].trim=-12;}
    vi.mocked(f.output.send).mockClear();f.receive([0xb6,30,2]);await vi.advanceTimersByTimeAsync(50);
    for(const [cc,value] of [[24,85],[25,42],[26,0],[28,85]])expect(f.output.send).toHaveBeenCalledWith([0xbf,cc,value]);
    if(focus===8)expect(vi.mocked(f.output.send).mock.calls.some(([p])=>{const bytes=Array.from(p);return bytes[0]===0xbf&&bytes[1]===27;})).toBe(false);
    else expect(f.output.send).toHaveBeenCalledWith([0xbf,27,42]);
    for(const [i,label] of ['EQ low','EQ mid','EQ high',focus===8?'Unused':'Trim','Master Trim'].entries())expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,6,24+i,0,...Array.from(label,c=>c.charCodeAt(0)),0xf7]);
  }
  f.controller.dispose();vi.useRealTimers();
});

it('snaps an incoming filter near neutral without feeding a reset back into the encoder',async()=>{
  vi.useFakeTimers();const f=setup();await f.connect();f.commands.setDeck('deck-a','filter',10);await vi.advanceTimersByTimeAsync(50);
  vi.mocked(f.output.send).mockClear();f.receive([0xbf,22,65]);await vi.advanceTimersByTimeAsync(60);
  expect(f.engine.snapshot().decks[0].filter).toBe(0);
  expect(vi.mocked(f.output.send).mock.calls.some(([p])=>Array.from(p)[0]===0xbf)).toBe(false);
  f.receive([0xbf,22,69]);await vi.advanceTimersByTimeAsync(20);expect(f.engine.snapshot().decks[0].filter).toBeGreaterThan(0);
  f.controller.dispose();vi.useRealTimers();
});

it('opens only the matching standard MIDI input for wheel CC1 and reconnects it without interrupting DAW controls',async()=>{
  const f=setup();const wheel={id:'wheel',name:'Launchkey MK4 61 MIDI Out',state:'connected',open:vi.fn(async()=>{}),close:vi.fn(async()=>{}),onmidimessage:null} as unknown as MIDIInput;
  (f.access.inputs as unknown as Map<string,MIDIInput>).set('wheel',wheel);
  await f.connect();await vi.waitFor(()=>expect(wheel.onmidimessage).not.toBeNull());
  expect(JSON.parse(f.storage.getItem()).wheel).toEqual({id:'wheel',name:wheel.name});
  f.controller.receiveWheel([0x90,60,127]);f.controller.receiveWheel([0xb0,7,100]);expect(f.commands.moveDeck).not.toHaveBeenCalled();
  f.controller.receiveWheel([0xb0,1,50]);expect(f.commands.moveDeck).not.toHaveBeenCalled();f.controller.receiveWheel([0xb0,1,60]);
  expect(f.commands.moveDeck).toHaveBeenLastCalledWith('deck-a','move',40/127);
  expect(f.controller.snapshot().wheel).toContain('channel 1');expect(f.commands.setDeckPlaying).not.toHaveBeenCalled();
  f.controller.focus(1);expect(f.commands.moveDeck).toHaveBeenLastCalledWith('deck-a','commit');
  const calls=f.commands.moveDeck.mock.calls.length;f.controller.receiveWheel([0xb0,1,70]);expect(f.commands.moveDeck).toHaveBeenCalledTimes(calls);
  Object.assign(wheel,{state:'disconnected'});f.access.onstatechange!({} as MIDIConnectionEvent);await vi.waitFor(()=>expect(f.controller.snapshot().wheel).toContain('Waiting'));
  expect(f.controller.snapshot().connected).toBe(true);expect(f.output.close).not.toHaveBeenCalled();
  Object.assign(wheel,{state:'connected'});f.access.onstatechange!({} as MIDIConnectionEvent);await vi.waitFor(()=>expect(wheel.onmidimessage).not.toBeNull());
  await f.controller.disconnect();expect(wheel.onmidimessage).toBeNull();expect(wheel.close).toHaveBeenCalled();f.controller.dispose();
});
it('selects and lights empty decks without loading/playing, and keeps focus when a track arrives',async()=>{
  vi.useFakeTimers();const f=setup(true);f.engine.snapshot().decks.forEach(d=>{d.status='empty';});await f.connect();
  f.receive([0xbf,39,127]);await vi.advanceTimersByTimeAsync(50);expect(f.controller.snapshot().focus).toBe(2);
  expect(f.output.send).toHaveBeenCalledWith([0xb0,39,21]);expect(f.output.send).toHaveBeenCalledWith([0x90,112,22]);
  f.receive([0xbf,21,127]);expect(f.commands.setDeck).toHaveBeenLastCalledWith('deck-c','sendA',100);
  f.receive([0x90,112,127]);f.receive([0x90,113,127]);expect(f.commands.setDeckPlaying).not.toHaveBeenCalled();expect(f.commands.cueDeck).not.toHaveBeenCalled();
  f.engine.snapshot().decks[2].status='ready';f.emit();await vi.advanceTimersByTimeAsync(50);expect(f.controller.snapshot().focus).toBe(2);
  expect(f.output.send).toHaveBeenCalledWith([0x90,112,22]);f.controller.dispose();vi.useRealTimers();
});

it('leaves the ninth fader unassigned while its button still selects Master',async()=>{
  const f=setup();await f.connect();
  for(const value of [0,64,127])f.receive([0xbf,13,value]);
  await vi.waitFor(()=>expect(f.controller.snapshot().connected).toBe(true));
  expect(f.commands.setMaster).not.toHaveBeenCalled();expect(f.engine.snapshot().master).toBe(100);
  f.receive([0xbf,45,127]);expect(f.controller.snapshot().focus).toBe(8);
  f.controller.dispose();
});

it('keeps empty-deck colors lit and makes the selected deck green',async()=>{
  vi.useFakeTimers();const f=setup(true);f.engine.snapshot().decks.forEach(d=>d.status='empty');
  f.controller.setDeckColors([[200,100,50],[180,120,60],[50,200,100],[60,180,120]]);await f.connect();
  expect(f.output.send).toHaveBeenCalledWith([0xb0,37,21]);
  for(const note of [38,39,40])expect(vi.mocked(f.output.send).mock.calls.some(([p])=>{const v=Array.from(p);return v[0]===0xf0&&v[8]===note&&v.slice(9,12).some(n=>n>0);})).toBe(true);
  f.controller.focus(2);await vi.advanceTimersByTimeAsync(50);
  expect(f.output.send).toHaveBeenCalledWith([0xb0,39,21]);
  expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,1,0x53,37,35,17,9,0xf7]);
  f.controller.dispose();vi.useRealTimers();
});
it('closes a late-opening wheel input after disconnect and does not attach its handler',async()=>{
  const f=setup();let release!:()=>void;
  const wheel={id:'wheel',name:'Launchkey MK4 61 MIDI Out',state:'connected',open:vi.fn(()=>new Promise<void>(resolve=>{release=resolve;})),close:vi.fn(async()=>{}),onmidimessage:null} as unknown as MIDIInput;
  (f.access.inputs as unknown as Map<string,MIDIInput>).set('wheel',wheel);
  await f.connect();expect(wheel.open).toHaveBeenCalledOnce();await f.controller.disconnect();release();
  await vi.waitFor(()=>expect(wheel.close).toHaveBeenCalled());expect(wheel.onmidimessage).toBeNull();expect(f.controller.snapshot().connected).toBe(false);f.controller.dispose();
});

it('uses fader Control Changes, not pad notes, and reports raw selection and mode evidence',async()=>{
  vi.useFakeTimers();const f=setup();await f.connect();
  expect(f.controller.snapshot().selector).toContain('No fader-button');
  for(const [cc,index] of [[37,0],[38,1],[40,3],[45,8]]){
    expect(decodeLaunchkey([0xbf,cc,127])).toEqual({kind:'focus',index});
    expect(decodeLaunchkey([0xbf,cc,0])).toBeNull();
    expect(decodeLaunchkey([0x90,cc,127])).toBeNull();
    expect(decodeLaunchkey([0xb0,cc,127])).toEqual({kind:'focus',index});
    f.receive([0xbf,cc,127]);expect(f.controller.snapshot().focus).toBe(index);
    expect(f.controller.snapshot().selector).toContain(`Button ${index+1}: BF`);
  }
  f.receive([0xb6,31,6]);expect(f.controller.snapshot().faderMode).toContain('choose Volume');
  f.receive([0xb6,31,1]);expect(f.controller.snapshot().faderMode).toBe('Volume confirmed.');
  await vi.advanceTimersByTimeAsync(50);
  for(const cc of [37,38,39,40,45])expect(vi.mocked(f.output.send).mock.calls.some(([p])=>{const b=Array.from(p);return b[0]===0xb0&&b[1]===cc&&b[2]>0;})).toBe(true);
  expect(vi.mocked(f.output.send).mock.calls.some(([p])=>{const b=Array.from(p);return b[0]===0x90&&b[1]>=37&&b[1]<=45;})).toBe(false);
  f.controller.dispose();vi.useRealTimers();
});

it('shows the selected track persistently and retriggers a brief selection display without flooding knob labels',async()=>{
  vi.useFakeTimers();const f=setup(true);f.engine.snapshot().decks[0].track={id:'song',title:'Some Chords',artist:'Artist',bpm:120,key:'Am'};
  const packet=(target:number,field:number,text:string)=>[0xf0,0,0x20,0x29,2,0x14,6,target,field,...Array.from(text,c=>c.charCodeAt(0)),0xf7];
  await f.connect();expect(f.output.send).toHaveBeenCalledWith(packet(32,0,'Deck A'));expect(f.output.send).toHaveBeenCalledWith(packet(32,1,'Some Chords'));
  expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,4,33,1,0xf7]);
  vi.mocked(f.output.send).mockClear();f.receive([0xbf,38,1]);
  expect(f.controller.snapshot().focus).toBe(1);expect(f.controller.snapshot().selector).toContain('Deck B · Empty deck');
  expect(f.output.send).toHaveBeenCalledWith(packet(32,0,'Deck B'));expect(f.output.send).toHaveBeenCalledWith(packet(33,1,'Empty deck'));
  const trigger=[0xf0,0,0x20,0x29,2,0x14,4,33,127,0xf7];expect(f.output.send).toHaveBeenCalledWith(trigger);
  vi.mocked(f.output.send).mockClear();f.receive([0xbf,38,127]);expect(f.output.send).toHaveBeenCalledExactlyOnceWith(trigger);
  f.receive([0xbf,38,0]);expect(f.output.send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(50);vi.mocked(f.output.send).mockClear();
  for(let i=0;i<100;i++)f.commands.setDeck('deck-b','gain',i);await vi.advanceTimersByTimeAsync(50);
  expect(vi.mocked(f.output.send).mock.calls.some(([p])=>Array.from(p)[0]===0xf0)).toBe(false);
  f.engine.snapshot().decks[1].track={id:'next',title:'New track',artist:'Artist',bpm:100,key:'C'};f.emit();await vi.advanceTimersByTimeAsync(50);
  expect(f.output.send).toHaveBeenCalledWith(packet(32,1,'New track'));
  f.receive([0xbf,45,64]);expect(f.output.send).toHaveBeenCalledWith(packet(32,0,'Master'));expect(f.output.send).toHaveBeenCalledWith(packet(33,0,'Master'));
  expect(f.commands.setDeckPlaying).not.toHaveBeenCalled();f.controller.dispose();vi.useRealTimers();
});

it('reports actual screen permission, configuration and accepted display sends separately from button input',async()=>{
  const off=setup();await off.connect();off.receive([0xbf,38,127]);
  expect(off.controller.snapshot().selector).toContain('Button 2');expect(off.controller.displayDiagnostic).toContain('Blocked: SysEx is not enabled');expect(off.controller.displayDiagnostic).toContain('Display commands sent: 0');off.controller.dispose();
  const on=setup(true);await on.connect();expect(on.controller.displayDiagnostic).toContain('SysEx enabled');expect(on.controller.displayDiagnostic).toContain('Stationary configured: yes; selection configured: yes');
  on.receive([0xbf,38,127]);expect(on.controller.displayDiagnostic).toContain('selection trigger');
  const sent=on.controller.displayDiagnostic;on.receive([0xbf,38,0]);expect(on.controller.displayDiagnostic).toBe(sent);on.controller.dispose();
});
it('retains a failed display command error instead of counting it as sent',async()=>{
  const f=setup(true);vi.mocked(f.output.send).mockImplementation(packet=>{const p=Array.from(packet);if(p[0]===0xf0&&p[6]===4)throw new Error('Display output rejected');});
  await f.connect();expect(f.controller.displayDiagnostic).toContain('Display commands sent: 0');expect(f.controller.displayDiagnostic).toContain('Send error: Error: Display output rejected');f.controller.dispose();
});

it('keeps the last unhandled physical button packet visible without treating it as selection',async()=>{
  const f=setup();await f.connect();f.receive([0x9f,38,127]);expect(f.controller.lastButtonInput).toBe('IN 9F 26 7F · unhandled');expect(f.controller.snapshot().focus).toBe(0);
  f.receive([0xf8]);f.receive([0xbf,5,40]);expect(f.controller.lastButtonInput).toContain('9F 26 7F');
  f.receive([0xbf,38,127]);expect(f.controller.lastButtonInput).toBe('IN BF 26 7F · focus');f.controller.dispose();
});

it('accepts mapped messages on all 16 channels, with releases and unrelated IDs still respected',async()=>{
  for(let ch=0;ch<16;ch++){
    for(const [key,value,event] of [
      [5,64,{kind:'fader',index:0,value:64}],[21,50,{kind:'knob',index:0,value:50}],
      [85,65,{kind:'relative',index:0,value:1}],[38,127,{kind:'focus',index:1}],
      [115,127,{kind:'play'}],[116,127,{kind:'stop'}],[31,1,{kind:'mode',index:31,value:1}],
    ] as const)expect(decodeLaunchkey([0xb0|ch,key,value])).toEqual(event);
    expect(decodeLaunchkey([0x90|ch,113,127])).toEqual({kind:'pad',index:9,down:true});
    for(const status of [0x80|ch,0x90|ch])expect(decodeLaunchkey([status,113,0])).toEqual({kind:'pad',index:9,down:false});
    for(const key of [37,38,39,45,115,116,99])expect(decodeLaunchkey([0xb0|ch,key,0])).toBeNull();
    const f=setup();await f.connect();f.receive([0xb0|ch,38,127]);f.receive([0xb0|ch,21,127]);
    expect(f.commands.setDeck).toHaveBeenCalledWith('deck-b','sendA',100);
    f.receive([0x90|ch,113,127]);f.receive([0x80|ch,113,0]);
    expect(f.commands.cueDeck).toHaveBeenCalledWith('deck-b',true);expect(f.commands.cueDeck).toHaveBeenCalledWith('deck-b',false);f.controller.dispose();
  }
});
it('routes captured B0 selector presses to focus, screen and green feedback, ignoring releases',async()=>{
  vi.useFakeTimers();const f=setup(true);await f.connect();f.controller.focus(8);await vi.advanceTimersByTimeAsync(50);
  for(const [key,index,label] of [[0x25,0,'Deck A'],[0x27,2,'Deck C'],[0x26,1,'Deck B'],[0x2d,8,'Master']] as const){
    vi.mocked(f.output.send).mockClear();const previous=f.controller.snapshot().focus;
    f.receive([0xb0,key,0]);expect(f.controller.snapshot().focus).toBe(previous);expect(f.output.send).not.toHaveBeenCalled();
    f.receive([0xb0,key,127]);expect(f.controller.snapshot().focus).toBe(index);
    expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,6,33,0,...Array.from(label,c=>c.charCodeAt(0)),0xf7]);
    await vi.advanceTimersByTimeAsync(50);expect(f.output.send).toHaveBeenCalledWith([0xb0,key,21]);
  }
  f.controller.dispose();vi.useRealTimers();
});

it('disables overlapping touch output before initializing knob positions without changing parameters',async()=>{
  const f=setup();await f.connect();
  const packets=vi.mocked(f.output.send).mock.calls.map(([p])=>Array.from(p));
  const touch=packets.findIndex(p=>p[0]===0xb6&&p[1]===71&&p[2]===0);
  const position=packets.findIndex(p=>p[0]===0xbf&&p[1]===21);
  expect(touch).toBeGreaterThan(-1);expect(position).toBeGreaterThan(touch);
  expect(f.commands.setDeck).not.toHaveBeenCalled();
  expect(packets.some(p=>p[0]===0xb6&&p[1]===71&&p[2]!==0)).toBe(false);
  f.controller.dispose();
});

it('keeps the empty-deck pad layout visible, uses deck RGB for loops, and sends only changes',async()=>{
  vi.useFakeTimers();const f=setup(true);f.engine.snapshot().decks.forEach(d=>d.status='empty');
  await f.connect();f.controller.setDeckColors([[255,0,0],[0,255,0],[0,0,255],[255,128,0]]);
  await vi.advanceTimersByTimeAsync(50);
  for(let i=0;i<4;i++)expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,1,0x43,96+i,44,0,0,0xf7]);
  for(const [note,color] of [[112,22],[113,10],[114,22],[115,45],[116,45]])expect(f.output.send).toHaveBeenCalledWith([0x90,note,color]);
  for(const note of [96,97,98,99,112,113,114,115,116])f.receive([0x90,note,127]);
  for(const action of [f.commands.quickLoop,f.commands.resizeLoop,f.commands.setDeckLoopEnabled,f.commands.setDeckPlaying,f.commands.cueDeck,f.commands.setDeckSync,f.commands.beatJump])expect(action).not.toHaveBeenCalled();
  vi.mocked(f.output.send).mockClear();for(let i=0;i<100;i++)f.emit();await vi.advanceTimersByTimeAsync(50);expect(f.output.send).not.toHaveBeenCalled();
  f.controller.focus(1);await vi.advanceTimersByTimeAsync(50);
  expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,1,0x43,96,0,44,0,0xf7]);
  const deck=f.engine.snapshot().decks[1];deck.status='ready';deck.loop={start:0,end:4,enabled:true};f.emit();await vi.advanceTimersByTimeAsync(50);
  for(const note of [96,99])expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,1,0x43,note,0,127,0,0xf7]);
  f.controller.focus(8);await vi.advanceTimersByTimeAsync(50);
  for(const note of [96,97,98,99,112,113,114,115,116])expect(f.output.send).toHaveBeenCalledWith([0x90,note,0]);
  f.controller.dispose();vi.useRealTimers();
});
it('uses distinct deck palette fallbacks for loop pads without SysEx',async()=>{
  vi.useFakeTimers();const f=setup();await f.connect();
  for(let i=0;i<4;i++){f.controller.focus(i);await vi.advanceTimersByTimeAsync(50);expect(f.output.send).toHaveBeenCalledWith([0x90,96,[10,50,38,22][i]]);}
  f.controller.dispose();vi.useRealTimers();
});

it('labels all faders truthfully with movement-triggered displays and retains knob names',async()=>{
  vi.useFakeTimers();const f=setup(true);await f.connect();
  const text=(target:number,label:string)=>[0xf0,0,0x20,0x29,2,0x14,6,target,0,...Array.from(label,c=>c.charCodeAt(0)),0xf7];
  for(let i=0;i<9;i++){
    expect(f.output.send).toHaveBeenCalledWith([0xf0,0,0x20,0x29,2,0x14,4,5+i,0x44,0xf7]);
    expect(f.output.send).toHaveBeenCalledWith(text(5+i,i<4?`Deck ${'ABCD'[i]} Level`:'Unused'));
  }
  expect(f.output.send).toHaveBeenCalledWith(text(21,'FX A'));expect(f.output.send).toHaveBeenCalledWith(text(28,'Master Trim'));
  vi.mocked(f.output.send).mockClear();
  for(let i=0;i<100;i++)f.receive([0xb0,5,i%127]);
  await vi.advanceTimersByTimeAsync(50);
  expect(vi.mocked(f.output.send).mock.calls.some(([p])=>Array.from(p)[0]===0xf0)).toBe(false);
  f.controller.dispose();vi.useRealTimers();
});

it('scales deck and Master Trim across -24 to +12 with zero capture at two-thirds travel',async()=>{
  vi.useFakeTimers();const f=setup();await f.connect();
  for(const [cc,id,key] of [[27,'deck-a','trim'],[28,'master','masterTrim']] as const){
    const command=id==='master'?f.commands.setMaster:f.commands.setDeck;
    const expected=(v:number)=>id==='master'?[key,v]:[id,key,v];
    f.receive([0xb0,cc,0]);await vi.advanceTimersByTimeAsync(20);expect(command).toHaveBeenLastCalledWith(...expected(-24));
    f.receive([0xb0,cc,127]);await vi.advanceTimersByTimeAsync(20);expect(command).toHaveBeenLastCalledWith(...expected(12));
    f.receive([0xb0,cc,85]);await vi.advanceTimersByTimeAsync(20);expect(command).toHaveBeenLastCalledWith(...expected(0));
    f.receive([0xb0,cc,64]);await vi.advanceTimersByTimeAsync(20);expect(command).toHaveBeenLastCalledWith(...expected(-24+64*36/127));
  }
  f.controller.dispose();vi.useRealTimers();
});
