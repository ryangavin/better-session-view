import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { PlayView } from '../src/play/PlayView.tsx';
import '../src/App.css';
import { ThemeRoot } from '@openflow/widgets/theme/ThemeRoot.tsx';
import { DEFAULT_THEME } from '@openflow/widgets/theme/theme.ts';
import '@openflow/widgets/palette.css';
import '@openflow/widgets/tokens.css';
import { MixerEngine } from '../src/play/engine.ts';
import { params } from '../src/play/decks.ts';
import { fixture,fixtureTrack } from './dj-fixture.ts';
import { runControlAudioChecks, runStereoMeterChecks } from './dj-render.ts';
const engine=new MixerEngine();engine.setMonitoring(false);
function Harness(){
 const [frames,setFrames]=useState(''),[result,setResult]=useState('');
 useEffect(()=>{const timer=setInterval(()=>setFrames(JSON.stringify(engine.readFrame().decks,null,2)),100);return()=>clearInterval(timer);},[]);
 const load=async(six=false)=>{engine.stop();const track=six?{...fixtureTrack,sources:['drums','bass','other','vocals','guitar','piano']}:fixtureTrack;await engine.load('deck-a',track,async()=>{
  const asset=await fixture(new OfflineAudioContext(2,1,48000));
  if(six && asset.audio)for(const id of ['other','guitar','piano']){asset.audio.buffers[id]=asset.audio.buffers.vocals;asset.audio.sourceOverviews![id]=asset.audio.sourceOverviews!.vocals;}
  return asset;
 });};
 return <div style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden'}}><header style={{padding:6,flex:'none'}}><strong>DJ controls · worktree c028 · port {location.port} · real MixerEngine</strong><span> · generated audio · speakers muted by default</span><br/><button onClick={()=>void load()}>Load measured fixture</button> <button onClick={()=>void load(true)}>Load six-stem fixture</button> <button onClick={()=>engine.setMonitoring(!engine.monitoring)}>Toggle speakers</button> <button onClick={()=>engine.stop()}>Stop all</button> <button onClick={()=>void runControlAudioChecks(setResult)}>Run captured engine audio checks</button> <button onClick={()=>void runControlAudioChecks(setResult,true)}>Run transition checks</button> <button onClick={()=>void runStereoMeterChecks(setResult)}>Run stereo meter checks</button></header>
 <div style={{flex:1,minHeight:0,display:'flex'}}><PlayView mixer={{commands:engine.commands,readFrame:engine.readFrame,params,load:async()=>load(),engine}}/></div><details style={{position:'fixed',right:8,bottom:8,zIndex:20,background:'var(--bg)',maxWidth:'90vw'}}><summary>Measurements</summary><pre id="audio-results" style={{maxHeight:180,overflow:'auto'}}>{result}</pre><pre aria-label="Measured source positions" style={{maxHeight:140,overflow:'auto'}}>{frames}</pre></details></div>;
}
const root=createRoot(document.getElementById('root')!);
root.render(<ThemeRoot theme={DEFAULT_THEME}><Harness/></ThemeRoot>);
if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();engine.dispose();});
