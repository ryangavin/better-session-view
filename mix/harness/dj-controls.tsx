import { createRoot } from 'react-dom/client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { PlayView } from '../src/play/PlayView.tsx';
import '../src/App.css';
import { ThemeRoot } from '@openflow/widgets/theme/ThemeRoot.tsx';
import { DEFAULT_THEME } from '@openflow/widgets/theme/theme.ts';
import '@openflow/widgets/palette.css';
import '@openflow/widgets/tokens.css';
import { MixerEngine } from '../src/play/engine.ts';
import { params } from '../src/play/decks.ts';
import { fixture,fixtureTrack } from './dj-fixture.ts';
import { runControlAudioChecks } from './dj-render.ts';
const engine=new MixerEngine();engine.setMonitoring(false);
function Harness(){
 const state=useSyncExternalStore(engine.subscribe,engine.snapshot),[frames,setFrames]=useState(''),[result,setResult]=useState('');
 useEffect(()=>{const timer=setInterval(()=>setFrames(JSON.stringify(engine.readFrame().decks,null,2)),100);return()=>clearInterval(timer);},[]);
 const load=async()=>{engine.stop();await engine.load('deck-a',fixtureTrack,async()=>fixture(new OfflineAudioContext(2,1,48000)));};
 return <><header style={{padding:10}}><strong>DJ controls · worktree c028 · port {location.port} · real MixerEngine</strong><p>Generated source audio. Speakers muted by default. Source positions below read the real audio clock.</p><button onClick={()=>void load()}>Load measured fixture</button> <button onClick={()=>engine.setMonitoring(!engine.monitoring)}>Toggle speakers</button> <button onClick={()=>engine.stop()}>Stop all</button> <button onClick={()=>void runControlAudioChecks(setResult)}>Run captured engine audio checks</button><pre id="audio-results" style={{maxHeight:140,overflow:'auto'}}>{result}</pre></header>
 <div style={{height:850,display:'flex'}}><PlayView mixer={{state,commands:engine.commands,readFrame:engine.readFrame,params,load:async()=>load(),engine}}/></div><pre aria-label="Measured source positions">{frames}</pre></>;
}
createRoot(document.getElementById('root')!).render(<ThemeRoot theme={DEFAULT_THEME}><Harness/></ThemeRoot>);
