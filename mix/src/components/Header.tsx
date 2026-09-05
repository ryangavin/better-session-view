import { useState } from 'react';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import type { Snap } from '../grid.ts';
import type { Ready } from '../openflow.ts';
import { QuietField } from './Editable.tsx';
import { DebugWorkspace } from '../debug/Workspace.tsx';
import type { Mix } from '../state.ts';
import { FASTEST, SLOWEST } from '../tempo.ts';
import { bpmText, rangeText } from '../warp.ts';
import './Header.css';

/**
 * Playback and snap stay at hand; Analyze opens the track's analysis home.
 * The compact grid readout and warp switch remain visible in the mixer.
 * Algorithm selection, candidate review and manual-grid entry live on the
 * analysis page rather than in a row of competing header buttons.
 */

const play = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);

const pause = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const stopMark = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" />
  </svg>
);

const loopMark = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 9h13l-3-3M20 15H7l3 3" />
  </svg>
);


/** A bug: the analysis harness, which is a debugging page and says so. */
const bugMark = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="8" y="8" width="8" height="11" rx="4" />
    <path d="M10 8V6.5a2 2 0 0 1 4 0V8M4 13h4M16 13h4M5 19l3-2M19 19l-3-2M5 8l3 2M19 8l-3 2" />
  </svg>
);


/**
 * The tempo, in the transport, because it is the speed the record plays at.
 *
 * Unlabelled, and the group is not: `snap` and `beats` name a cluster of marks
 * and buttons that would otherwise be a rebus. A BPM does not need naming.
 *
 * It used to live in the export dialog, which was the only place a tempo could
 * be seen or changed — a number that rules every line in the window, reachable
 * only from the thing you press when you have finished. Auto-warp is unusable
 * without it: the whole feedback from pressing it is a number appearing and the
 * ticks lining up.
 *
 * Unnamed and unfilled, for the reason `widgets/docs/catalogue.md` gives about
 * fills: 124 of a 70-to-190 range is 45% of nothing, and it would be the
 * loudest thing on the bar while carrying the least.
 */
const TEMPO: Param = {
  kind: 'float',
  min: SLOWEST,
  max: FASTEST,
  defaultValue: 120,
  unit: 'custom',
  customUnit: '%0.1f',
};

/** bar.beat.sixteenth, one-based, from a position measured in bars. */
function position(bar: number, bars: number): string {
  const whole = Math.floor(bar);
  const beat = Math.floor((bar - whole) * 4);
  const sixteenth = Math.floor(((bar - whole) * 4 - beat) * 4);
  return `${Math.min(whole, Math.max(0, bars - 1)) + 1}.${beat + 1}.${sixteenth + 1}`;
}

/** `3:07`, beside the bar count, because a length in bars is a claim and this is not. */
function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The rungs a cut can be held to, coarsest first.
 *
 * Marked rather than named, because five words would take the width of the
 * transport and the marks are the ones a musician already reads: the grid's
 * own hatch, four bars, one bar, a beat, half of one.
 */
const SNAPS: readonly { id: Snap; mark: string; says: string }[] = [
  { id: 'grid', mark: '⌗', says: 'Cuts land on the grid the ruler is drawing at this zoom' },
  { id: 'phrase', mark: '4', says: 'Cuts land on four bars, whatever the zoom' },
  { id: 'bar', mark: '1', says: 'Cuts land on a bar, whatever the zoom' },
  { id: 'beat', mark: '♩', says: 'Cuts land on a beat, whatever the zoom' },
  { id: 'half', mark: '½', says: 'Cuts land on half a beat, whatever the zoom' },
];

