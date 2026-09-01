import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import { BARS } from '../mock.ts';
import type { Ready } from '../openflow.ts';
import type { Mix } from '../state.ts';
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
 * looking at which library row is highlighted.
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
          demucs
        </span>
      )}

      <div className="mf-mark">
        mix<span>[flow]</span>
      </div>

      <div className="mf-open">
        <span className="mf-open-title">{mix.song.title}</span>
        <span className="mf-open-artist">{mix.song.artist}</span>
      </div>

      {live && (
        <>
          <div className="mf-group" role="group" aria-label="Transport">
            <Button
              onPress={() => mix.setPlaying(!mix.playing)}
              label={mix.playing ? 'Pause' : 'Play'}
              title={mix.playing ? 'Pause (Space)' : 'Play (Space)'}
              width={26}
              className={mix.playing ? 'mf-playing' : undefined}
            >
              {mix.playing ? pause : play}
            </Button>
            <Button onPress={mix.stop} label="Stop" title="Stop and return to the top" width={26}>
              {stopMark}
            </Button>
            <Toggle on={mix.loop} onChange={mix.setLoop} label="Loop" title="Loop the preview" width={26}>
              {loopMark}
            </Toggle>
            <span className="mf-clock">{position(mix.bar)}</span>
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
