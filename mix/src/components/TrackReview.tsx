import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import type { Mix } from '../state.ts';
import { evenBeats, beatAt, renumbered, sampleOf, shifted, tempoOf, rangeText, type Beats } from '../warp.ts';
import { heardIn } from '../transients.ts';
import { fitOf } from '../tempo.ts';
import { followOf } from '../follow.ts';
import { measure, type Measurement } from '../debug/waveforms/measure.ts';
import { sectionSuggestions } from '../sections.ts';
import { useReviewPlayback } from './reviewPlayback.ts';
import './TrackReview.css';

const time = (at: number, precision = 2) => {
  const scale = 10 ** precision, ticks = Math.round(Math.max(0, at) * scale);
  return `${Math.floor(ticks / (60 * scale))}:${((ticks % (60 * scale)) / scale).toFixed(precision).padStart(precision + 3, '0')}`;
};
const TEMPO: Param = { kind: 'float', min: 40, max: 300, defaultValue: 120, unit: 'custom', customUnit: '%0.2f' };
const channels = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/** A review, not a diagnostic dashboard. Every adjustment stays local until Save. */
export function TrackReview({ mix, details }: { mix: Mix; details?: ReactNode }) {
  const [grid, setGrid] = useState(mix.grid);
  const [dirty, setDirty] = useState(false);
  const [data, setData] = useState<Measurement | null>(null);
  const [note, setNote] = useState('');
  const [running, setRunning] = useState(false);
  const [quantum, setQuantum] = useState<4 | 8>(8);
  const [useSections, setUseSections] = useState(false);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [click, setClick] = useState(true);
  const [drumsOnly, setDrumsOnly] = useState(false);
  const downbeat = sampleOf(grid, 0) / grid.rate;
  const [cursor, setCursor] = useState(Math.max(0, downbeat));
  const [focus, setFocus] = useState(Math.max(0, downbeat));
  const player = useReviewPlayback();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioOf = mix.audioOf;
  const sources = mix.song!.sources;
  useEffect(() => {
    const abort = new AbortController();
    const inputs = sources.flatMap((id) => { const b = audioOf(id); return b ? [{ id, channels: channels(b) }] : []; });
    void measure(inputs, mix.rate, abort.signal).then(setData).catch((error) => {
      if (!abort.signal.aborted) setNote(`Couldn't read song structure: ${String(error)}`);
    });
    return () => abort.abort();
  }, [audioOf, sources, mix.rate]);
  useEffect(() => () => { if (pending.current !== null) clearTimeout(pending.current); }, []);
  const suggestions = useMemo(() => data ? sectionSuggestions(data, grid, quantum) : [], [data, grid, quantum]);
  const chosen = suggestions.filter((s) => !dismissed.includes(s.bar));
  const change = (next: Beats) => {
    player.stop(); setGrid(next); setDirty(true); setUseSections(false); setDismissed([]);
  };
  const jump = (at: number) => { player.stop(); setFocus(Math.max(0, Math.min(mix.seconds, at))); setCursor(Math.max(0, Math.min(mix.seconds, at))); };
  const reset = () => {
    player.stop(); setRunning(true); setNote('Finding the beat again…');
    pending.current = setTimeout(() => {
      pending.current = null;
      try {
        const drums = audioOf('drums');
        const heard = drums && heardIn(channels(drums), drums.sampleRate);
        const fit = heard && fitOf(heard);
        if (!fit || !heard) { setNote('No steady beat found. Your current grid is still here; adjust it below.'); return; }
        const next = followOf(heard, fit)?.beats ?? evenBeats(grid.rate, grid.length, fit.bpm, fit.offset);
        change(next); jump(sampleOf(next, 0) / next.rate);
        setNote('Fresh automatic grid ready to check. Save to keep it, or discard to restore your saved grid.');
      } catch (error) { setNote(`Couldn't reset the grid: ${String(error)}`); }
      finally { setRunning(false); }
    }, 0);
  };
  const playFrom = (from: number) => {
    const beat = beatAt(grid, from * grid.rate);
    const to = Math.min(mix.seconds, sampleOf(grid, beat + 16) / grid.rate);
    const buffers = (drumsOnly ? ['drums'] : sources).flatMap((id) => { const b = audioOf(id); return b ? [b] : []; });
    if (to <= from || !buffers.length) { setNote('Choose a point before the end of the song.'); return; }
    void player.play(buffers, grid, from, to, click).catch((error) => { player.stop(); setNote(`Couldn't play: ${String(error)}`); });
  };
  const play = () => { if (player.head !== null) player.stop(); else playFrom(cursor); };
  const detailFrom = Math.max(0, Math.min(mix.seconds - 4, focus - 1));
  const detailTo = Math.min(mix.seconds, detailFrom + 4);
  useEffect(() => {
    if (player.head === null) return;
    setCursor(player.head);
    if (player.head > detailTo || player.head < detailFrom) setFocus(player.head);
  }, [player.head, detailFrom, detailTo]);
  const saved = () => { change(mix.grid); setDirty(false); jump(sampleOf(mix.grid, 0) / mix.grid.rate); setNote('Saved grid restored.'); };
  const save = () => {
    player.stop();
    mix.saveReview(grid, useSections ? [{ bar: 0, name: 'Section 1' }, ...chosen.map((s, i) => ({ bar: s.bar, name: `Section ${i + 2}` }))] : undefined);
    mix.keepStems();
  };
  return <div className="mf-review-layout">
    <AnalysisHeading mix={mix} onSave={save} disabled={running} note={note || (dirty || useSections ? 'Unsaved grid or section changes. Save to keep them.' : 'Grid and section changes stay here until you save.')} />
    <div className="mf-track-review">
    <section className="mf-review-overview">
      <div className="mf-review-title"><div><p className="mf-eyebrow">SONG OVERVIEW</p><h3>Choose a passage to check</h3></div><span>{time(mix.seconds)} <span aria-hidden="true">·</span> {rangeText(grid)} BPM <span aria-hidden="true">·</span> 4/4</span></div>
      <SongWave data={data} grid={grid} sections={chosen} seconds={mix.seconds} from={detailFrom} to={detailTo} cursor={player.head ?? cursor} onSeek={jump} />
      <p className="mf-review-hint">Click anywhere to show that passage below. Pink marks vocal activity; numbers mark suggested sections.</p>
    </section>
    <div className="mf-review-columns">
      <section className="mf-review-card">
        <div className="mf-review-title"><div><p className="mf-eyebrow">01 / CHECK THE RHYTHM</p><h3>Check the first downbeat</h3></div><span className="mf-review-badge">{dirty ? 'Unsaved grid' : mix.fitFailed || !mix.beats && !mix.detected ? 'Check the grid' : 'Saved grid'}</span></div>
        <p>Press Listen and check that the click lands with the drums. Gold lines mark each bar’s first beat. Check the middle and end too.</p>
        <div className="mf-review-actions"><Button onPress={() => jump(downbeat)}>First downbeat · {time(downbeat)}</Button><Button onPress={() => jump(mix.seconds / 2)}>Middle</Button><Button onPress={() => jump(Math.max(0, mix.seconds - 12))}>Near end</Button></div>
        <DetailWave buffer={audioOf('drums')} grid={grid} from={detailFrom} to={detailTo} cursor={player.head ?? cursor} onSeek={(at) => { player.stop(); setCursor(at); }} />
        <div className="mf-review-actions"><Button onPress={play}>{player.head === null ? '▶ Listen for 4 bars' : '■ Stop'}</Button>
          <Toggle on={click} onChange={(on) => { player.stop(); setClick(on); }} label="Metronome" width={90}>Metronome</Toggle>
          <Select items={['Full song', 'Drums only']} index={drumsOnly ? 1 : 0} onChange={(index) => { player.stop(); setDrumsOnly(index === 1); }} label="Listen to" /></div>
        <details className="mf-review-adjust"><summary>Correct the beat grid</summary>
          <p>Drag the white cursor onto the first downbeat, then press Set bar 1. Use the nudge buttons if all beats land a little early or late.</p>
          <div className="mf-review-actions"><Button disabled={running} onPress={() => { const next = shifted(grid, Math.round((cursor - downbeat) * grid.rate)); change(next); jump(cursor); }}>Set bar 1 at {time(cursor)}</Button><Button disabled={running} onPress={() => { const next = renumbered(grid, -1); change(next); jump(sampleOf(next, 0) / next.rate); }}>One beat earlier</Button><Button disabled={running} onPress={() => { const next = renumbered(grid, 1); change(next); jump(sampleOf(next, 0) / next.rate); }}>One beat later</Button></div>
          <div className="mf-review-actions"><span>Nudge all beats</span><Button disabled={running} onPress={() => change(shifted(grid, -Math.round(grid.rate * 0.01)))}>−10 ms</Button><Button disabled={running} onPress={() => change(shifted(grid, Math.round(grid.rate * 0.01)))}>+10 ms</Button></div>
          <div className="mf-review-tempo"><span>Use a steady tempo</span><NumberField param={TEMPO} value={tempoOf(grid)} showFill={false} label="Steady tempo BPM" width={85} disabled={running} onChange={(bpm) => change(evenBeats(grid.rate, grid.length, bpm, downbeat))} /><span>BPM</span></div>
          <p className="mf-review-hint">Setting a tempo replaces tempo variations with evenly spaced beats.</p>
        </details>
        <div className="mf-review-actions mf-review-reset"><Button disabled={running} onPress={reset}>{running ? 'Finding beats…' : 'Reset grid to automatic'}</Button><Button disabled={!dirty || running} onPress={saved}>Discard grid changes</Button></div>
      </section>
      <section className="mf-review-card">
        <div className="mf-review-title"><div><p className="mf-eyebrow">02 / FIND THE SECTIONS</p><h3>Review the section changes</h3></div><span className="mf-review-badge">Suggestions</span></div>
        <p>Listen to each suggested change. Remove ones you don’t want, then choose Use these sections to replace your current cuts when saving.</p>
        <div className="mf-review-actions"><span>Place changes on</span><Select items={['4-bar phrases', '8-bar phrases']} index={quantum === 4 ? 0 : 1} label="Section spacing" onChange={(index) => { setQuantum(index === 0 ? 4 : 8); setDismissed([]); setUseSections(false); }} /><span>{chosen.length} changes</span></div>
        <div className="mf-review-sections">{!data ? <p role="status">Reading energy and vocal activity…</p> : !chosen.length ? <p>No clear changes at this spacing. Try 4-bar phrases; you can also keep the current sections.</p> : chosen.map((s, i) => <div className="mf-review-section" key={s.bar}><button aria-label={`Listen to ${s.reason.toLowerCase()} at bar ${s.bar + 1}`} onClick={() => { const at = Math.max(0, sampleOf(grid, s.bar * 4) / grid.rate - 1); jump(at); playFrom(at); }}><b>{String(i + 2).padStart(2, '0')}</b><span>{s.reason}<small>Bar {s.bar + 1} · {time(sampleOf(grid, s.bar * 4) / grid.rate)}</small></span><span className="mf-section-listen" aria-hidden="true">▶ Listen</span></button><button aria-label={`Dismiss change at bar ${s.bar + 1}`} onClick={() => { setDismissed([...dismissed, s.bar]); setUseSections(false); }}>×</button></div>)}</div>
        <Toggle className="mf-review-keep" on={useSections} disabled={!chosen.length} onChange={setUseSections} label={`Use these ${chosen.length + 1} sections when saving`} width={225}>Use these {chosen.length + 1} sections</Toggle>
        <p className="mf-review-hint">{useSections ? 'This replaces the current section cuts and names with numbered sections.' : `Your ${mix.slices.length} current sections stay as they are unless you choose this.`} Suggestions describe audible changes, not verse or chorus labels.</p>
      </section>
    </div>
    {details}
    </div>
  </div>;

}

