import { useState } from 'react';
import { ButtonFace } from '@openflow/widgets/controls/ButtonFace.tsx';

const KEY = 'mixflow.header-position.v1';
type Mode = 'beats' | 'seconds';
function initialMode(): Mode {
  try { return localStorage.getItem(KEY) === 'seconds' ? 'seconds' : 'beats'; }
  catch { return 'beats'; }
}

/** bar.beat.sixteenth, one-based, from a position measured in bars. */
function position(bar: number, bars: number): string {
  const whole = Math.floor(bar);
  const beat = Math.floor((bar - whole) * 4);
  const sixteenth = Math.floor(((bar - whole) * 4 - beat) * 4);
  return `${Math.min(whole, Math.max(0, bars - 1)) + 1}.${beat + 1}.${sixteenth + 1}`;
}

/** Minutes:seconds, retaining the prior elapsed-time format. */
function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** A view preference only: neither switching units nor persistence touches transport. */
export function PositionDisplay({bar,bars,seconds}:{bar:number;bars:number;seconds:number}) {
  const [mode,setMode] = useState(initialMode);
  const text = mode === 'beats' ? position(bar,bars) : clockOf(seconds);
  const label = mode === 'beats' ? `Beat position ${text}. Show elapsed time` : `Elapsed time ${text}. Show beat position`;
  const change = () => {
    const next = mode === 'beats' ? 'seconds' : 'beats';
    setMode(next);
    try { localStorage.setItem(KEY,next); } catch { /* Still usable when preferences cannot be saved. */ }
  };
  return <ButtonFace className="mf-clock mf-clock-toggle" aria-label={label} title={label} onClick={change}>{text}</ButtonFace>;
}
