import { useEffect, useState } from 'react';
import { useReviewPlayback } from './reviewPlayback.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { beatAt, evenBeats, renumbered, sampleOf, shifted, tempoOf } from '../warp.ts';
import type { Mix } from '../state.ts';

const TEMPO: Param = { kind: 'float', min: 40, max: 300, defaultValue: 120, unit: 'custom', customUnit: '%0.2f' };

/** Manual correction lives beside the actual mixer lanes; detection lives in Analyze. */
export function BeatGridEditor({ mix, inspect }: { mix: Mix; inspect(at: number): void }) {
  const grid = mix.grid, downbeat = sampleOf(grid, 0) / grid.rate;
  const player = useReviewPlayback();
  const [problem, setProblem] = useState('');
  // A correction or main transport playback ends the old-grid audition.
  useEffect(() => { player.stop(); }, [grid]);
  useEffect(() => { if (mix.playing) player.stop(); }, [mix.playing]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target as HTMLElement)?.closest('input, textarea, select, [role=dialog]')) return;
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
      <strong>Editing beat grid</strong><span role="status">{mix.gridEditDirty ? 'Unsaved timing edits' : 'No timing edits yet'}</span>
      <Button onPress={() => inspect(downbeat)}>First downbeat</Button>
      <Button onPress={listen}>{player.head === null ? 'Listen with click' : 'Stop listening'}</Button>
      <Button onPress={mix.undoGridEdit} disabled={!mix.gridEditDirty}>Undo</Button>
      <Button onPress={mix.cancelGridEdit}>Cancel</Button>
      <Button onPress={mix.finishGridEdit} className="mf-primary">Done</Button>
    </div>
    <div className="mf-grid-editor-row">
      <Button onPress={() => mix.editGrid(shifted(grid, Math.round(mix.position * grid.rate - sampleOf(grid, 0))))}>Set bar 1 at playhead</Button>
      <Button onPress={() => mix.editGrid(renumbered(grid, -1))}>One beat earlier</Button>
      <Button onPress={() => mix.editGrid(renumbered(grid, 1))}>One beat later</Button>
      <span>Nudge all beats</span><Button onPress={() => mix.editGrid(shifted(grid, -Math.round(grid.rate * .01)))}>−10 ms</Button><Button onPress={() => mix.editGrid(shifted(grid, Math.round(grid.rate * .01)))}>+10 ms</Button>
    </div>
    <p>Zoom to a hit and drag its beat marker; Option skips snapping to hits. Waveform clicks only move the playhead. Done keeps timing edits; Cancel restores the saved grid.</p>
    {problem && <p role="alert">{problem}</p>}
    {player.head !== null && <p role="status">Listening to drums at original speed · {player.head.toFixed(3)} s</p>}
    <details><summary>Replace with a steady grid</summary><div className="mf-grid-editor-row"><span>Steady tempo BPM</span><NumberField param={TEMPO} value={tempoOf(grid)} showFill={false} label="Steady grid tempo BPM" width={85} onChange={(bpm) => mix.editGrid(evenBeats(grid.rate, grid.length, bpm, downbeat))}/><span>Replaces tempo variation with evenly spaced beats.</span></div></details>
  </section>;
}
