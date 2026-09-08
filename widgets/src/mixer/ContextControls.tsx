import { useId, useRef, useState, type ReactNode } from 'react';
import { ButtonFace } from '../controls/ButtonFace.tsx';
import { Popup } from '../chrome/Popup.tsx';

/** Mixer contents composed from the shared button surface and popup lifecycle. */
export function ContextControls({label, title=label, children, face, active=false, disabled=false, onPress, pressed}: {
  label:string; title?:string; children:ReactNode; face:ReactNode; active?:boolean; disabled?:boolean; onPress?():void; pressed?:boolean;
}) {
  const id=useId(), anchor=useRef<HTMLButtonElement>(null), [open,setOpen]=useState(false);
  const close=()=>{setOpen(false);anchor.current?.focus();};
  return <>
    <ButtonFace size="medium" ref={anchor} className="play-context-trigger" aria-label={label} title={title} aria-expanded={open} aria-controls={open?id:undefined} aria-haspopup="dialog" aria-pressed={pressed} lit={pressed ?? (active || open)} disabled={disabled}
      onClick={e=>{if(onPress && !e.shiftKey)onPress();else setOpen(!open);}}
      onContextMenu={e=>{if(onPress){e.preventDefault();setOpen(!open);}}}
      onKeyDown={e=>{if(onPress && (e.key==='ContextMenu' || e.shiftKey && e.key==='F10')){e.preventDefault();setOpen(!open);}}}>{face}</ButtonFace>
    {open && <Popup anchor={anchor} id={id} role="dialog" label={label} className="play-context" onDismiss={how=>{setOpen(false);if(how==='escape')anchor.current?.focus();}}>
      <div className="play-context-heading"><strong>{label}</strong><ButtonFace size="medium" aria-label={`Close ${label}`} title="Close (Escape)" onClick={close}>×</ButtonFace></div>
      {children}
    </Popup>}
  </>;
}

export function PowerIcon(){return <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M10 2v8M6 4.5a7 7 0 1 0 8 0"/></svg>;}
export function PhonesIcon(){return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 12V9a7 7 0 0 1 14 0v3"/><rect x="2" y="10" width="4" height="7" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/></svg>;}
