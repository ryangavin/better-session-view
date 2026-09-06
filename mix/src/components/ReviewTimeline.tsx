import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Axis } from '@openflow/widgets/debug/useAxis.ts';
import { sampleOf, type Beats } from '../warp.ts';
import type { Measurement } from '../debug/waveforms/measure.ts';
import type { SectionSuggestion } from '../sections.ts';
import { barText } from '../slices.ts';

const COLORS: Record<string, string> = { drums: '#ffb84c', bass: '#7974ff', other: '#52e1ca', vocals: '#ff66b0', guitar: '#a5df59', piano: '#c99aff' };
const stamp = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${(Math.max(0, t) % 60).toFixed(2).padStart(5, '0')}`;

/** One source-time graph from arrangement to drum samples; section controls stay on its axis. */
export function ReviewTimeline({ data, grid, referenceGrid, axis, cursor, audioOf, sources, stems, suggestions, selected, onSelect, onSeek }: {
  data: Measurement | null; grid: Beats; referenceGrid?: Beats; axis: Axis; cursor: number;
  audioOf: (id: string) => AudioBuffer | null; sources: readonly string[]; stems: boolean;
  suggestions: SectionSuggestion[]; selected: number | null; onSelect: (bar: number) => void; onSeek: (at: number) => void;
}) {
  const gradient = useId();
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey || event.shiftKey) axis.zoom(Math.exp(event.deltaY * 0.002), Math.max(0, Math.min(1, (event.clientX - el.getBoundingClientRect().left) / el.clientWidth)));
      else axis.pan((event.deltaX || event.deltaY) / el.clientWidth * (axis.window.to - axis.window.from));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [axis]);
  const { from, to } = axis.window, span = to - from;
  const xOf = (at: number) => (at - from) / span * width;
  const detail = span <= 8;
  const lanes = stems ? sources : [detail ? 'drums' : 'mix'];
  const laneHeight = stems ? 92 : 245, top = 58, height = top + lanes.length * laneHeight + 28;
  const waves = useMemo(() => lanes.map((id, lane) => {
    const middle = top + (lane + 0.5) * laneHeight, reach = laneHeight * 0.37;
    const buffer = id !== 'mix' ? audioOf(id) : null;
    const values = id === 'mix' ? data?.rms : data?.stems.find((s) => s.id === id)?.rms;
    const maximum = values?.reduce((a, b) => Math.max(a, b), 0.01) ?? 1;
    const columns = Math.ceil(width), high: string[] = [], low: string[] = [];
    for (let x = 0; x <= columns; x++) {
      const time = from + x / columns * span;
      let min = 0, max = 0;
      if (detail && buffer) {
        const a = Math.max(0, Math.floor(time * buffer.sampleRate));
        const b = Math.min(buffer.length, Math.max(a + 1, Math.ceil((time + span / columns) * buffer.sampleRate)));
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const channel = buffer.getChannelData(c);
          for (let i = a; i < b; i++) { min = Math.min(min, channel[i]); max = Math.max(max, channel[i]); }
        }
      } else if (values && data) {
        const a = Math.max(0, Math.floor(time / data.step)), b = Math.min(values.length, Math.max(a + 1, Math.ceil((time + span / columns) / data.step)));
        let power = 0; for (let i = a; i < b; i++) power += values[i] ** 2;
        max = Math.sqrt(Math.sqrt(power / Math.max(1, b - a)) / maximum); min = -max;
      }
      high.push(`${x / columns * width},${middle - max * reach}`); low.push(`${x / columns * width},${middle - min * reach}`);
    }
    return { id, middle, points: [...high, ...low.reverse()].join(' '), color: COLORS[id] ?? '#9e9bec' };
  // Lane identity is determined by these inputs; do not depend on the new array itself.
  }), [data, audioOf, sources, stems, detail, from, span, width, laneHeight]);
  const beatMarks = grid.samples.flatMap((sample, i) => {
    const at = sample / grid.rate, beat = i + grid.first;
    if (at < from || at > to) return [];
    const bar = beat % 4 === 0, pixelsPerBeat = width / span * ((grid.samples[i + 1] ?? sample + grid.rate * 0.5) - sample) / grid.rate;
    if (beat !== 0 && (bar ? pixelsPerBeat < 7 : pixelsPerBeat < 28)) return [];
    return [{ at, beat, bar }];
  });
  const colors = useMemo(() => {
    if (!data) return [];
    const vocal = data.stems.find((s) => s.id === 'vocals')?.rms;
    const voiceMax = vocal?.reduce((a, b) => Math.max(a, b), 0.008) ?? 1;
    return Array.from({ length: 300 }, (_, x) => {
      const i = Math.min(data.rms.length - 1, Math.floor((from + x / 299 * span) / data.step));
      const bands = data.bands.map((b) => b[i] ?? 0), total = Math.max(0.001, ...bands);
      return { color: `rgb(${80 + 155 * bands[0] / total},${80 + 155 * bands[1] / total},${95 + 150 * bands[2] / total})`, voice: vocal && vocal[i] > Math.max(0.008, voiceMax * 0.08) ? Math.min(1, vocal[i] / voiceMax + 0.2) : 0 };
    });
  }, [data, from, span]);
  const pick = (el: SVGSVGElement, clientX: number) => onSeek(Math.max(from, Math.min(to, from + (clientX - el.getBoundingClientRect().left) / el.getBoundingClientRect().width * span)));
  return <div ref={box} className="mf-review-timeline">
    <div className="mf-review-section-track" aria-label="Suggested section boundaries">
      {suggestions.map((s, i) => {
        const at = sampleOf(grid, s.bar * 4) / grid.rate, x = xOf(at);
        if (x < 0 || x >= width) return null;
        const next = suggestions[i + 1] ? xOf(sampleOf(grid, suggestions[i + 1].bar * 4) / grid.rate) : width;
        return <button key={s.bar} className={selected === s.bar ? 'is-selected' : ''} style={{ left: `${x / width * 100}%`, maxWidth: Math.max(26, Math.min(width - x, next - x - 3)) }} aria-pressed={selected === s.bar} aria-label={`Review ${s.reason.toLowerCase()} at bar ${barText(s.bar)}`} title={`${s.reason} · Bar ${barText(s.bar)} · ${stamp(at)}`} onClick={() => onSelect(s.bar)}><b>{i + 2}</b><span>{s.reason}</span></button>;
      })}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="slider" tabIndex={0} aria-label="Listening position in song timeline" aria-valuemin={from} aria-valuemax={to} aria-valuenow={cursor} aria-valuetext={stamp(cursor)}
      onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); pick(e.currentTarget, e.clientX); }}
      onPointerMove={(e) => { if (e.buttons === 1) pick(e.currentTarget, e.clientX); }}
      onKeyDown={(e) => {
        let at = cursor;
        if (e.key === 'ArrowLeft') at -= e.shiftKey ? 0.1 : 0.01;
        else if (e.key === 'ArrowRight') at += e.shiftKey ? 0.1 : 0.01;
        else if (e.key === 'Home') at = from; else if (e.key === 'End') at = to;
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); axis.zoom(0.5, Math.max(0, Math.min(1, (cursor - from) / span))); return; }
        else if (e.key === '-') { e.preventDefault(); axis.zoom(2, Math.max(0, Math.min(1, (cursor - from) / span))); return; }
        else return;
        e.preventDefault(); onSeek(Math.max(from, Math.min(to, at)));
      }}>
      <defs><linearGradient id={gradient}>{colors.map((c, i) => <stop key={i} offset={`${i / 299 * 100}%`} stopColor={c.color}/>)}</linearGradient></defs>
      {!stems && !detail && colors.map((c, i) => c.voice > 0 && <rect key={i} x={i / 300 * width} y={top + 20} width={width / 300 + 0.2} height="4" fill="#ff66b0" opacity={c.voice}/>)}
      {suggestions.map((s) => { const x = xOf(sampleOf(grid, s.bar * 4) / grid.rate); return <line key={s.bar} x1={x} x2={x} y1="0" y2={height - 24} stroke={selected === s.bar ? '#c9b0ef' : '#ffffff22'} strokeDasharray="3 5"/>; })}
      {waves.map((wave, i) => <g key={wave.id}><line x1="0" x2={width} y1={wave.middle} y2={wave.middle} stroke="#ffffff0b"/><polygon points={wave.points} fill={wave.id === 'mix' ? `url(#${gradient})` : wave.color} opacity="0.8"/><text x="10" y={top + i * laneHeight + 15} fill={wave.color} fontSize="11">{wave.id === 'mix' ? 'MIX · song structure' : `${wave.id.toUpperCase()}${detail ? ' · samples' : ''}`}</text></g>)}
      {referenceGrid && referenceGrid.samples.map((sample, i) => {
        const beat = referenceGrid.first + i, at = sample / referenceGrid.rate;
        if (beat % 4 || at < from || at > to || span > 40 && beat !== 0) return null;
        return <line key={beat} data-saved-bar={beat / 4 + 1} x1={xOf(at)} x2={xOf(at)} y1={top} y2={height - 24} stroke="#52e1ca" strokeDasharray="3 4" opacity=".85"/>;
      })}
      {beatMarks.map(({ at, beat, bar }) => <g key={beat}><line x1={xOf(at)} x2={xOf(at)} y1={top} y2={height - 24} stroke={bar ? '#ffdf8c' : '#ffffff22'} opacity={bar ? 0.65 : 0.4}/>{(beat === 0 || bar && span < 20) && <text x={xOf(at) + 4} y={top - 8} fill="#ffdf8c" fontSize="11">{beat === 0 ? 'Bar 1 · first downbeat' : `Bar ${beat / 4 + 1}`}</text>}</g>)}
      {cursor >= from && cursor <= to && <g data-review-cursor=""><line x1={xOf(cursor)} x2={xOf(cursor)} y1={top - 5} y2={height - 24} stroke="var(--fg)" strokeWidth="1.5"/><path d={`M ${xOf(cursor) - 5} ${top - 5} L ${xOf(cursor) + 5} ${top - 5} L ${xOf(cursor)} ${top + 2} Z`} fill="var(--fg)"/></g>}
      <text x="8" y={height - 7} fontSize="10" fill="var(--detail)">{stamp(from)}</text><text x={width - 8} textAnchor="end" y={height - 7} fontSize="10" fill="var(--detail)">{stamp(to)}</text>
    </svg>
    {!data && <span className="mf-wave-loading">Reading the song…</span>}
  </div>;
}
