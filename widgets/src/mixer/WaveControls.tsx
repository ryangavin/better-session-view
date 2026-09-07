import { useEffect, useRef } from 'react';
import type { MixerDeck, MixerCommands, MixerFrame } from './model.ts';
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
    <div className="play-wave-tools" role="group" aria-label={`Deck ${index+1} waveform controls`}>
      <label>Focus <select aria-label={`Deck ${index+1} waveform focus`} value={focus} disabled={d.full || d.status!=='ready' || d.loopFocus && d.loop?.start!=null && d.loop.end===null} onChange={e=>c.setFocus?.(d.id,e.target.value)}>{d.full?<option value="full">Original</option>:d.stems.filter(s=>s.available).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button disabled={d.status!=='ready' || !c.setStemPlaying} aria-label={`Deck ${index+1} focused play/pause`} onClick={play}>{playing?'Pause focus':'Play focus'}</button>
      <Momentary key={focus} label={`Deck ${index+1} focused cue`} held={held ?? false} disabled={d.status!=='ready'} onHold={on=>d.full?c.cueDeck?.(d.id,on):c.cueStem?.(d.id,focus,on)} onTakeover={()=>d.full?c.setDeckPlaying?.(d.id,true):c.setStemPlaying?.(d.id,focus,true)}>Cue focus</Momentary>
      <button aria-pressed={d.moveTogether ?? false} onClick={()=>c.setMoveTogether?.(d.id,!d.moveTogether)}>Move active stems</button>
      <button aria-label={`Deck ${index+1} zoom in`} onClick={()=>c.setZoom?.(d.id,(d.zoom ?? 32)/2)}>+</button><button aria-label={`Deck ${index+1} zoom out`} onClick={()=>c.setZoom?.(d.id,(d.zoom ?? 32)*2)}>−</button>
      <span>{d.zoom ?? 32} beats · {d.moveTogether?'pause active stems to move together':'pause focus to drag'}</span>
    </div>
    <div className="play-wave-gesture" role="slider" aria-valuemin={0} aria-valuemax={reading?.duration ?? 0} aria-valuenow={reading?.seconds ?? 0} tabIndex={d.status==='ready'?0:-1} aria-label={`Deck ${index+1} waveform position`} aria-valuetext={`${(reading?.seconds ?? 0).toFixed(3)} seconds · ${d.moveTogether?'Move active stems together':'Move focused stem'}`}
      onPointerDown={e=>{if(e.button!==0 || !c.moveDeck || d.status!=='ready')return;const sources=readFrame().decks[d.id]?.sources;if(d.moveTogether?Object.values(sources ?? {}).some(s=>s.enabled&&s.playing):sources?.[focus]?.playing)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,width:e.currentTarget.getBoundingClientRect().width,beats:d.zoom ?? 32,pointer:e.pointerId};c.moveDeck(d.id,'begin');}}
      onPointerMove={e=>{const at=drag.current;if(at && at.pointer===e.pointerId)c.moveDeck?.(d.id,'move',(at.x-e.clientX)/at.width*at.beats);}}
      onPointerUp={()=>{if(drag.current){drag.current=null;c.moveDeck?.(d.id,'commit');}}} onPointerCancel={cancel} onLostPointerCapture={cancel} onBlur={cancel}
      onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();cancel();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();c.moveDeck?.(d.id,'begin');c.moveDeck?.(d.id,'move',(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:0.125));c.moveDeck?.(d.id,'commit');}}}>
      {children}
    </div>
  </>;
}
