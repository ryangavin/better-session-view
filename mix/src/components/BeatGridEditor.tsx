import { useEffect, useMemo, useRef, useState } from 'react';
import { useReviewPlayback } from './reviewPlayback.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { beatAt, beatsOnHit, BEATS_PER_BAR, evenBeats, hitUnder, moved, ON_A_BEAT, rangeText, renumbered, retimed, sampleOf, tempoOf, worstBars, type BarOff } from '../warp.ts';
import { describe, FIRST_CHOICE, OFFERED, run, type Algorithm } from '../algorithms.ts';
import type { Mix } from '../state.ts';

const TEMPO: Param = { kind: 'float', min: 40, max: 300, defaultValue: 120, unit: 'custom', customUnit: '%0.2f' };

const channelsOf = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/** How off a bar has to read — its beats `ON_A_BEAT` further from their hits than the typical bar's, or more than half of them unconfirmed — to be worth going to. */
const OFF_ENOUGH = 0.5;

/**
 * The grid, open for checking and correcting over the real lanes: the one
 * mode for asking whether the song is right. Drag a beat, set bar 1 on its
 * hit, find the beats again, play the drums under a click with Space; the
 * ruler above offers the section changes it heard as cuts to keep. Done
 * keeps it all, Cancel restores the saved grid. What used to be a separate
 * page with its own timeline, zoom and algorithm picker is this, on the
 * lanes you mix on.
 */