function SongWave({ data, grid, sections, seconds, from, to, cursor, onSeek }: { data: Measurement | null; grid: Beats; sections: {bar: number}[]; seconds: number; from: number; to: number; cursor: number; onSeek: (at: number) => void }) {
  const bars = useMemo(() => {
    if (!data) return null;
    const vocal = data.stems.find((s) => s.id === 'vocals')?.rms;
    const maximum = Math.max(0.01, ...data.rms);
    const voiceMax = vocal ? Math.max(0.008, ...vocal) : 1;
    return Array.from({ length: 600 }, (_, x) => {
      const i = Math.min(data.rms.length - 1, Math.floor(x / 600 * data.rms.length));
      const h = Math.max(1, Math.sqrt(data.rms[i] / maximum) * 44);
      const bands = data.bands.map((b) => b[i]);
      const total = Math.max(0.001, ...bands);
      const color = `rgb(${Math.round(80 + 155 * bands[0] / total)},${Math.round(80 + 155 * bands[1] / total)},${Math.round(95 + 150 * bands[2] / total)})`;
      return <g key={x}><rect x={x * 2} y={80 - h} width="1.6" height={h * 2} fill={color}/>{vocal && vocal[i] > Math.max(0.008, voiceMax * 0.08) && <rect x={x * 2} y="17" width="2" height="6" fill="#f293be" opacity={Math.min(1, vocal[i] / voiceMax + 0.2)}/>}</g>;
    });
  }, [data]);
  return <div className="mf-song-wave"><svg viewBox="0 0 1200 150" preserveAspectRatio="none" aria-label="Choose a passage in the song" role="slider" tabIndex={0} aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={cursor} aria-valuetext={time(cursor)} onKeyDown={(e) => {
      const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (delta) { e.preventDefault(); onSeek(Math.max(0, Math.min(seconds, cursor + delta))); }
    }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width * seconds); }}>
    {bars}<rect x={from / seconds * 1200} y="26" width={Math.max(4, (to - from) / seconds * 1200)} height="106" fill="var(--fg)" fillOpacity="0.12" stroke="var(--caption)"/><line x1={sampleOf(grid, 0) / grid.rate / seconds * 1200} x2={sampleOf(grid, 0) / grid.rate / seconds * 1200} y1="28" y2="132" stroke="var(--fg)"/>
    {sections.map((s, i) => { const x = sampleOf(grid, s.bar * 4) / grid.rate / seconds * 1200; return <g key={s.bar}><line x1={x} x2={x} y1="28" y2="132" stroke="var(--detail)" strokeDasharray="3 4"/><text x={x + 4} y="145" fill="var(--detail)" fontSize="18">{i + 2}</text></g>; })}
    <line x1={cursor / seconds * 1200} x2={cursor / seconds * 1200} y1="0" y2="132" stroke="#ffdf8c" strokeWidth="2"/>
  </svg>{!data && <span className="mf-wave-loading">Reading the song…</span>}</div>;
}

