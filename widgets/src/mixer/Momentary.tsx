import { ButtonFace } from '../controls/ButtonFace.tsx';
import { useEffect, useRef } from 'react';

/** One held input, canceled on capture loss, focus loss, disable, or unmount. */
export function Momentary({label, held, disabled, onHold, onTakeover, children}: {
  label: string; held: boolean; disabled?: boolean; onHold(held: boolean): void; onTakeover?(): void; children: React.ReactNode;
}) {
  const input=useRef<string|null>(null);
  const down=useRef(false), latest=useRef(onHold);latest.current=onHold;
  const release=()=>{if(down.current){down.current=false;input.current=null;latest.current(false);}};
  useEffect(()=>{window.addEventListener('blur',release);return()=>{window.removeEventListener('blur',release);release();};},[]);
  useEffect(()=>{if(disabled)release();},[disabled]);
  return <ButtonFace size="medium" className="play-hold" aria-label={label} lit={held} disabled={disabled}
    title="Hold to audition; while holding Space, press Enter to keep playing"
    onPointerDown={e=>{if(e.button!==0 || down.current)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture?.(e.pointerId);input.current='pointer';down.current=true;onHold(true);}}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onBlur={()=>{if(input.current!=='pointer')release();}}
    onKeyDown={e=>{if(e.key==='Enter' && down.current){e.preventDefault();onTakeover?.();}else if((e.key===' ' || e.key==='Enter') && !e.repeat){e.preventDefault();input.current=e.key;down.current=true;onHold(true);}else if(e.key==='Escape'){e.preventDefault();release();}}}
    onKeyUp={e=>{if(e.key===' ' || e.key==='Enter'){e.preventDefault();if(e.key===input.current)release();}}}
    onClick={e=>{if(e.detail===0 && !down.current){onHold(true);onHold(false);}}}>{children}</ButtonFace>;
}
