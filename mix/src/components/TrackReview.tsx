import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import type { Mix } from '../state.ts';
import { evenBeats, beatAt, renumbered, sampleOf, shifted, tempoOf, rangeText, type Beats } from '../warp.ts';
import { heardIn } from '../transients.ts';
import { fitOf } from '../tempo.ts';
import { followOf } from '../follow.ts';
import { measure, type Measurement } from '../debug/waveforms/measure.ts';
import { sectionSuggestions } from '../sections.ts';
import { useReviewPlayback } from './reviewPlayback.ts';
import './TrackReview.css';

const time = (at: number) => `${Math.floor(Math.max(0, at) / 60)}:${(Math.max(0, at) % 60).toFixed(2).padStart(5, '0')}`;
const channels = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/** A review, not a diagnostic dashboard. Every adjustment stays local until Save. */
export function TrackReview({ mix }: { mix: Mix }) {
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
  const play = () => {
    if (player.head !== null) { player.stop(); return; }
    const beat = Math.floor(beatAt(grid, focus * grid.rate) / 4 + 1e-7) * 4;
    const from = Math.max(0, sampleOf(grid, beat) / grid.rate - 0.3);
    const to = Math.min(mix.seconds, sampleOf(grid, beat + 16) / grid.rate);
    const buffers = (drumsOnly ? ['drums'] : sources).flatMap((id) => { const b = audioOf(id); return b ? [b] : []; });
    if (to <= from || !buffers.length) { setNote('Choose a point before the end of the song.'); return; }
    void player.play(buffers, grid, from, to, click).catch((error) => { player.stop(); setNote(`Couldn't play: ${String(error)}`); });
  };
  const detailFrom = Math.max(0, Math.min(mix.seconds - 4, focus - 1));
  const detailTo = Math.min(mix.seconds, detailFrom + 4);
  useEffect(() => {
    if (player.head !== null && (player.head > detailTo || player.head < detailFrom)) setFocus(player.head);
  }, [player.head, detailFrom, detailTo]);
  const saved = () => { change(mix.grid); setDirty(false); jump(sampleOf(mix.grid, 0) / mix.grid.rate); setNote('Saved grid restored.'); };
  return <div className="mf-track-review">
    <section className="mf-review-overview">
      <div className="mf-review-title"><div><p className="mf-eyebrow">THE SHAPE OF THE SONG</p><h3>Hear the changes. See the whole picture.</h3></div><span>{time(mix.seconds)} <span aria-hidden="true">·</span> {rangeText(grid)} BPM <span aria-hidden="true">·</span> 4/4</span></div>
      <SongWave data={data} grid={grid} sections={chosen} seconds={mix.seconds} cursor={player.head ?? cursor} onSeek={jump} />
      <p className="mf-review-hint">Click the waveform to explore. Pink shows vocal activity; numbered lines are suggested section starts.</p>
    </section>
    <div className="mf-review-columns">
      <section className="mf-review-card">
        <div className="mf-review-title"><div><p className="mf-eyebrow">01 / CHECK THE RHYTHM</p><h3>Does the click sit on the beat?</h3></div><span className="mf-review-badge">{dirty ? 'Unsaved grid' : mix.fitFailed || !mix.beats && !mix.detected ? 'Check the grid' : 'Ready to listen'}</span></div>
        <p>Start with the first downbeat, then check later in the song. The brighter line and higher click mark the first beat of each bar.</p>
        <div className="mf-review-actions"><Button onPress={() => jump(downbeat)}>First downbeat · {time(downbeat)}</Button><Button onPress={() => jump(mix.seconds / 2)}>Middle</Button><Button onPress={() => jump(Math.max(0, mix.seconds - 12))}>Near end</Button></div>
        <DetailWave buffer={audioOf('drums')} grid={grid} from={detailFrom} to={detailTo} cursor={player.head ?? cursor} onSeek={(at) => { player.stop(); setCursor(at); }} />
        <div className="mf-review-actions"><Button onPress={play}>{player.head === null ? '▶ Listen for 4 bars' : '■ Stop'}</Button>
          <label><input type="checkbox" checked={click} onChange={(e) => { player.stop(); setClick(e.target.checked); }} /> Metronome</label>
          <select aria-label="Listen to" value={drumsOnly ? 'drums' : 'song'} onChange={(e) => { player.stop(); setDrumsOnly(e.target.value === 'drums'); }}><option value="song">Full song</option><option value="drums">Drums only</option></select></div>
        <details className="mf-review-adjust"><summary>Beat not lining up? Adjust the grid here</summary>
          <p>Click the drum waveform to place the cursor, then set bar 1. This shifts the whole grid and preserves its tempo changes.</p>
          <div className="mf-review-actions"><Button disabled={running} onPress={() => { const next = shifted(grid, Math.round((cursor - downbeat) * grid.rate)); change(next); jump(cursor); }}>Set bar 1 at {time(cursor)}</Button><Button disabled={running} onPress={() => { const next = renumbered(grid, -1); change(next); jump(sampleOf(next, 0) / next.rate); }}>One beat earlier</Button><Button disabled={running} onPress={() => { const next = renumbered(grid, 1); change(next); jump(sampleOf(next, 0) / next.rate); }}>One beat later</Button></div>
          <div className="mf-review-actions"><span>Nudge all beats</span><Button disabled={running} onPress={() => change(shifted(grid, -Math.round(grid.rate * 0.01)))}>−10 ms</Button><Button disabled={running} onPress={() => change(shifted(grid, Math.round(grid.rate * 0.01)))}>+10 ms</Button></div>
          <label className="mf-review-tempo">Use a steady tempo <input aria-label="Steady tempo BPM" type="number" min="40" max="300" step="0.01" defaultValue={tempoOf(grid).toFixed(2)} key={tempoOf(grid).toFixed(2)} onBlur={(e) => { const bpm = Number(e.target.value); if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 300 && Math.abs(bpm - tempoOf(grid)) > 0.005) change(evenBeats(grid.rate, grid.length, bpm, downbeat)); }} /> BPM</label>
          <p className="mf-review-hint">Setting a tempo replaces tempo variations with evenly spaced beats.</p>
        </details>
        <div className="mf-review-actions mf-review-reset"><Button disabled={running} onPress={reset}>{running ? 'Finding beats…' : 'Reset grid to automatic'}</Button><Button disabled={!dirty || running} onPress={saved}>Discard grid changes</Button></div>
      </section>
      <section className="mf-review-card">
        <div className="mf-review-title"><div><p className="mf-eyebrow">02 / FIND THE SECTIONS</p><h3>Where does the music change?</h3></div><span className="mf-review-badge">Suggestions</span></div>
        <p>Look for vocals arriving or fading, an instrument entering, or a sustained change in energy. Listen at a boundary before keeping it.</p>
        <div className="mf-review-actions"><label>Place changes on <select aria-label="Section spacing" value={quantum} onChange={(e) => { setQuantum(Number(e.target.value) as 4 | 8); setDismissed([]); setUseSections(false); }}><option value={4}>4-bar phrases</option><option value={8}>8-bar phrases</option></select></label><span>{chosen.length} changes</span></div>
        <div className="mf-review-sections">{!data ? <p role="status">Reading energy and vocal activity…</p> : !chosen.length ? <p>No clear changes at this spacing. Try 4-bar phrases; you can also keep the current sections.</p> : chosen.map((s, i) => <div className="mf-review-section" key={s.bar}><button onClick={() => jump(sampleOf(grid, s.bar * 4) / grid.rate)}><b>{String(i + 2).padStart(2, '0')}</b><span>{s.reason}<small>Bar {s.bar + 1} · {time(sampleOf(grid, s.bar * 4) / grid.rate)}</small></span><span aria-hidden="true">↗</span></button><button aria-label={`Dismiss change at bar ${s.bar + 1}`} onClick={() => { setDismissed([...dismissed, s.bar]); setUseSections(false); }}>×</button></div>)}</div>
        <label className="mf-review-keep"><input type="checkbox" checked={useSections} disabled={!chosen.length} onChange={(e) => setUseSections(e.target.checked)} /> Use these {chosen.length + 1} sections when saving</label>
        <p className="mf-review-hint">{useSections ? 'This replaces the current section cuts and names with numbered sections.' : `Your ${mix.slices.length} current sections stay as they are unless you choose this.`} Suggestions describe audible changes, not verse or chorus labels.</p>
      </section>
    </div>
    <footer className="mf-review-footer"><p role="status">{note || 'Listen first. Nothing changes until you save.'}</p><Button disabled={running} onPress={() => { player.stop(); mix.saveReview(grid, useSections ? [{ bar: 0, name: 'Section 1' }, ...chosen.map((s, i) => ({ bar: s.bar, name: `Section ${i + 2}` }))] : undefined); mix.keepStems(); }}>Save & return to mix</Button></footer>
  </div>;
}

