import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { ReviewTimeline } from './ReviewTimeline.tsx';
import type { Mix } from '../state.ts';
import { evenBeats, beatAt, sampleOf, rangeText, tempoOf, type Beats } from '../warp.ts';
import { measure, type Measurement } from '../debug/waveforms/measure.ts';
import { describe, OFFERED, run } from '../algorithms.ts';
import { sectionSuggestions } from '../sections.ts';
import { barText } from '../slices.ts';
import { useReviewPlayback } from './reviewPlayback.ts';
import './TrackReview.css';

const time = (at: number, precision = 2) => {
  const scale = 10 ** precision, ticks = Math.round(Math.max(0, at) * scale);
  return `${Math.floor(ticks / (60 * scale))}:${((ticks % (60 * scale)) / scale).toFixed(precision).padStart(precision + 3, '0')}`;
};
const channels = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/** A review, not a diagnostic dashboard. Detection results stay local until Apply. */
export function TrackReview({ mix, details }: { mix: Mix; details?: ReactNode }) {
  const [grid, setGrid] = useState(mix.grid);
  const [dirty, setDirty] = useState(false);
  const [showSaved, setShowSaved] = useState(true);
  const [data, setData] = useState<Measurement | null>(null);
  const [note, setNote] = useState('');
  const [running, setRunning] = useState(false);
  const [useSections, setUseSections] = useState(false);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [click, setClick] = useState(true);
  const [listenSource, setListenSource] = useState<string | null>(null);
  const downbeat = sampleOf(grid, 0) / grid.rate;
  const [cursor, setCursor] = useState(Math.max(0, downbeat));
  const axis = useAxis({ seconds: mix.seconds });
  const [showStems, setShowStems] = useState(true);
  const [algorithm, setAlgorithm] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
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
  const suggestions = useMemo(() => data ? sectionSuggestions(data, grid) : [], [data, grid]);
  const chosen = suggestions.filter((s) => !dismissed.includes(s.bar));
  const change = (next: Beats) => {
    player.stop(); setGrid(next); setDirty(true); setUseSections(false); setDismissed([]); setSelected(null);
  };
  const jump = (at: number) => {
    player.stop(); setCursor(Math.max(0, Math.min(mix.seconds, at)));
    if (at < axis.window.from || at > axis.window.to) {
      const span = axis.window.to - axis.window.from, lead = Math.min(1, span / 4);
      axis.setWindow({ from: at - lead, to: at - lead + span });
    }
  };
  const inspect = (at: number) => { jump(at); axis.setWindow({ from: at - 1, to: at + 3 }); };
  const selection = chosen.find((s) => s.bar === selected);
  const selectSection = (bar: number) => { setSelected(bar); jump(sampleOf(grid, bar * 4) / grid.rate); };
  const zoom = (factor: number) => axis.zoom(factor, Math.max(0, Math.min(1, (cursor - axis.window.from) / (axis.window.to - axis.window.from))));
  const reset = () => {
    player.stop(); setRunning(true); setNote('Finding the beat again…');
    pending.current = setTimeout(() => {
      pending.current = null;
      try {
        // The same `run` the harness compares, so what is offered here is
        // literally what was measured there. It used to be written out again
        // inline, and the two had already parted: this one fell back to an
        // even grid where the harness reported no beats at all.
        const drums = audioOf('drums');
        const input = drums && channels(drums);
        if (!drums || !input) { setNote('No drums to read. Separate the track first.'); return; }
        const chosen = OFFERED[algorithm];
        const got = run(chosen, input, drums.sampleRate, {});
        const next = got?.beats ?? (got?.fit ? evenBeats(grid.rate, grid.length, got.fit.bpm, got.fit.offset) : null);
        if (!next) { setNote(`${describe(chosen).name} found no steady beat. Your current grid is unchanged — try another algorithm, or correct it in the main view.`); return; }
        change(next); inspect(sampleOf(next, 0) / next.rate);
        setNote(`${describe(chosen).name} grid ready to check — ${tempoOf(next).toFixed(2)} BPM over ${next.samples.length} beats. Apply to replace the saved beat map, including manual timing corrections, or discard the preview.`);
      } catch (error) { setNote(`Couldn't reset the grid: ${String(error)}`); }
      finally { setRunning(false); }
    }, 0);
  };
  const playFrom = (from: number) => {
    const beat = beatAt(grid, from * grid.rate);
    const to = Math.min(mix.seconds, sampleOf(grid, beat + 16) / grid.rate);
    const buffers = (listenSource ? [listenSource] : sources).flatMap((id) => { const b = audioOf(id); return b ? [b] : []; });
    if (to <= from || !buffers.length) { setNote('Choose a point before the end of the song.'); return; }
    void player.play(buffers, grid, from, to, click).catch((error) => { player.stop(); setNote(`Couldn't play: ${String(error)}`); });
  };
  const play = () => { if (player.head !== null) player.stop(); else playFrom(cursor); };
  const { from, to } = axis.window;
  useEffect(() => {
    if (player.head === null) return;
    setCursor(player.head);
    if (player.head > to || player.head < from) axis.setWindow({ from: player.head, to: player.head + to - from });
  }, [player.head, from, to, axis.setWindow]);
  const saved = () => { change(mix.grid); setDirty(false); jump(sampleOf(mix.grid, 0) / mix.grid.rate); setNote('Saved grid restored.'); };
  const save = () => {
    player.stop();
    // Only when this preview is what is being applied: an untouched grid keeps
    // whatever laid it, and a hand-corrected one is nobody's algorithm.
    mix.saveReview(grid, useSections ? [{ bar: 0, name: 'Section 1' }, ...chosen.map((s, i) => ({ bar: s.bar, name: `Section ${i + 2}` }))] : undefined, dirty ? OFFERED[algorithm] : mix.madeBy);
    mix.keepStems();
  };
  return <div className="mf-review-layout">
    <AnalysisHeading mix={mix} onSave={save} disabled={running} note={note || (dirty || useSections ? 'Applying replaces only the results you selected below.' : 'Inspect detection here. Edit timing in the main view.')} />
    <div className="mf-track-review">
    <section className="mf-review-workspace" aria-label="Song timeline review">
      <div className="mf-review-actions mf-review-analysis-controls"><span>Beat algorithm</span><Select items={OFFERED.map((id) => describe(id).name)} index={algorithm} onChange={setAlgorithm} label="Beat analysis algorithm" width={186} title={describe(OFFERED[algorithm]).does} />
        <Button disabled={running} onPress={reset}>{running ? 'Finding beats…' : 'Run beat analysis'}</Button><Button disabled={!dirty || running} onPress={saved}>Discard beat preview</Button>
      </div>
      {dirty && <div className="mf-review-preview" role="status"><strong>Beat detection preview</strong><p>Apply replaces the saved beat map, including any manual corrections. Your current sections stay unless you select the section suggestions.</p><Toggle on={showSaved} onChange={setShowSaved} label="Compare saved grid" width={150}>Compare saved grid</Toggle><p>Gold lines: proposed bars. Cyan dashed lines: saved bars. Zoom in to compare; the metronome follows the proposal.</p></div>}
      <div className="mf-review-title"><h3>Song timeline</h3><span>{time(mix.seconds)} · {rangeText(grid)} BPM · 4/4 · {dirty ? 'Detection preview' : mix.fitFailed || !mix.beats && !mix.detected ? 'Check the grid' : 'Saved grid'}</span></div>
      <div className="mf-review-actions mf-review-navigation">
        <Button onPress={axis.whole}>Whole song</Button><Button onPress={() => zoom(0.5)} title="Zoom in around listening position">Zoom in</Button><Button onPress={() => zoom(2)}>Zoom out</Button>
        <Button onPress={() => axis.pan(-(to - from) * 0.75)} title="Previous passage">←</Button><Button onPress={() => axis.pan((to - from) * 0.75)} title="Next passage">→</Button>
        <Button onPress={() => inspect(downbeat)}>First downbeat · {time(downbeat)}</Button><Button onPress={() => inspect(mix.seconds / 2)}>Middle</Button><Button onPress={() => inspect(Math.max(0, mix.seconds - 12))}>Near end</Button>
        <Toggle on={showStems} onChange={setShowStems} label="Individual stems" width={118}>Individual stems</Toggle>
      </div>
      <ReviewTimeline data={data} grid={grid} referenceGrid={dirty && showSaved ? mix.grid : undefined} axis={axis} cursor={player.head ?? cursor} audioOf={audioOf} sources={sources} stems={showStems} suggestions={chosen} selected={selected} onSelect={selectSection} onSeek={jump}/>
      <div className="mf-review-actions mf-review-listening"><Button onPress={play}>{player.head === null ? '▶ Listen for 4 bars' : '■ Stop'}</Button>
        <Toggle on={click} onChange={(on) => { player.stop(); setClick(on); }} label="Metronome" width={90}>Metronome</Toggle>
        <Select items={['Full song', ...sources.map((s) => `${s.charAt(0).toUpperCase()}${s.slice(1)} only`)]} index={listenSource ? sources.indexOf(listenSource) + 1 : 0} onChange={(index) => { player.stop(); setListenSource(index === 0 ? null : sources[index - 1]); }} label="Listen to" />
        <span className="mf-review-position">Listen from <strong>{time(cursor, 3)}</strong></span>
      </div>
      <p className="mf-review-hint">Click or drag to listen from a point; ← → fine-tunes it. Zoom reveals samples and beats. Shift-scroll to zoom, scroll to move. Gold lines mark bars. {showStems ? (to - from <= 8 ? 'Sample heights use the original audio level.' : 'Each stem is scaled to its own peak RMS for readability.') : (to - from <= 8 ? 'Detail shows drums.' : 'Mix color follows the spectrum; pink marks vocal activity.')}</p>
      <div className="mf-review-section-controls">
        <div className="mf-review-actions"><span>Section changes</span>
          <Select items={['Choose a change', ...chosen.map((s, i) => `${i + 2} · ${s.reason} · bar ${barText(s.bar)}`)]} index={selection ? chosen.indexOf(selection) + 1 : 0} label="Review section change" onChange={(index) => index ? selectSection(chosen[index - 1].bar) : setSelected(null)} />
          <Toggle className="mf-review-keep" on={useSections} disabled={!chosen.length} onChange={setUseSections} label={`Use these ${chosen.length + 1} sections when applying`} width={190}>Use these {chosen.length + 1} sections</Toggle>
        </div>
        {selection && <div className="mf-review-actions mf-review-selected"><strong>{selection.reason}</strong><span>Bar {barText(selection.bar)} · {time(sampleOf(grid, selection.bar * 4) / grid.rate)}</span>
          <Button onPress={() => { const at = Math.max(0, sampleOf(grid, selection.bar * 4) / grid.rate - 1); jump(at); playFrom(at); }}>Listen to change</Button>
          <Button onPress={() => inspect(sampleOf(grid, selection.bar * 4) / grid.rate)}>Inspect change</Button>
          <Button onPress={() => { setDismissed([...dismissed, selection.bar]); setSelected(null); setUseSections(false); }}>Dismiss change</Button></div>}
        <p className="mf-review-hint">{useSections ? 'Applying replaces your current cuts and names with numbered sections.' : `Your ${mix.slices.length} current sections stay until you choose to use these suggestions.`} {!data ? 'Reading song structure…' : !chosen.length ? 'No clear changes heard.' : 'Select a numbered marker to review the change.'}</p>
      </div>
      <p className="mf-review-hint">To move beats or set bar 1 by hand, return to the mix and choose Edit beat grid.</p>
    </section>
    {details}
    </div>
  </div>;

}

/** The only fixed action area; the rest of the page shares one scrollbar. */
export function AnalysisHeading({ mix, onSave, disabled, note }: { mix: Mix; onSave?: () => void; disabled?: boolean; note?: string }) {
  const hasStems = Boolean(mix.song?.sources.length);
  return <header className="mf-analysis-heading">
    <div><p className="mf-eyebrow">Track analysis</p><h2>{mix.song?.title}</h2><p>{hasStems ? 'Preview beat detection, inspect section suggestions, and choose stem analysis.' : 'Separate the audio, then detect its beats and song sections.'}</p></div>
    {hasStems && <div className="mf-analysis-commands"><div className="mf-review-actions"><Button onPress={mix.keepStems} title="Return without applying analysis previews">Back to mix</Button>{onSave && <Button className="mf-primary" onPress={onSave} disabled={disabled}>Apply analysis & return</Button>}</div><p role="status">{note ?? 'Analysis stays a preview until you apply it.'}</p></div>}
  </header>;
}