function DetailWave({ buffer, grid, from, to, cursor, onSeek }: { buffer: AudioBuffer | null; grid: Beats; from: number; to: number; cursor: number; onSeek: (at: number) => void }) {
  const path = useMemo(() => {
    if (!buffer) return '';
    const data = buffer.getChannelData(0), points: string[] = [], lower: string[] = [];
    for (let x = 0; x < 800; x++) {
      const start = Math.max(0, Math.floor((from + x / 800 * (to - from)) * buffer.sampleRate));
      const end = Math.min(data.length, Math.ceil((from + (x + 1) / 800 * (to - from)) * buffer.sampleRate));
      let min = 0, max = 0;
      for (let i = start; i < end; i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); }
      points.push(`${x},${70 - max * 55}`); lower.push(`${x},${70 - min * 55}`);
    }
    return [...points, ...lower.reverse()].join(' ');
  }, [buffer, from, to]);
  const xOf = (at: number) => (at - from) / (to - from) * 800;
  const pick = (element: SVGSVGElement, clientX: number) => {
    const r = element.getBoundingClientRect();
    onSeek(Math.max(from, Math.min(to, from + (clientX - r.left) / r.width * (to - from))));
  };
  return <div className="mf-detail-wave">
    <div className="mf-cursor-reading"><span>Listen from <strong>{time(cursor, 3)}</strong></span><span>Drag the white line · ← → fine adjustment</span></div>
    <svg viewBox="0 0 800 140" preserveAspectRatio="none" role="slider" tabIndex={0} aria-label="Listening position in drum waveform" aria-valuemin={from} aria-valuemax={to} aria-valuenow={cursor} aria-valuetext={time(cursor)}
      onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); pick(e.currentTarget, e.clientX); }}
      onPointerMove={(e) => { if (e.buttons === 1) pick(e.currentTarget, e.clientX); }}
      onKeyDown={(e) => {
        let at = cursor;
        if (e.key === 'ArrowLeft') at -= e.shiftKey ? 0.1 : 0.01;
        else if (e.key === 'ArrowRight') at += e.shiftKey ? 0.1 : 0.01;
        else if (e.key === 'Home') at = from;
        else if (e.key === 'End') at = to;
        else return;
        e.preventDefault(); onSeek(Math.max(from, Math.min(to, at)));
      }}>
    <polygon points={path} fill="#c5a6e8" opacity="0.75"/>
    {grid.samples.map((sample, i) => { const at = sample / grid.rate, beat = i + grid.first; if (at < from || at > to) return null; const down = beat % 4 === 0; return <g key={i}><line x1={xOf(at)} x2={xOf(at)} y1="25" y2="140" stroke={down ? '#ffdf8c' : 'var(--detail)'} opacity={down ? 1 : 0.4}/><text x={xOf(at) + 4} y="17" fontSize="20" fill={down ? '#ffdf8c' : 'var(--detail)'}>{beat === 0 ? 'Bar 1 · first downbeat' : down ? `Bar ${beat / 4 + 1}` : ''}</text></g>; })}
    {cursor >= from && cursor <= to && <g data-review-cursor="" aria-hidden="true"><line x1={xOf(cursor)} x2={xOf(cursor)} y1="0" y2="140" stroke="var(--fg)" strokeWidth="2" vectorEffect="non-scaling-stroke"/><path d={`M ${xOf(cursor) - 9} 0 L ${xOf(cursor) + 9} 0 L ${xOf(cursor)} 10 Z`} fill="var(--fg)"/></g>}
  </svg><div className="mf-review-time"><span>{time(from)}</span><span>DRUMS · cursor moves playback, not the grid</span><span>{time(to)}</span></div></div>;
}

/** The only fixed action area; the rest of the page shares one scrollbar. */
export function AnalysisHeading({ mix, onSave, disabled, note }: { mix: Mix; onSave?: () => void; disabled?: boolean; note?: string }) {
  const hasStems = Boolean(mix.song?.sources.length);
  return <header className="mf-analysis-heading">
    <div><p className="mf-eyebrow">Track analysis</p><h2>{mix.song?.title}</h2><p>{hasStems ? 'Check the beat grid, review section changes, and manage the stems below.' : 'Separate the audio, then check the beat grid and song sections.'}</p></div>
    {hasStems && <div className="mf-analysis-commands"><div className="mf-review-actions"><Button onPress={mix.keepStems} title="Return without saving grid or section changes">Back to mix</Button>{onSave && <Button className="mf-primary" onPress={onSave} disabled={disabled}>Save & return to mix</Button>}</div><p role="status">{note ?? 'Grid and section changes stay here until you save.'}</p></div>}
  </header>;
}