function SongWave({ data, grid, sections, seconds, cursor, onSeek }: { data: Measurement | null; grid: Beats; sections: {bar: number}[]; seconds: number; cursor: number; onSeek: (at: number) => void }) {
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
  return <div className="mf-song-wave"><svg viewBox="0 0 1200 150" preserveAspectRatio="none" aria-label="Song waveform" role="img" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width * seconds); }}>
    {bars}<line x1={sampleOf(grid, 0) / grid.rate / seconds * 1200} x2={sampleOf(grid, 0) / grid.rate / seconds * 1200} y1="28" y2="132" stroke="var(--text)"/>
    {sections.map((s, i) => { const x = sampleOf(grid, s.bar * 4) / grid.rate / seconds * 1200; return <g key={s.bar}><line x1={x} x2={x} y1="28" y2="132" stroke="var(--detail)" strokeDasharray="3 4"/><text x={x + 4} y="145" fill="var(--detail)" fontSize="18">{i + 2}</text></g>; })}
    <line x1={cursor / seconds * 1200} x2={cursor / seconds * 1200} y1="0" y2="132" stroke="#ffdf8c" strokeWidth="2"/>
  </svg><input className="mf-song-seek" type="range" aria-label="Choose a passage in the song" min={0} max={seconds} step="0.01" value={cursor} onChange={(e) => onSeek(Number(e.target.value))}/>{!data && <span className="mf-wave-loading">Reading the song…</span>}</div>;
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
  return <div className="mf-detail-wave"><svg viewBox="0 0 800 140" preserveAspectRatio="none" role="img" aria-label="Drum waveform and beat grid" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(from + (e.clientX - r.left) / r.width * (to - from)); }}>
    <polygon points={path} fill="#c5a6e8" opacity="0.75"/>
    {grid.samples.map((sample, i) => { const at = sample / grid.rate, beat = i + grid.first; if (at < from || at > to) return null; const down = beat % 4 === 0; return <g key={i}><line x1={xOf(at)} x2={xOf(at)} y1="25" y2="140" stroke={down ? '#ffdf8c' : 'var(--detail)'} opacity={down ? 1 : 0.4}/><text x={xOf(at) + 4} y="17" fontSize="20" fill={down ? '#ffdf8c' : 'var(--detail)'}>{beat === 0 ? 'Bar 1 · first downbeat' : down ? `Bar ${beat / 4 + 1}` : ''}</text></g>; })}
    {cursor >= from && cursor <= to && <line x1={xOf(cursor)} x2={xOf(cursor)} y1="22" y2="140" stroke="var(--text)" strokeWidth="2"/>}
  </svg><div className="mf-review-time"><span>{time(from)}</span><span>DRUMS · click to place cursor</span><span>{time(to)}</span></div><input type="range" aria-label="Position in detail waveform" min={from} max={to} step="0.001" value={Math.max(from, Math.min(to, cursor))} onChange={(e) => onSeek(Number(e.target.value))}/></div>;
}
