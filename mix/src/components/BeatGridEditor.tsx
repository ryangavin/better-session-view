import { useEffect, useState } from 'react';
import { useReviewPlayback } from './reviewPlayback.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { beatAt, evenBeats, renumbered, sampleOf, shifted, tempoOf } from '../warp.ts';
import { describe, FIRST_CHOICE, OFFERED, run, type Algorithm } from '../algorithms.ts';
import type { Mix } from '../state.ts';

const TEMPO: Param = { kind: 'float', min: 40, max: 300, defaultValue: 120, unit: 'custom', customUnit: '%0.2f' };

const channelsOf = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/**
 * The grid, open for checking and correcting over the real lanes: the one
 * mode for asking whether the song is right. Drag a beat, set bar 1, nudge,
 * find the beats again, listen with a click; the ruler above offers the
 * section changes it heard as cuts to keep. Done keeps it all, Cancel
 * restores the saved grid. What used to be a separate page with its own
 * timeline, zoom and algorithm picker is this, on the lanes you mix on.
 */
export function BeatGridEditor({ mix, inspect }: { mix: Mix; inspect(at: number): void }) {
  const grid = mix.grid, downbeat = sampleOf(grid, 0) / grid.rate;
  const player = useReviewPlayback();
  const [problem, setProblem] = useState('');
  const [finding, setFinding] = useState(false);
  const [algorithm, setAlgorithm] = useState<Algorithm>(FIRST_CHOICE);
  /**
   * The beats found again, as the draft: the chosen algorithm — what an
   * import gets, unless another is picked — run on the drums, drawn over
   * the saved grid until Done. Undo puts the old grid back, so trying it
   * costs nothing.
   */
  const find = () => {
    const drums = mix.audioOf('drums');
    if (!drums) { setProblem('No drums to read. Separate the track first.'); return; }
    player.stop(); setFinding(true); setProblem('');
    window.setTimeout(() => {
      try {
        const got = run(algorithm, channelsOf(drums), drums.sampleRate, {});
        const next = got?.beats ?? (got?.fit ? evenBeats(grid.rate, grid.length, got.fit.bpm, got.fit.offset) : null);
        if (!next) { setProblem(`${describe(algorithm).name} found no steady beat; the grid is as it was.`); return; }
        mix.editGrid(next);
        inspect(sampleOf(next, 0) / next.rate);
      } catch (error) {
        setProblem(`Could not find the beats: ${String(error)}`);
      } finally {
        setFinding(false);
      }
    }, 0);
  };
  // A correction or main transport playback ends the old-grid audition.
  useEffect(() => { player.stop(); }, [grid]);
  useEffect(() => { if (mix.playing) player.stop(); }, [mix.playing]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // A dialog over the lanes — the debug workspace, the details — owns the
      // keys while it is open: Escape closes it, not the grid.
      if (e.defaultPrevented || document.querySelector('dialog[open]') || (e.target as HTMLElement)?.closest('input, textarea, select, [role=dialog]')) return;
      if (e.key === 'Escape') { e.preventDefault(); mix.cancelGridEdit(); }
      else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); mix.undoGridEdit(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mix.cancelGridEdit, mix.undoGridEdit]);
  const listen = () => {
    if (player.head !== null) { player.stop(); return; }
    mix.setPlaying(false); setProblem('');
    const from = mix.position, to = Math.min(mix.seconds, sampleOf(grid, beatAt(grid, from * grid.rate) + 16) / grid.rate);
    const drums = mix.audioOf('drums');
    if (!drums || to <= from) { setProblem('Choose a point before the end of the drum stem.'); return; }
    void player.play([drums], grid, from, to, true).catch((error) => { player.stop(); setProblem(`Could not listen: ${String(error)}`); });
  };
  return <section className="mf-grid-editor" aria-label="Beat grid editing">
    <div className="mf-grid-editor-row">
      <strong>Grid</strong><span role="status">{mix.gridEditDirty ? 'Changed — Done keeps it, Cancel puts it back' : 'As saved'}</span>
      <Select items={OFFERED.map((id) => describe(id).name)} index={OFFERED.indexOf(algorithm)} onChange={(i) => setAlgorithm(OFFERED[i])} label="Beat finding algorithm" title={describe(algorithm).does} width={150} />
      <Button onPress={find} disabled={finding} title="Find the beats again on the drums with the chosen algorithm, and draw them over the saved grid. Undo puts the old grid back">{finding ? 'Finding…' : 'Find beats'}</Button>
      <Button onPress={() => inspect(downbeat)}>First downbeat</Button>
      <Button onPress={listen}>{player.head === null ? 'Listen with click' : 'Stop listening'}</Button>
      <Button onPress={mix.undoGridEdit} disabled={!mix.gridEditDirty}>Undo</Button>
      <Button onPress={() => mix.openDebug('beats')} title="The full beat analysis: every algorithm side by side, the transients, the sweeps, and the onset knob">Advanced…</Button>
      <Button onPress={mix.cancelGridEdit}>Cancel</Button>
      <Button onPress={mix.finishGridEdit} className="mf-primary">Done</Button>
    </div>
    <div className="mf-grid-editor-row">
      {/* Which beat is bar 1, not where the beats are: the beat nearest the
          playhead becomes 1 and nothing moves. Shifting the whole map to the
          playhead dragged a good detection off every hit, which is what the
          nudges are for when the beats really are off by a constant. */}
      <Button onPress={() => mix.editGrid(renumbered(grid, Math.round(beatAt(grid, mix.position * grid.rate))))} title="Make the beat nearest the playhead bar 1. The beats stay where they are; only the count changes">Bar 1 here</Button>
      <Button onPress={() => mix.editGrid(renumbered(grid, -1))}>One beat earlier</Button>
      <Button onPress={() => mix.editGrid(renumbered(grid, 1))}>One beat later</Button>
      <span>Nudge all beats</span><Button onPress={() => mix.editGrid(shifted(grid, -Math.round(grid.rate * .01)))}>−10 ms</Button><Button onPress={() => mix.editGrid(shifted(grid, Math.round(grid.rate * .01)))}>+10 ms</Button>
    </div>
    <p>Zoom to a hit and drag its beat marker; Option skips snapping to hits. Dashed marks on the ruler are section changes the stems suggest — click one to cut there. Waveform clicks only move the playhead.</p>
    {problem && <p role="alert">{problem}</p>}
    {player.head !== null && <p role="status">Listening to drums at original speed · {player.head.toFixed(3)} s</p>}
    <details><summary>Replace with a steady grid</summary><div className="mf-grid-editor-row"><span>Steady tempo BPM</span><NumberField param={TEMPO} value={tempoOf(grid)} showFill={false} label="Steady grid tempo BPM" width={85} onChange={(bpm) => mix.editGrid(evenBeats(grid.rate, grid.length, bpm, downbeat))}/><span>Replaces tempo variation with evenly spaced beats.</span></div></details>
  </section>;
}
