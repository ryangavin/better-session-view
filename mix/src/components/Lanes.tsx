import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Slider } from '@openflow/widgets/controls/Slider.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { STEMS } from '../mock.ts';
import type { Mix } from '../state.ts';
import { factorOf, limitOf, shows, spanOf, useView } from '../zoom.ts';
import { Waveform } from './Waveform.tsx';
import { WarpLane } from './WarpLane.tsx';
import './Lanes.css';

/**
 * The separated track: the mix as a whole, where the grid sits, and one lane
 * per source.
 *
 * The head of every row is the same width, so the waveforms share one
 * horizontal scale and a transient in the drums lines up with the one in the
 * bass. That is the only reason it is a fixed width rather than a fraction, and
 * it is why the band above the lanes carries a head of its own that draws
 * nothing but the mix summary.
 *
 * **There is a lane for every stem the model made and for nothing else.** A
 * four-source model folds guitar and piano back into Other, and two dead rows
 * saying so were two rows of a screen spent on a control nobody can use — the
 * fact belongs to the *model*, which is named on this band and described where
 * it is chosen. The library's badge strip is where a missing stem is still
 * worth drawing, because there the question is which tracks have one.
 *
 * **Zoom is `zoom.ts`** — the lanes draw a slice of the track rather than all
 * of it, and everything on the timeline maps through the same two numbers.
 */

/**
 * A stem's level, as a parameter rather than a number, so the fader is a fader —
 * the drag, the fine modifier and double-click-to-unity all come with it.
 *
 * Deliberately unnamed: `Slider` captions itself from `shortName`, and the row
 * has no room for a caption that would say the same thing as the stem's name
 * two controls to the left.
 */
const LEVEL: Param = { kind: 'float', min: 0, max: 1, defaultValue: 0.8, unit: 'percent' };

/**
 * The fader's drawn length.
 *
 * A number rather than `layout="inside"`, and the difference is not cosmetic:
 * an inside row deliberately has no fill, because a parameter on a node row is
 * a *where* and a fill invents a left-hand side that means nothing. A fader is
 * the case that doc carves out — its own length is what it is saying.
 */
const FADER = 46;

/** Unity is 0.8, so a fader reads as trim either side of where it rests. */
const trim = (volume: number): string => {
  const db = Math.round((volume - 0.8) * 30);
  return db === 0 ? '0' : `${db > 0 ? '+' : ''}${db}`;
};

/**
 * A wheel's movement in pixels, whatever unit the mouse reported it in.
 *
 * A trackpad sends pixels and most wheels send lines — three of them per
 * detent, which through the zoom curve is a factor of 1.007 and reads as a
 * control that does not work.
 */
const pixels = (event: WheelEvent): number => {
  const raw = event.deltaY || event.deltaX;
  if (event.deltaMode === 1) return raw * 16;
  if (event.deltaMode === 2) return raw * 400;
  return raw;
};

/**
 * How much of the song is on screen, as a length of time.
 *
 * A number of times is the wrong readout for a zoom that reaches fifty
 * thousand of them: `41000×` is arithmetic, and *4 ms* is the answer to what
 * you were actually asking, which is how much of the song you are looking at.
 */
const seen = (seconds: number): string => {
  if (!(seconds > 0)) return '—';
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  if (seconds >= 10) return `${Math.round(seconds)}s`;
  if (seconds >= 1) return `${seconds.toFixed(1)}s`;
  if (seconds >= 0.01) return `${Math.round(seconds * 1000)}ms`;
  return `${(seconds * 1000).toFixed(1)}ms`;
};

/**
 * How far off screen a slice is allowed to be drawn.
 *
 * Zoomed in far enough, a slice sixty bars wide is a box tens of millions of
 * pixels across — past what a browser will lay out, and pointless besides,
 * since all but a window's worth of it is behind the clip. Anything outside
 * the view is dropped and what is left is trimmed to a screen either side.
 */
const OFF = 0.5;

const again = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" />
  </svg>
);