export function Header({ mix, ready }: { mix: Mix; ready: Ready | null }) {
  const live = mix.phase === 'ready';
  const song = mix.song;

  const [harness, setHarness] = useState(false);

  return (
    <header className="mf-header">
      {/* Silent when the toolchain is fine. A green light that is always on is
          a thing you stop seeing; a red one that appears is not. */}
      {ready && !ready.ok && (
        <span className="mf-broken" title={`${ready.says} — see mix/docs/demucs.md`}>
          <i />
          engine
        </span>
      )}

      <div className="mf-mark">
        mix<span>[flow]</span>
      </div>

      <div className="mf-open">
        {song ? (
          <>
            <QuietField
              className="mf-open-title"
              value={song.title}
              label="Title"
              title="The track's name. Type over it to correct it"
              required
              onCommit={(next) => void mix.editTrack(song.id, { title: next.trim() })}
            />
            <QuietField
              className="mf-open-artist"
              value={song.artist ?? ''}
              label="Artist"
              placeholder="artist"
              title="Who it is by. Type over it to correct it"
              onCommit={(next) => void mix.editTrack(song.id, { artist: next.trim() || null })}
            />
            <button
              type="button"
              className="mf-debug"
              onClick={() => setHarness(true)}
              title="Open debugging and experiments — see mix/docs/harness.md"
              aria-label="Open debug workspace"
            >
              {bugMark}
            </button>
          </>
        ) : (
          <span className="mf-open-none">nothing open</span>
        )}
      </div>

      {live && (
        <>
          {/* Playback: the buttons, the tempo they run at, and the reading.

              Tempo is here rather than beside Auto-warp because with warp on
              it is the speed the song plays at — the one number on the bar
              that changes what you hear. Measuring it is a separate job, and
              it has a separate group. */}
          <div className="mf-group" role="group" aria-label="Playback">
            <Button
              onPress={() => mix.setPlaying(!mix.playing)}
              label={mix.playing ? 'Pause' : 'Play'}
              title={
                !mix.playable
                  ? mix.decoding
                    ? 'Reading the stems'
                    : 'No stems loaded'
                  : mix.playing
                    ? 'Pause (Space)'
                    : 'Play (Space)'
              }
              width={26}
              disabled={!mix.playable}
              className={mix.playing ? 'mf-playing' : undefined}
            >
              {mix.playing ? pause : play}
            </Button>
            <Button
              onPress={mix.stop}
              label="Stop"
              title="Stop and return to the top"
              width={26}
              disabled={!mix.playable}
            >
              {stopMark}
            </Button>
            <Toggle
              on={mix.loop}
              onChange={mix.setLoop}
              label="Loop"
              title={
                mix.region
                  ? 'Looping a part of the track. Command-L lets it go'
                  : 'Loop the whole track. Shift-click the timeline, or Command-L for the selected section'
              }
              width={26}
              className={mix.region ? 'mf-looping-part' : undefined}
            >
              {loopMark}
            </Toggle>
            <NumberField
              param={TEMPO}
              value={mix.targetBpm}
              display={bpmText(mix.targetBpm)}
              onChange={(next) => mix.setTempo(Number(next.toFixed(2)))}
              editable
              showFill={false}
              width={44}
              label="Tempo"
              title={
                mix.beats
                  ? 'The tempo the stems play at with warp on. The grid is where the beats are'
                  : 'The tempo the grid is ruled at, until the kick has been followed. Drag it, or type one in'
              }
            />
            {/* Bars are the grid's claim; the clock is what is true whatever
                tempo anybody decides on. Both, because a slice is placed in one
                and heard in the other. */}
            <span className="mf-clock">{position(mix.bar, mix.bars)}</span>
            <span className="mf-clock mf-clock-time">{clockOf(mix.position)}</span>
          </div>

          {/* Where a cut lands. Its own group and nothing else in it: it is not
              playback and it is not the beat map, it is the one setting that
              says what the pointer is allowed to do to the timeline. */}
          <div className="mf-group" role="group" aria-label="Snap">
            <span className="mf-group-label">snap</span>
            <Segmented
              items={SNAPS.map((s) => s.mark)}
              index={SNAPS.findIndex((s) => s.id === mix.snap)}
              onChange={(next) => mix.setSnap(SNAPS[next].id)}
              label="Snap"
              title={SNAPS.find((s) => s.id === mix.snap)?.says ?? ''}
              className="mf-snap"
            />
          </div>

          <div className="mf-group" role="group" aria-label="Analysis">
            <Button onPress={mix.resetup} title="Check the beat grid, find sections, or change stems">Analyze</Button>
            {/* The numbers that say whether to believe the grid, next to the
                button that made it: the tempo the song runs at — a range
                where it moved — and how much of the kick sits on a line. A
                fit that found nothing says so rather than leaving a press
                with no answer. */}
            {mix.beats || mix.detected ? (
              <span
                className="mf-fit"
                title={
                  mix.beats && mix.detected
                    ? 'The tempo the beats run at, read off their spacing, and how much of the kit lands on a grid line'
                    : mix.beats
                      ? 'The tempo the beats run at, read off their spacing'
                      : 'How much of the kit lands on a grid line'
                }
              >
                {mix.beats ? rangeText(mix.grid) : ''}
                {mix.beats && mix.detected ? ' · ' : ''}
                {mix.detected ? `${Math.round(mix.detected.agreement * 100)}%` : ''}
              </span>
            ) : mix.fitFailed ? (
              <span className="mf-fit mf-fit-none" title="Nothing steady enough to fit a tempo to">
                no fit
              </span>
            ) : null}
            {/* Live's warp switch: on, every bar of the record plays in the
                time the tempo gives a bar. It needs the beat map to know where
                the record's bars are, and a stretcher to play them through,
                and it says which of those it is waiting on. It sits with the
                beat map rather than with playback because without one it can
                do nothing at all. */}
            <Toggle
              on={mix.warp}
              onChange={mix.setWarp}
              label="Warp"
              title={
                !mix.beats
                  ? 'Warp: play the stems stretched to the tempo. Follow the beat first'
                  : mix.stretching === 'failed'
                    ? 'Warp: the stretcher could not be loaded, so the stems play as they were recorded'
                    : mix.stretching === 'loading'
                      ? 'Warp: loading the stretcher'
                      : 'Warp: play every bar of the record in the time the tempo gives it'
              }
              disabled={!mix.beats || mix.stretching === 'failed'}
              width={38}
            >
              warp
            </Toggle>
          </div>
        </>
      )}

      {!live && song && <Button onPress={mix.resetup} disabled title="You are in track analysis">Analysis</Button>}

      <Button
        onPress={() => mix.setExporting(true)}
        disabled={!live}
        title={live ? 'Choose what to write out: the stems, and the full track with them' : song?.sources.length ? 'Return to the mix to export' : 'Separate the track first'}
      >
        Export
      </Button>
      {harness && song && (
        <Modal title="debug & experiments" label="Debug workspace" className="mf-harness" onClose={() => setHarness(false)}>
          <DebugWorkspace mix={mix} />
        </Modal>
      )}
    </header>
  );
}
