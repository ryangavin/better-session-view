import { useState } from 'react';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import type { Ready } from '../openflow.ts';
import { QuietField } from './Editable.tsx';
import type { Mix } from '../state.ts';
import { FASTEST, SLOWEST } from '../tempo.ts';
import { bpmText, rangeText } from '../warp.ts';
import './Header.css';

/**
 * One bar, and the whole problem with it was that eleven things sat on it as
 * eleven things.
 *
 *   [demucs] mix[flow] │ Title · Artist ⋯⋯ [▶ ■ ↻ 1.1.1] [snap ⅟₁ ⅟₂ ⅟₄ warp ⊹] [Export]
 *
 * **Controls that belong together are one bordered object, not several beside
 * each other.** The group owns the border and the dividers; its children own
 * only their content — which is the same `.control-group` idea set[flow] has
 * carried since its own header got crowded. Three clusters read as three
 * things. The same controls loose read as nine, which is what a smattering is.
 *
 * **Everything on the bar is exactly 22px.** `DESIGN.md` has said so all along
 * — "header controls share a 22px height" — and this header was not doing it:
 * `Widget` defaults to a 16px field, so the controls floated at different
 * optical weights in a 34px bar with no shared edge. One override at the top
 * of the file fixes every control on it, and that single line is most of what
 * "no real alignment" was.
 *
 * **The clock is inside the transport cluster**, because it is the transport's
 * reading. Loose between the wordmark and the buttons it read as part of the
 * brand.
 *
 * **Playback and the grid vanish unless the track has stems.** Neither can do
 * anything in the other two states, and a bar full of dead controls is the
 * other half of the clutter. An idle header is the wordmark, the title and a
 * disabled Export, which is the honest amount.
 *
 * **Nothing wraps.** The mockup is `flex-wrap` over a `min-height`, so a narrow
 * window silently becomes two rows of chrome. The title is the only thing that
 * gives, and it gives by ellipsis.
 *
 * The track name is here because the right rail that used to carry it is gone,
 * and a window that never says what is open is one you can only orient in by
 * looking at which library row is highlighted. **It is also where the name gets
 * fixed.** `Details.tsx` is the form, and it is on the setup screen — which is
 * behind you the moment a track has stems, so a name you only notice is wrong
 * once you are listening to it meant going back through the library to correct
 * it. The two words are already on the bar; typing over them is the shortest
 * path there is, and `QuietField` keeps them looking like the label they also
 * are until you reach for one.
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

const crosshair = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);

/** A bug: the beat-finding harness, which is a debugging page and says so. */
const bugMark = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="8" y="8" width="8" height="11" rx="4" />
    <path d="M10 8V6.5a2 2 0 0 1 4 0V8M4 13h4M16 13h4M5 19l3-2M19 19l-3-2M5 8l3 2M19 8l-3 2" />
  </svg>
);

const clearMark = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const SNAP = ['1/1', '1/2', '1/4'];

/**
 * The tempo, beside the button that measures it.
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
            {import.meta.env.DEV && (
              // Served by the dev server beside the app, so a dev build only.
              <button
                type="button"
                className="mf-debug"
                onClick={() => setHarness(true)}
                title="Open this track in the beat-finding harness — see mix/docs/harness.md"
                aria-label="Open in the beat-finding harness"
              >
                {bugMark}
              </button>
            )}
          </>
        ) : (
          <span className="mf-open-none">nothing open</span>
        )}
      </div>

      {live && (
        <>
          <div className="mf-group" role="group" aria-label="Transport">
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
            <Toggle on={mix.loop} onChange={mix.setLoop} label="Loop" title="Loop the whole track" width={26}>
              {loopMark}
            </Toggle>
            {/* Bars are the grid's claim; the clock is what is true whatever
                tempo anybody decides on. Both, because a slice is placed in one
                and heard in the other. */}
            <span className="mf-clock">{position(mix.bar, mix.bars)}</span>
            <span className="mf-clock mf-clock-time">{clockOf(mix.position)}</span>
          </div>

          <div className="mf-group" role="group" aria-label="Grid">
            <span className="mf-group-label">snap</span>
            <Segmented
              items={SNAP}
              index={SNAP.indexOf(mix.snap)}
              onChange={(next) => mix.setSnap(SNAP[next])}
              label="Snap"
              title="Where a slice point lands when you drag it"
            />
            <span className="mf-group-label">tempo</span>
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
            {/* Live's warp switch: on, every bar of the record plays in the
                time this tempo gives a bar. It needs the beat map to know where
                the record's bars are, and a stretcher to play them through,
                and it says which of those it is waiting on. */}
            <Toggle
              on={mix.warp}
              onChange={mix.setWarp}
              label="Warp"
              title={
                !mix.beats
                  ? 'Warp: play the stems stretched to this tempo. Follow the beat first'
                  : mix.stretching === 'failed'
                    ? 'Warp: the stretcher could not be loaded, so the stems play as they were recorded'
                    : mix.stretching === 'loading'
                      ? 'Warp: loading the stretcher'
                      : 'Warp: play every bar of the record in the time this tempo gives it'
              }
              disabled={!mix.beats || mix.stretching === 'failed'}
              width={38}
            >
              warp
            </Toggle>
            <Button
              onPress={mix.autoWarp}
              title={
                mix.detected && 'beats' in mix.detected
                  ? `Followed the beat through ${mix.detected.beats.samples.length} beats at ${rangeText(
                      mix.grid,
                    )} BPM — ${Math.round(mix.detected.tracked * 100)}% of them on a hit, ${Math.round(
                      mix.detected.agreement * 100,
                    )}% of the kit on the grid. Press to follow it again`
                  : mix.detected
                    ? `Fitted ${bpmText(mix.detected.bpm)} BPM to the kick — ${Math.round(
                        mix.detected.agreement * 100,
                      )}% of the kicks land on the grid. Press to fit it again`
                    : 'Find the tempo and the downbeat, and follow the beat through the song'
              }
              disabled={mix.decoding}
            >
              Auto-warp
            </Button>
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
            {/* The way back: every pin gone, and a straight grid at this
                tempo and downbeat to start over from. Beside the button that
                makes the pins, because it undoes exactly that. */}
            <Button
              onPress={mix.clearBeats}
              label="Clear the beat map"
              title={
                mix.beats
                  ? 'Clear the beat map: back to an even grid at this tempo, to start over'
                  : 'No beat map to clear'
              }
              width={26}
              disabled={!mix.beats}
            >
              {clearMark}
            </Button>
            <Toggle
              on={mix.manual !== null}
              onChange={(on) => (on ? mix.startManual() : mix.endManual())}
              label="Set the grid by hand"
              title="Set the grid by hand: click the downbeat of bar 1, then a downbeat late in the song"
              width={26}
            >
              {crosshair}
            </Toggle>
          </div>
        </>
      )}

      <Button
        onPress={() => mix.setExporting(true)}
        disabled={!live}
        title={live ? 'Choose what to write out: the stems, and the full track with them' : 'Separate the track first'}
      >
        Export
      </Button>
      {harness && song && (
        <Modal title="harness" label="Beat-finding harness" className="mf-harness" onClose={() => setHarness(false)}>
          <iframe
            className="mf-harness-frame"
            src={`/harness/?track=${encodeURIComponent(song.id)}`}
            title="Beat-finding harness"
          />
        </Modal>
      )}
    </header>
  );
}