export function Lanes({ mix }: { mix: Mix }) {
  const song = mix.song;
  const sources = song?.sources ?? [];
  const bars = mix.bars;

  /**
   * How far this song goes, which depends on the song: the bottom of the zoom
   * is a couple of hundred samples on screen, so a longer track has further to
   * travel to get there — `zoom.ts`.
   */
  const limit = limitOf(mix.seconds, mix.rate);
  const { view, zoomAbout, panBy, follow, whole } = useView(song?.id ?? null, limit);
  const span = useMemo(() => spanOf(view), [view]);

  /** The whole thing, because the gesture works over the heads as well. */
  const root = useRef<HTMLDivElement | null>(null);
  /**
   * The timeline, for geometry only.
   *
   * Where the pointer is over the *track* is what a zoom is anchored on, and
   * that is a different left edge from the element the gesture arrives on. The
   * band's track is the one element whose box is exactly the timeline.
   */
  const timeline = useRef<HTMLDivElement | null>(null);

  /**
   * Shift- or ⌘-scroll zooms, and a sideways scroll pans.
   *
   * A native listener rather than `onWheel`, and that is the whole reason this
   * is an effect: React registers wheel handlers passively, so `preventDefault`
   * from one is ignored — and without it ⌘-scroll is the browser's own page
   * zoom and the lanes get a picture of the window growing instead.
   *
   * Both modifiers, because neither is obviously the one: ⌘ is what a Mac
   * timeline uses and ⇧ is what a wheel-and-mouse rig can reach. `ctrl` comes
   * with them for free and is worth having twice over — it is the modifier on
   * Windows and Linux, and it is also what a trackpad pinch arrives as.
   *
   * A plain vertical wheel is left alone. The lane list scrolls, and a window
   * that hijacks the scroll wheel to do something else is a window you cannot
   * scroll.
   */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      const box = timeline.current?.getBoundingClientRect();
      if (!box || box.width < 1) return;
      const place = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        event.preventDefault();
        zoomAbout(factorOf(pixels(event)), place);
        return;
      }
      // Sideways, from a trackpad or a tilt wheel. One window's width of
      // movement is one window's worth of track, at any zoom.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        panBy(event.deltaX / box.width);
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [song?.id, zoomAbout, panBy]);

  /**
   * Zoomed in, the playhead leaves the window in a few seconds. The view pages
   * after it — `zoom.ts` says why it pages rather than scrolls — and only while
   * something is playing, so a view somebody has just set by hand is not
   * dragged away from them by a stopped head sitting outside it.
   */
  const at = mix.seconds > 0 ? mix.position / mix.seconds : 0;
  useEffect(() => {
    if (mix.playing) follow(at);
  }, [mix.playing, at, follow]);

  if (!song) return null;

  const lanes = STEMS.filter((stem) => sources.includes(stem.id));
  const head = shows(view, at);
  /**
   * Where the song starts and ends on screen, which is only interesting when
   * they are not the edges of it.
   *
   * Zoomed out past the track filling the lane, there is time on screen that is
   * not in the song. The grid keeps ruling it and the warp lane keeps numbering
   * it — downwards through bar 1 — and this is what says it is outside: a wash
   * over it, with the song's first and last bar as its border.
   */
  const opens = shows(view, 0);
  const closes = shows(view, 1);

  return (
    <div className="mf-lanes" ref={root}>
      {mix.manual && <ManualBar mix={mix} />}

      <div className="mf-band">
        <div className="mf-head mf-band-head">
          <div className="mf-band-top">
            <span className="mf-cap">mix</span>
            <div className="mf-band-actions">
              <Button
                onPress={whole}
                disabled={view.zoom === 1}
                label="Show the whole track"
                title="How much time the lanes are showing — press to fit the song. ⇧-scroll or ⌘-scroll over the lanes to zoom, in as far as single samples and out past the whole song"
                className="mf-zoom"
                width={40}
              >
                {seen(mix.seconds / view.zoom)}
              </Button>
              <Button
                onPress={mix.resetMix}
                disabled={mix.touched === 0}
                title="Return every stem to unity, unmuted, unsoloed"
              >
                Reset
              </Button>
              <Button
                onPress={() => void mix.separate()}
                label="Separate again"
                title="Separate this song again, with a different model"
                width={26}
              >
                {again}
              </Button>
            </div>
          </div>
          <div className="mf-band-bottom">
            <span className="mf-band-audible">{mix.audibleLine}</span>
            <span className="mf-band-model">{mix.labelOf(song.model)}</span>
          </div>
        </div>

        <div className="mf-band-track" ref={timeline}>
          <Outside opens={opens} closes={closes} />
          <div className="mf-ruler">
            {mix.slices.map((slice, i) => {
              const next = mix.slices[i + 1]?.bar ?? bars;
              const starts = shows(view, slice.bar / bars);
              const ends = shows(view, next / bars);
              if (ends < -OFF || starts > 1 + OFF) return null;
              const left = Math.max(starts, -OFF);
              return (
                <button
                  key={i}
                  type="button"
                  className="mf-slice"
                  data-on={i === mix.activeSlice || undefined}
                  style={{
                    left: `${left * 100}%`,
                    width: `${(Math.min(ends, 1 + OFF) - left) * 100}%`,
                  }}
                  onClick={() => mix.setActiveSlice(i)}
                  title={`${slice.name} — bar ${slice.bar + 1}, ${next - slice.bar} bars`}
                >
                  <span className="mf-slice-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="mf-slice-name">{slice.name}</span>
                </button>
              );
            })}
          </div>
          <WarpLane
            onsets={mix.onsets}
            bars={bars}
            height={24}
            anchors={mix.anchors}
            onPin={mix.pin}
            pinning={mix.manual !== null}
            span={span}
          />
        </div>
      </div>

      <div className="mf-lane-list">
        {lanes.map((stem) => {
          const own = mix.level[stem.id];
          const heard = mix.audible(stem.id);
          return (
            <div key={stem.id} className="mf-lane" style={{ '--stem': stem.ink } as never}>
              <div className="mf-head mf-lane-head">
                <span className="mf-dot" />
                <span className="mf-lane-label">{stem.name}</span>
                <Toggle
                  on={own.muted}
                  onChange={(next) => mix.adjust(stem.id, { muted: next })}
                  label={`Mute ${stem.name}`}
                  title="Mute"
                  width={18}
                >
                  M
                </Toggle>
                <Toggle
                  on={own.soloed}
                  onChange={(next) => mix.adjust(stem.id, { soloed: next })}
                  label={`Solo ${stem.name}`}
                  title="Solo"
                  width={18}
                  className="mf-solo"
                >
                  S
                </Toggle>
                <Slider
                  param={LEVEL}
                  value={own.volume}
                  onChange={(next) => mix.adjust(stem.id, { volume: next })}
                  orientation="horizontal"
                  length={FADER}
                  showValue={false}
                  label={`${stem.name} level`}
                  className="mf-fader"
                />
                <span className="mf-lane-db">{trim(own.volume)}</span>
              </div>
              <div className="mf-lane-draw">
                {mix.peaks[stem.id] ? (
                  <Waveform
                    peaks={mix.peaks[stem.id]}
                    buffer={mix.audioOf(stem.id)}
                    ink={`var(--stem-${stem.id})`}
                    quiet={!heard}
                    height={46}
                    bars={bars}
                    span={span}
                    onSeek={(fraction) => mix.seek(fraction * mix.seconds)}
                  />
                ) : (
                  // An empty lane and a lane of zeroes look the same and only
                  // one of them is honest.
                  <span className="mf-lane-none">
                    {mix.audioProblem ?? (mix.decoding ? 'reading the stem' : 'no audio loaded')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <Outside opens={opens} closes={closes} inset />
        {head >= 0 && head <= 1 && (
          <div
            className="mf-playhead"
            style={{ left: `calc(var(--lane-head) + (100% - var(--lane-head)) * ${head})` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The wash over the time that is not in the song.
 *
 * Two elements rather than something drawn into each canvas: it is one fact
 * about the view, the lanes and the band are separate scrolling boxes, and a
 * wash is a rectangle either way. Nothing is drawn at all while the track
 * fills the lane, which is every view but the ones zoomed out past fit.
 *
 * `inset` is for the lane list, where the drawing starts after the head column
 * — the same arithmetic the playhead does, and the reason both live in the box
 * that holds the lanes rather than inside a lane.
 */
function Outside({ opens, closes, inset }: { opens: number; closes: number; inset?: boolean }) {
  const across = (place: number): string =>
    inset ? `calc(var(--lane-head) + (100% - var(--lane-head)) * ${place})` : `${place * 100}%`;
  const wide = (span: number): string =>
    inset ? `calc((100% - var(--lane-head)) * ${span})` : `${span * 100}%`;

  return (
    <>
      {opens > 0 && (
        <span
          className="mf-outside"
          data-side="before"
          style={{ left: across(0), width: wide(opens) }}
        />
      )}
      {closes < 1 && (
        <span
          className="mf-outside"
          data-side="after"
          style={{ left: across(closes), width: wide(1 - closes) }}
        />
      )}
    </>
  );
}

/**
 * The bar that appears while the grid is being set by hand.
 *
 * It exists because in this mode a click in a lane means something else, and a
 * mode you cannot see is a mode that surprises you. Amber and pulsing at the
 * top of the thing whose behaviour changed, with the way out on the same line.
 */
function ManualBar({ mix }: { mix: Mix }) {
  const manual = mix.manual;
  if (!manual) return null;
  const step = manual.stage === 'first' ? 'step 1 / 2' : manual.stage === 'late' ? 'step 2 / 2' : 'tune';
  const hint =
    manual.stage === 'first'
      ? 'Click the downbeat that starts bar 1'
      : manual.stage === 'late'
        ? 'Click a strong beat near the end'
        : 'Nudge the reference, or click again where the song pushes';

  return (
    <div className="mf-manual">
      <span className="mf-manual-step">{step}</span>
      <span className="mf-manual-hint">{hint}</span>
      <div className="mf-manual-nudge">
        <Button onPress={() => mix.nudge(-1)} label="Earlier" title="Pull the reference 10 ms earlier" width={22}>
          ◀
        </Button>
        <Button onPress={() => mix.nudge(1)} label="Later" title="Push the reference 10 ms later" width={22}>
          ▶
        </Button>
      </div>
      <Button onPress={mix.endManual} className="mf-primary">
        Done
      </Button>
    </div>
  );
}
