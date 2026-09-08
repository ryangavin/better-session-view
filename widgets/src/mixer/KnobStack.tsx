import { Children, type CSSProperties, type ReactNode } from 'react';
import { StemConnections } from './StemConnections.tsx';

/** Shared column geometry for stem and EQ knobs; compact rows keep full-size faces. */
export function KnobStack({ children, stems = false, full = false }: { children:ReactNode; stems?:boolean; full?:boolean }) {
  const knobs = Children.toArray(children);
  return <div className="play-eq-stack play-knob-stack" data-staggered={knobs.length > 4} data-full={full}
    style={{'--play-knob-count':knobs.length} as CSSProperties}>
    {stems && knobs.length > 4 && <StemConnections/>}
    {[0,1].map(column=><div className="play-knob-column" key={column}>
      <div className="play-knob-controls">{knobs.map((knob,i)=>i%2===column && <div className="play-knob-cell" data-stem-order={stems?i:undefined} key={i} style={{gridRow:i+1}}>{knob}</div>)}</div>
      <div className="play-knob-spacer" aria-hidden="true">{stems && knobs.length > 4 && column===0 && <svg className="play-stem-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 10v4 M7.5 6v12 M12 3v18 M16.5 7v10 M21 10v4"/></svg>}</div>
    </div>)}
  </div>;
}
