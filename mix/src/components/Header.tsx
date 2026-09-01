import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import { BARS } from '../mock.ts';
import type { Ready } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './Header.css';

/**
 * One bar, four groups, in the order a person reads them: what this is, what
 * you are looking at, what you can do to it, and where it goes.
 *
 *   [!] mix[flow] │ Title · Artist  ⋯⋯  [▶ ■ ↻] 1.1.1 │ snap ⋯ Auto-warp │ Export
 *
 * Three things about that are deliberate departures from the mockup, and each
 * one is a thing the mockup was fighting:
 *
 * **The clock sits with the transport, not with the wordmark.** Between the
 * logo and the buttons it read as part of the brand, and the one control it
 * describes was two groups away.
 *
 * **Playback and the grid are separated by a rule, and both are hidden unless
 * a track has stems.** Every control was the same 22px outlined pill, so
 * nothing on screen said that play and snap belong to different subsystems —
 * and in the two states where there is nothing to play they were all still
 * there, dead. What is left in an idle header is the wordmark, the title and a
 * disabled Export, which is the honest amount.
 *
 * **Nothing wraps.** The mockup's header is `flex-wrap` over a `min-height`,
 * so a narrow window silently becomes two rows of chrome. Here the title is
 * the only thing that gives, and it gives by ellipsis.
 *
 * The track name is here because the right rail that used to carry it is gone,
 * and a window that never says what is open is a window you can only orient in
 * by looking at which library row is highlighted.
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

const SNAP = ['1/1', '1/2', '1/4'];

/** bar.beat.sixteenth, one-based, from a position measured in bars. */
function position(bar: number): string {
  const whole = Math.floor(bar);
  const beat = Math.floor((bar - whole) * 4);
  const sixteenth = Math.floor(((bar - whole) * 4 - beat) * 4);
  return `${Math.min(whole, BARS - 1) + 1}.${beat + 1}.${sixteenth + 1}`;
}

export function Header({ mix, ready }: { mix: Mix; ready: Ready | null }) {
  const live = mix.phase === 'ready';

  return (
    <header className="mf-header">
      {/* Silent when the toolchain is fine. A green light that is always on is
          a thing you stop seeing; a red one that appears is not. */}
      {ready && !ready.ok && (
        <span className="mf-broken" title={`${ready.says} — see mix/docs/demucs.md`}>
          <i />
          no demucs
        </span>
      )}

      <div className="mf-mark">
        mix<span>[flow]</span>
      </div>

      <span className="mf-rule" />

      <div className="mf-open">
        <span className="mf-open-title">{mix.song.title}</span>
        <span className="mf-open-artist">{mix.song.artist}</span>
      </div>

      {live && (
        <>
          <div className="mf-transport">
            <Button
              onPress={() => mix.setPlaying(!mix.playing)}
              label={mix.playing ? 'Pause' : 'Play'}
              title={mix.playing ? 'Pause (Space)' : 'Play (Space)'}
              tone="quiet"
              width={26}
              className={mix.playing ? 'mf-playing' : undefined}
            >
              {mix.playing ? pause : play}
            </Button>
            <Button onPress={mix.stop} label="Stop" title="Stop and return to the top" tone="quiet" width={26}>
              {stopMark}
            </Button>
            <Toggle on={mix.loop} onChange={mix.setLoop} label="Loop" title="Loop the preview" width={26}>
              {loopMark}
            </Toggle>
          </div>

          <span className="mf-clock">{position(mix.bar)}</span>

          <span className="mf-rule" />

          {/* The label leads rather than caps. `Widget` puts a caption above
              the control, which in a 34px bar makes this the one thing two
              rows tall in a line of things one row tall — and a ragged
              baseline is most of what "messy header" means. */}
          <span className="mf-cap">snap</span>
          <Segmented
            items={SNAP}
            index={SNAP.indexOf(mix.snap)}
            onChange={(next) => mix.setSnap(SNAP[next])}
            label="Snap"
            title="Where a slice point lands when you drag it"
          />

          <div className="mf-warp">
            <Button
              onPress={mix.autoWarp}
              title="Re-run detection and drop anchors on the two strongest downbeats"
            >
              Auto-warp
            </Button>
            <Toggle
              on={mix.manual !== null}
              onChange={(on) => (on ? mix.startManual() : mix.endManual())}
              label="Set the grid by hand"
              title="Set the grid by hand: click the downbeat of bar 1, then a beat late in the song"
              width={26}
            >
              {crosshair}
            </Toggle>
          </div>
        </>
      )}

      <span className="mf-rule" />

      <Button
        onPress={() => mix.setExporting(true)}
        disabled={!live}
        title={live ? 'Build an Ableton clip pack from the current slices' : 'Separate the track first'}
      >
        Export
      </Button>
    </header>
  );
}
