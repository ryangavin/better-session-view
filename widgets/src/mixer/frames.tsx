import { useEffect, useRef, useState } from 'react';
import { Meter } from '../controls/Meter.tsx';
import type { MixerFrame } from './model.ts';
/** Animate only the meter, keeping the launcher and controls off the frame render path. */
export function FrameMeter({ sample, label }: { sample(): number; label: string }) {
  const latest = useRef(sample);
  latest.current = sample;
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let level = 0;
    const draw = (now: number) => {
      const dt = Math.min(100, now - previous);
      previous = now;
      const target = Math.max(0, Math.min(1, latest.current()));
      level += (target - level) * (1 - Math.exp(-dt / (target > level ? 35 : 140)));
      if (target === 0 && level < 0.0001) level = 0;
      setValue(level);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <Meter ink="var(--play-signal)" width={14} name="" label={label} orientation="vertical" length={210} value={value} />;
}


export function FramePlayhead({ readFrame, deckId }: { readFrame(): MixerFrame; deckId: string }) {
  const node = useRef<HTMLSpanElement>(null);
  const latest = useRef(readFrame); latest.current = readFrame;
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const beat = latest.current().decks[deckId]?.beat ?? 0;
      if (node.current) node.current.style.left = `${((beat % 128 + 128) % 128) / 128 * 100}%`;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [deckId]);
  return <span ref={node} className="play-playhead" />;
}
