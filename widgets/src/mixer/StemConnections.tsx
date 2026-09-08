import { useId, useLayoutEffect, useRef, useState } from 'react';

/** Decorative routing follows the actual dial geometry when the column resizes. */
export function StemConnections() {
  const ref = useRef<SVGSVGElement>(null);
  const maskId = useId();
  const [drawing, setDrawing] = useState({ path: '', boxes: [] as { x:number; y:number; width:number; height:number }[] });
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const bounds = parent.getBoundingClientRect();
      const controls = [...parent.querySelectorAll<HTMLElement>('[data-stem-order]')]
        .sort((a,b)=>Number(a.dataset.stemOrder)-Number(b.dataset.stemOrder));
      const points = controls.map(control => {
        const dial = control.querySelector('svg')!.getBoundingClientRect();
        return { x:dial.x + dial.width / 2 - bounds.x, y:dial.y + dial.height / 2 - bounds.y };
      });
      const boxes = controls.map(control => {
        const box = control.getBoundingClientRect();
        return { x:box.x-bounds.x, y:box.y-bounds.y, width:box.width, height:box.height };
      });
      setDrawing({ path: points.map((p,i)=>i ? `H${p.x} V${p.y}` : `M${p.x} ${p.y}`).join(' '), boxes });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    parent.querySelectorAll('[data-stem-order]').forEach(control=>observer.observe(control));
    measure();
    return () => observer.disconnect();
  }, []);
  return <svg ref={ref} className="play-stem-connections" aria-hidden="true">
    <defs><mask id={maskId}><rect width="100%" height="100%" fill="white"/>{drawing.boxes.map((box,i)=><rect key={i} {...box} fill="black"/>)}</mask></defs>
    <path d={drawing.path} mask={`url(#${maskId})`} fill="none" stroke="currentColor" strokeWidth="1"/>
  </svg>;
}
