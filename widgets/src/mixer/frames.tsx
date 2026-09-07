import { useEffect, useRef, useState } from 'react';
import { Meter } from '../controls/Meter.tsx';
import { Waveform } from '../wave/Waveform.tsx';
import type { CSSProperties } from 'react';
import type { MixerDeck, MixerFrame } from './model.ts';
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

/** A host-provided source window scrolls under a fixed playhead; no playback policy lives here. */
export function FrameWaveform({ deck, index, ink, readFrame }: { deck: MixerDeck; index: number; ink: string; readFrame(): MixerFrame }) {
  const strip = useRef<HTMLDivElement>(null), reading = useRef<HTMLSpanElement>(null);
  const latest = useRef({ deck, readFrame }); latest.current = { deck, readFrame };
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const { deck, readFrame } = latest.current, range = deck.waveform!;
      const at = readFrame().decks[deck.id];
      if (strip.current) strip.current.style.transform = `translateX(${(0.25 - ((at?.beat ?? 0) - range.start) / range.visible) * range.visible / range.length * 100}%)`;
      if (reading.current && at) {
        const seconds = Math.max(0, Math.floor(at.seconds ?? 0));
        reading.current.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')} · ${Math.max(1, Math.floor(at.beat / 4) + 1)}.${Math.floor((at.beat % 4 + 4) % 4) + 1}`;
      }
      frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [deck.id]);
  const range = deck.waveform!, loop = range.loop;
  return <>
    <div className="play-wave-scroll" ref={strip} style={{ width: `${range.length / range.visible * 100}%` }}>
      <Waveform peaks={deck.peaks} spectrum={deck.waveformSpectrum} ink={ink} height={48} label={`Deck ${index + 1} waveform on the shared beat grid`} />
      <span className="play-wave-grid" style={{ backgroundSize: `${4 / range.length * 100}% 100%` }} />
      {loop && <div className="play-loop-region" data-enabled={loop.enabled} style={{ left: `${(loop.start - range.start) / range.length * 100}%`, width: `${Math.max(0, (loop.end ?? loop.start) - loop.start) / range.length * 100}%`, '--loop-ink': ink } as CSSProperties}><span>{loop.end === null ? 'IN' : `↻ ${Number((loop.end-loop.start).toFixed(1))} beats`}</span></div>}
    </div>
    <span className="play-playhead" style={{left:'25%'}} />
    {deck.track && <span ref={reading} className="play-wave-position" />}
  </>;
}
