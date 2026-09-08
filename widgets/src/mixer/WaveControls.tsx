import { ButtonFace } from '../controls/ButtonFace.tsx';
import { useEffect, useRef } from 'react';
import type { MixerDeck, MixerCommands, MixerFrame } from './model.ts';
import { ContextControls } from './ContextControls.tsx';
import { Momentary } from './Momentary.tsx';

export function WaveControls({deck:d,commands:c,index,readFrame,children}: {deck:MixerDeck;commands:MixerCommands;index:number;readFrame():MixerFrame;children:React.ReactNode}) {
  const drag=useRef<{x:number;width:number;beats:number;pointer:number}|null>(null);
  const focus=d.full?'full':d.focus ?? d.stems.find(s=>s.available)?.id ?? '';
  const stem=d.stems.find(s=>s.id===focus), playing=d.full?d.playing:stem?.playing, held=d.full?d.cueHeld:stem?.cueHeld;
  const latest=useRef(c);latest.current=c;
  const cancel=()=>{if(drag.current){drag.current=null;latest.current.moveDeck?.(d.id,'cancel');}};
  useEffect(()=>{window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel);cancel();};},[d.id]);
  const reading=readFrame().decks[d.id];
  const play=()=>d.full?c.setDeckPlaying?.(d.id,held?true:!playing):c.setStemPlaying?.(d.id,focus,held?true:!playing);
  return <>
    {d.status==='ready' && <div className="play-wave-tools" role="group" aria-label={`Deck ${index+1} waveform controls`}>
      <ContextControls label={`Deck ${index+1} waveform settings`} title="Choose focused source, movement scope and zoom" face={<>{d.full || d.waveformSource==='full'?'Full track':stem?.name ?? 'Source'} <span aria-hidden="true">⌄</span></>}>
        <label>Waveform source<select aria-label={`Deck ${index+1} waveform focus`} value={d.full || d.waveformSource==='full'?'full':focus} disabled={d.full || d.loopFocus && d.loop?.start!=null && d.loop.end===null} onChange={e=>c.setFocus?.(d.id,e.target.value)}><option value="full">Full track (original)</option>{!d.full && d.stems.filter(s=>s.available).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="play-context-check"><input type="checkbox" disabled={!d.independentStems} checked={d.moveTogether ?? false} onChange={()=>c.setMoveTogether?.(d.id,!d.moveTogether)}/>Move active stems together</label>
        <div className="play-context-row"><span>Zoom · {d.zoom===0?'Whole track':`${d.zoom ?? 32} beats`}</span><ButtonFace size="medium" aria-label={`Deck ${index+1} zoom in`} title="Zoom in" onClick={()=>c.setZoom?.(d.id,(d.zoom || 64)/2)}>+</ButtonFace><ButtonFace size="medium" aria-label={`Deck ${index+1} zoom out`} title="Zoom out" onClick={()=>c.setZoom?.(d.id,(d.zoom || 32)*2)}>−</ButtonFace></div>
        {d.waveformSource==='full' && !d.full && <p>Original waveform · positioning and Play/Cue follow {stem?.name ?? 'the focused stem'}. Audio playback is unchanged.</p>}
        {!d.independentStems && <p>Hot cues keep stems together. Launch a stem cell to enable separate movement.</p>}
        <p>Drag {d.moveTogether?'active stems':'focus'} while playing or paused. Escape cancels. Arrow keys move ⅛ beat; Shift moves one beat.</p>
      </ContextControls>
      <ButtonFace size="medium" aria-label={`Deck ${index+1} show whole waveform`} title="Show the entire source waveform" aria-pressed={d.zoom===0} onClick={()=>c.setZoom?.(d.id,d.zoom===0?32:0)}>Fit</ButtonFace>
      <ButtonFace size="medium" disabled={!c.setStemPlaying} aria-label={`Deck ${index+1} focused play/pause`} title={`Play / pause ${stem?.name ?? 'original'} only`} aria-pressed={playing ?? false} onClick={play}>{playing?'Ⅱ':'▶'}</ButtonFace>
      <Momentary key={focus} label={`Deck ${index+1} focused cue`} held={held ?? false} onHold={on=>d.full?c.cueDeck?.(d.id,on):c.cueStem?.(d.id,focus,on)} onTakeover={()=>d.full?c.setDeckPlaying?.(d.id,true):c.setStemPlaying?.(d.id,focus,true)}>CUE</Momentary>
    </div>}
    <div className="play-wave-gesture" role="slider" aria-valuemin={0} aria-valuemax={reading?.duration ?? 0} aria-valuenow={reading?.seconds ?? 0} tabIndex={d.status==='ready'?0:-1} aria-label={`Deck ${index+1} waveform position`} aria-valuetext={`${(reading?.seconds ?? 0).toFixed(3)} seconds · ${d.moveTogether?'Move active stems together':'Move focused stem'}`}
      onPointerDown={e=>{if(e.button!==0 || !c.moveDeck || d.status!=='ready')return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,width:e.currentTarget.getBoundingClientRect().width,beats:d.waveform?.visible ?? d.zoom ?? 32,pointer:e.pointerId};c.moveDeck(d.id,'begin');}}
      onPointerMove={e=>{const at=drag.current;if(at && at.pointer===e.pointerId)c.moveDeck?.(d.id,'move',(at.x-e.clientX)/at.width*at.beats);}}
      onPointerUp={()=>{if(drag.current){drag.current=null;c.moveDeck?.(d.id,'commit');}}} onPointerCancel={cancel} onLostPointerCapture={cancel} onBlur={cancel}
      onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();cancel();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();c.moveDeck?.(d.id,'begin');c.moveDeck?.(d.id,'move',(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:0.125));c.moveDeck?.(d.id,'commit');}}}>
      {children}
    </div>
  </>;
}
