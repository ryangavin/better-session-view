import { useEffect, useRef, useState } from 'react';
import { Meter } from '../controls/Meter.tsx';
import { Waveform } from '../wave/Waveform.tsx';
import type { CSSProperties } from 'react';
import type { MixerCommands, MixerDeck, MixerFrame, MixerTheme } from './model.ts';
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
  return <Meter ink="var(--play-signal)" name="" label={label} orientation="vertical" length={210} value={value} />;
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

/**
 * A lane per drawn source, each scrolling under its own playhead.
 *
 * Stems that have been dragged apart, looped separately or launched on their
 * own sit at different beats, and drawing them one above the other is what
 * makes that legible — the row is the deck, and the lanes are what it is
 * playing. Pointing at a lane focuses it, which is what the source menu used
 * to be for.
 */
export function FrameWaveform({ deck, index, ink, readFrame, theme, commands }: { deck: MixerDeck; index: number; ink: string; readFrame(): MixerFrame; theme: MixerTheme; commands: MixerCommands }) {
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const heads = useRef<(HTMLSpanElement | null)[]>([]);
  const slips = useRef<(HTMLSpanElement | null)[]>([]);
  const reading = useRef<HTMLSpanElement>(null);
  const latest = useRef({ deck, readFrame }); latest.current = { deck, readFrame };
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const { deck, readFrame } = latest.current, range = deck.waveform!;
      const at = readFrame().decks[deck.id];
      range.lanes.forEach((lane, i) => {
        const source = at?.sources?.[lane.id], beat = source?.beat ?? at?.beat ?? 0;
        const xOf = (b: number) => range.fixed ? (b - range.start) / range.visible * 100 : 25 + (b - beat) / range.visible * 100;
        const strip = strips.current[i], head = heads.current[i], slip = slips.current[i];
        if (strip) strip.style.transform = range.fixed ? 'none' : `translateX(${(0.25 - (beat - range.start) / range.visible) * range.visible / range.length * 100}%)`;
        if (head) head.style.left = `${xOf(beat)}%`;
        if (slip) { const b = source?.backgroundBeat; slip.hidden = b === undefined; if (b !== undefined) { slip.style.left = `${Math.max(0, Math.min(98, xOf(b)))}%`; slip.textContent = `SLIP ${b.toFixed(1)}`; } }
      });
      if (reading.current && at) {
        const seconds = Math.max(0, Math.floor(at.seconds ?? 0));
        reading.current.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')} · ${Math.max(1, Math.floor(at.beat / 4) + 1)}.${Math.floor((at.beat % 4 + 4) % 4) + 1}`;
      }
      frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [deck.id]);
  const range = deck.waveform!, alone = range.lanes.length === 1;
  return <>
    {range.lanes.map((lane, i) => {
      const focused = alone || lane.id === deck.focus, paint = theme.stems[lane.id] ?? ink;
      return <div key={lane.id} className="play-wave-source" data-focused={focused} aria-label={`Deck ${index + 1} ${lane.name} waveform`} style={{ '--stem-ink': paint } as CSSProperties}
        onPointerDown={() => { if (!alone) commands.setFocus?.(deck.id, lane.id); }}>
        <div className="play-wave-scroll" ref={node => { strips.current[i] = node; }} style={{ width: `${range.length / range.visible * 100}%` }}>
          <Waveform peaks={lane.peaks} spectrum={lane.spectrum} ink={paint} height={48} label={`Deck ${index + 1} ${lane.name} on the shared beat grid`} />
          <span className="play-wave-grid" style={{ backgroundSize: `${4 / range.length * 100}% 100%` }} />
          {lane.cue !== undefined && lane.cue !== lane.stemCue && <span className="play-cue-marker" style={{ left: `${(lane.cue - range.start) / range.length * 100}%`, top: alone ? 32 : undefined }}>{alone && 'DECK CUE'}</span>}
          {lane.stemCue !== undefined && <span className="play-cue-marker" style={{ left: `${(lane.stemCue - range.start) / range.length * 100}%`, top: alone ? 16 : undefined }}>{alone && 'CUE'}</span>}
          {lane.loop && <div className="play-loop-region" data-enabled={lane.loop.enabled} style={{ left: `${(lane.loop.start - range.start) / range.length * 100}%`, width: `${Math.max(0, (lane.loop.end ?? lane.loop.start) - lane.loop.start) / range.length * 100}%`, '--loop-ink': paint } as CSSProperties}>{alone && <span>{lane.loop.end === null ? 'IN' : `↻ ${Number((lane.loop.end - lane.loop.start).toFixed(1))} beats`}</span>}</div>}
        </div>
        {!alone && <span className="play-wave-source-name">{lane.name}</span>}
        <span ref={node => { heads.current[i] = node; }} className="play-playhead" style={{ left: '25%' }} />
        <span ref={node => { slips.current[i] = node; }} className="play-slip-marker" hidden />
      </div>;
    })}
    {deck.track && <span ref={reading} className="play-wave-position" />}
  </>;
}