export function BeatGridEditor({ mix, off, inspect, follow }: { mix: Mix; off: readonly BarOff[]; inspect(at: number): void; follow(at: number): void }) {
  const grid = mix.grid;
  /**
   * Where a bar starts, in seconds, for the playhead: half a sample into its
   * downbeat, because the head is kept in seconds and read back in bars, and
   * a beat's exact sample can come back a hair short of itself through that
   * arithmetic — landing the clock on 2.4.4 for a seek to bar 3.
   */
  const startOfBar = (bar: number) => (sampleOf(grid, bar * BEATS_PER_BAR) + 0.5) / grid.rate;
  const downbeat = startOfBar(0);
  const player = useReviewPlayback();
  const [problem, setProblem] = useState('');
  const [finding, setFinding] = useState(false);
  const [algorithm, setAlgorithm] = useState<Algorithm>(FIRST_CHOICE);
  /**
   * What the grid reads as, live off the draft: its tempo as a range, and
   * how many of its beats the kit confirms. This is the answer to the one
   * question the mode is for — is it right — and it moves with every drag,
   * renumbering and re-finding, where the last fit's agreement knows only
   * the grid it measured. Done being the primary button and Undo being
   * pressable already say whether anything has changed.
   */
  const share = useMemo(() => beatsOnHit(grid, mix.hits, ON_A_BEAT), [grid, mix.hits]);
  /**
   * Where it goes wrong, found rather than looked for. Rekordbox and Traktor
   * users check a grid by finding where it walks off the kit and fixing it
   * there, and a 24px strip across a hundred and twenty bars is nothing to
   * find that with. The lane shades each bar by how off it reads, and this
   * is the same reading ranked: each press seeks and zooms to the next-worst
   * bar, round again after the last, and a change to the grid starts the
   * round over because the bars have been re-read. It stands where a First
   * downbeat button stood; Home is bar 1 now.
   */
  const worst = useMemo(() => worstBars(off, OFF_ENOUGH), [off]);
  const [nth, setNth] = useState(0);
  useEffect(() => setNth(0), [worst]);
  const goWorst = () => {
    if (worst.length === 0) return;
    inspect(startOfBar(worst[nth % worst.length].bar));
    setNth(nth + 1);
  };
  /**
   * The tempo is also where a steady one is typed. Clicking it makes it a
   * field; a number committed there rules every beat evenly at it from bar
   * 1, which throws away the detected variation on purpose — the thing to
   * reach for when a record was made to a click and the detection wobbles.
   * It used to be a disclosure with its own BPM field below the buttons, and
   * the one tempo gesture there was; pulling a bar is the tempo gesture now,
   * and the typed number is the reading's own affordance rather than a row.
   */
  const [typing, setTyping] = useState(false);
  const field = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (typing) field.current?.querySelector<HTMLElement>('[role=slider]')?.focus(); }, [typing]);
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
  /**
   * Space plays the drums under a click, from the playhead to the end of the
   * stem, at original speed: the click is a test of the beats, and against
   * warped output it would test the pins instead. It runs with Space the way
   * Traktor's beat tick and Rekordbox's metronome run with the deck, because
   * a grid checked four bars at a time is never checked where it drifts;
   * `App.tsx` leaves Space to this while the mode is open. The playhead is
   * the audition's, so Bar 1 here lands on the bar that was just heard, and
   * the view pages after it as it does for real playback. A correction stops
   * it — its clicks were scheduled against the grid it started on — and so
   * does main playback.
   */
  const listen = () => {
    if (player.head !== null) { player.stop(); return; }
    mix.setPlaying(false); setProblem('');
    const drums = mix.audioOf('drums');
    const from = mix.position, to = Math.min(mix.seconds, drums?.duration ?? 0);
    if (!drums || to <= from) { setProblem('Choose a point before the end of the drum stem.'); return; }
    void player.play([drums], grid, from, to, true).catch((error) => { player.stop(); setProblem(`Could not listen: ${String(error)}`); });
  };
  useEffect(() => { player.stop(); }, [grid]);
  useEffect(() => { if (mix.playing) player.stop(); }, [mix.playing]);
  useEffect(() => {
    if (player.head === null) return;
    mix.seek(player.head);
    if (mix.seconds > 0) follow(player.head / mix.seconds);
  }, [player.head]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // A dialog over the lanes — the debug workspace, the details — owns the
      // keys while it is open: Escape closes it, not the grid.
      if (e.defaultPrevented || document.querySelector('dialog[open]') || (e.target as HTMLElement)?.closest('input, textarea, select, [role=dialog]')) return;
      if (e.key === 'Escape') { e.preventDefault(); mix.cancelGridEdit(); }
      else if (e.key === 'Home') { e.preventDefault(); inspect(downbeat); }
      else if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); mix.undoGridEdit(); }
      // A focused button or slider has its own meaning for Space, which is what App.tsx honours too.
      else if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('button, [role=slider], [role=combobox]')) { e.preventDefault(); listen(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mix.cancelGridEdit, mix.undoGridEdit, listen, inspect, downbeat]);
  /**
   * Bar 1 here: the beat nearest the playhead becomes bar 1, and lands on
   * the hit it was meant for on the way. Serato, Traktor and Rekordbox all
   * put bar 1 on the transient at the playhead, and a beat a few
   * milliseconds off its kick is the commonest thing this button is pressed
   * over — renumbering alone left that for a nudge that came in tens of
   * milliseconds and could not make five. Only that beat moves, its
   * neighbours hold, and it is a set beat afterwards, so the next pull of a
   * bar stretches from it. Shifting the whole map to the playhead was tried
   * before and dragged a good detection off every hit, which is why the
   * playhead itself is never where the beat goes: the hit is, and only when
   * there is one within a quarter of a beat. Option renumbers only, for a
   * downbeat that is meant to sit off the kick.
   */
  const setBarOne = (renumberOnly: boolean) => {
    const beat = Math.round(beatAt(grid, mix.position * grid.rate));
    const hit = renumberOnly ? null : hitUnder(grid, mix.hits, beat);
    mix.editGrid(renumbered(hit === null ? grid : moved(grid, beat, hit), beat));
  };
  return <section className="mf-grid-editor" aria-label="Beat grid editing">
    <div className="mf-grid-editor-row">
      <strong>Grid</strong>
      <span role="status" title="The tempo this grid runs at, read off its beats, and the share of its beats with a kick or a snare within 25 ms, over the part of the song that has drums. Both follow every change">
        {typing
          ? <span ref={field}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); } }}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTyping(false); }}>
              <NumberField param={TEMPO} value={tempoOf(grid)} showFill={false} label="Steady tempo BPM" width={70}
                onChange={(bpm) => mix.editGrid(evenBeats(grid.rate, grid.length, bpm, downbeat))} onRelease={() => setTyping(false)} />
            </span>
          : <button type="button" className="mf-grid-tempo" onClick={() => setTyping(true)} title="Click to type a steady tempo: every beat evenly spaced at it from bar 1, in place of the variation detected">{rangeText(grid)}</button>}
        {/* The detector's known miss is the wrong pulse — an octave, or 4:3 —
            and a re-count keeps the beats it placed right, where typing a
            tempo would rule them flat and Find beats would hear the same
            pulse again. Beside the tempo because that is the number they change. */}
        <span className="mf-grid-retime" aria-label="Re-count the beats">
          <button type="button" className="mf-grid-tempo" onClick={() => mix.editGrid(retimed(grid, 2, 1))} title="Twice the tempo: a beat between every two, the detected variation kept">×2</button>
          <button type="button" className="mf-grid-tempo" onClick={() => mix.editGrid(retimed(grid, 1, 2))} title="Half the tempo: every other beat, from bar 1, the detected variation kept">÷2</button>
          <button type="button" className="mf-grid-tempo" onClick={() => mix.editGrid(retimed(grid, 3, 2))} title="Three halves of the tempo: three beats across every two, for a detector that heard a 2:3 pulse">×3⁄2</button>
          <button type="button" className="mf-grid-tempo" onClick={() => mix.editGrid(retimed(grid, 2, 3))} title="Two thirds of the tempo: two beats across every three, for a detector that heard a 3:2 pulse">×2⁄3</button>
        </span>
        {share === null ? '' : ` · ${Math.round(share * 100)}% of beats on a hit`}
      </span>
      <Select items={OFFERED.map((id) => describe(id).name)} index={OFFERED.indexOf(algorithm)} onChange={(i) => setAlgorithm(OFFERED[i])} label="Beat finding algorithm" title={describe(algorithm).does} width={150} />
      <Button onPress={find} disabled={finding} title="Find the beats again on the drums with the chosen algorithm, and draw them over the saved grid. Undo puts the old grid back">{finding ? 'Finding…' : 'Find beats'}</Button>
      <Button onPress={goWorst} disabled={worst.length === 0} title="Seek and zoom to the bar furthest off its kicks and snares — its beats late or early, or with no hit under them — and press again for the next-worst, round again after the last. Home is bar 1">Worst bar</Button>
      <Button onPress={mix.undoGridEdit} disabled={!mix.gridEditDirty}>Undo</Button>
      <Button onPress={() => mix.openDebug('beats')} title="The full beat analysis: every algorithm side by side, the transients, the sweeps, and the onset knob">Advanced…</Button>
      <Button onPress={mix.cancelGridEdit}>Cancel</Button>
      <Button onPress={mix.finishGridEdit} className="mf-primary">Done</Button>
    </div>
    <div className="mf-grid-editor-row">
      <Button onPress={(e) => setBarOne(e.altKey)} title="Make the beat nearest the playhead bar 1, moved onto the kick or snare it is nearest when one is within a quarter of a beat; the other beats stay where they are. Option renumbers only, and moves nothing">Bar 1 here</Button>
      <Button onPress={() => mix.editGrid(renumbered(grid, -1))}>One beat earlier</Button>
      <Button onPress={() => mix.editGrid(renumbered(grid, 1))}>One beat later</Button>
    </div>
    <p>Zoom to a hit and drag its marker: a bar marker stretches the beats since the last point you set, any other beat moves alone, Command moves every beat together, and Option skips snapping to hits. Dashed marks on the ruler are section changes the stems suggest — click one to cut there. Waveform clicks only move the playhead; Space plays the drums with a click from the playhead, and Home goes to bar 1.</p>
    {problem && <p role="alert">{problem}</p>}
    {player.head !== null && <p role="status">Listening to drums at original speed · {player.head.toFixed(3)} s</p>}
  </section>;
}
