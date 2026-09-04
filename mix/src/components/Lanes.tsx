import { Fragment, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Slider } from '@openflow/widgets/controls/Slider.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import type { Peak } from '../audio.ts';
import { rulingOf, stepFor } from '../grid.ts';
import { STEMS } from '../mock.ts';
import { snappedBar } from '../slices.ts';
import { SPANS, type Mix } from '../state.ts';
import { BASS_TRANSPOSE } from '../tab.ts';
import { barAt, placeOf } from '../warp.ts';
import { factorOf, limitOf, shows, spanOf, useView, type Span } from '../zoom.ts';
import { Tablature } from './Tablature.tsx';
import { Tone } from './Tone.tsx';
import { Waveform } from './Waveform.tsx';
import { Ruler } from './Ruler.tsx';
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
const OCTAVES = ['−8va', '0', '+8va'] as const;

/**
 * The fader stands up and fills its lane, in both directions.
 *
 * A number rather than `layout="inside"`, and the difference is not cosmetic:
 * an inside row deliberately has no fill, because a parameter on a node row is
 * a *where* and a fill invents a left-hand side that means nothing. A fader is
 * the case that doc carves out — its own length is what it is saying.
 *
 * Standing it up is what buys the head its width. A lane is a few dozen pixels
 * tall and only ever a couple of hundred wide, so height is the dimension
 * there is spare of: a horizontal fader spent 46px of the scarce one to buy
 * 46px of travel. This one is given the whole of the leftover height and the
 * whole of the column's width, so it is the thing in the head you cannot miss
 * and the thing you cannot fail to hit.
 *
 * Its length is therefore CSS's to decide, and what has to come back the other
 * way is how long it turned out — `Slider` gears its drag to `travel`, and a
 * rail drawn taller than the travel it was geared to is a thumb running ahead
 * of the pointer.
 */
const TRAVEL_MIN = 16;

/**
 * How long the drawn rail is, measured from the laid-out lane.
 *
 * The lanes divide whatever height the window leaves them, so this is not
 * known until they have been laid out — and every lane is the same height, so
 * one of them answers for all six. `ResizeObserver` reports the size when it
 * starts watching as well as when it changes, so there is nothing to measure
 * separately on the way in.
 */
function useTravel(list: RefObject<HTMLDivElement | null>, lanes: number, song: string | null): number {
  const [travel, setTravel] = useState(TRAVEL_MIN);

  useEffect(() => {
    const rail = list.current?.querySelector('.mf-lane-head .wdg-slider-body');
    if (!(rail instanceof HTMLElement)) return;
    const watch = new ResizeObserver(() => {
      const height = rail.clientHeight;
      if (height > 0) setTravel(Math.max(TRAVEL_MIN, Math.round(height)));
    });
    watch.observe(rail);
    return () => watch.disconnect();
  }, [list, lanes, song]);

  return travel;
}

/** A lane with nothing decoded yet: the grid, and no drawing over it. */
const NOTHING: readonly Peak[] = [];

/** Unity is 0.8, so a fader reads as trim either side of where it rests. */
const trim = (volume: number): string => {
  const db = Math.round((volume - 0.8) * 30);
  return db === 0 ? '0' : `${db > 0 ? '+' : ''}${db}`;
};

/**
 * What one unit of a wheel's movement is worth in pixels.
 *
 * A trackpad sends pixels and most wheels send lines — three of them per
 * detent, which through the zoom curve is a factor of 1.007 and reads as a
 * control that does not work.
 */
const unit = (event: WheelEvent): number =>
  event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;

/** A wheel's movement in pixels, whichever axis it came down. */
const pixels = (event: WheelEvent): number => (event.deltaY || event.deltaX) * unit(event);

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

const again = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" />
  </svg>
);

export function Lanes({ mix }: { mix: Mix }) {
  const song = mix.song;
  const sources = song?.sources ?? [];
  const grid = mix.grid;

  /**
   * How far this song goes, which depends on the song: the bottom of the zoom
   * is a couple of hundred samples on screen, so a longer track has further to
   * travel to get there — `zoom.ts`.
   */
  const limit = limitOf(mix.seconds, mix.rate);
  const { view, zoomAbout, panBy, follow, whole } = useView(song?.id ?? null, limit);
  const span = useMemo(() => spanOf(view), [view]);
  /**
   * The tablature belongs to the selected song and starts folded away.
   *
   * Remembering the id instead of a bare boolean means changing tracks closes
   * it without an effect and without briefly showing the last song's lane.
   */
  const [tabFor, setTabFor] = useState<string | null>(null);
  const tabOpen = tabFor === song?.id;

  /** The whole thing, because the gesture works over the heads as well. */
  const root = useRef<HTMLDivElement | null>(null);
  /** The lane list, used to measure the mixer fader travel. */
  const list = useRef<HTMLDivElement | null>(null);
  /**
   * The timeline, for geometry only.
   *
   * Where the pointer is over the *track* is what a zoom is anchored on, and
   * that is a different left edge from the element the gesture arrives on. The
   * band's track is the one element whose box is exactly the timeline.
   */
  const timeline = useRef<HTMLDivElement | null>(null);

  /**
   * A place on the track, held to whatever the snap is set to.
   *
   * The same holding the ruler does to a cut, applied to the head — because
   * the head is what a loop is built out of now, and a loop that begins a
   * pixel off the downbeat is a loop that stumbles every time round. The
   * ruling is measured against the view for the same reason it is there: on
   * `grid` the rung is whatever is drawn under the pointer, so what you can
   * land on is what you can see.
   */
  const held = (place: number): number => {
    const box = timeline.current?.getBoundingClientRect();
    if (!box || box.width < 1) return place;
    const from = barAt(grid, view.from);
    const to = barAt(grid, view.from + 1 / view.zoom);
    const step = stepFor(mix.snap, rulingOf(from, to, box.width).step);
    return placeOf(grid, snappedBar(barAt(grid, place), step));
  };

  /**
   * A click is where to listen from; a shift-click is the far end of a loop.
   *
   * Two gestures on one press, which is the pair every timeline has: the
   * first says *here*, the second says *to here*, and between them they are
   * how a region gets picked without a mode to be in.
   */
  const scrub = (place: number, extend: boolean): void => {
    const at = held(place) * mix.seconds;
    if (extend) mix.loopTo(at);
    else mix.scrubTo(at);
  };

  /**
   * Wheel zooms; Shift-wheel pans. Native listeners can prevent page zoom and
   * middle-button autoscroll. Capture keeps navigation out of lane controls.
   */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const placeAt = (x: number, box: DOMRect) => Math.max(0, Math.min(1, (x - box.left) / box.width));
    const wheel = (event: WheelEvent) => {
      const box = timeline.current?.getBoundingClientRect();
      if (!box || box.width < 1) return;
      event.preventDefault();
      if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
        panBy(delta * unit(event) / box.width);
      } else {
        zoomAbout(factorOf(pixels(event)), placeAt(event.clientX, box));
      }
    };
    let drag: { id: number; x: number; y: number } | null = null;
    const end = () => {
      const active = drag;
      drag = null;
      if (active && el.hasPointerCapture(active.id)) el.releasePointerCapture(active.id);
      el.style.removeProperty('cursor');
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 1 || drag) return;
      const box = timeline.current?.getBoundingClientRect();
      if (!box || box.width < 1) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      el.setPointerCapture(event.pointerId);
      el.style.cursor = 'grabbing';
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!(event.buttons & 4)) { end(); return; }
      event.preventDefault();
      event.stopPropagation();
      const box = timeline.current?.getBoundingClientRect();
      if (!box || box.width < 1) return;
      zoomAbout(factorOf(event.clientY - drag.y), placeAt(drag.x, box));
      panBy((drag.x - event.clientX) / box.width);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const up = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) end();
    };
    const aux = (event: MouseEvent) => {
      if (event.button === 1) { event.preventDefault(); event.stopPropagation(); }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', up, true);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('auxclick', aux, true);
    window.addEventListener('blur', end);
    return () => {
      end();
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('pointercancel', up, true);
      el.removeEventListener('lostpointercapture', up);
      el.removeEventListener('auxclick', aux, true);
      window.removeEventListener('blur', end);
    };
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

  const travel = useTravel(list, sources.length, song?.id ?? null);

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
            <Button
              onPress={whole}
              disabled={view.zoom === 1}
              label="Show the whole track"
              title="How much time the lanes are showing — press to fit the song. Scroll to zoom; ⇧-scroll to pan. Hold the middle button and drag up/down to zoom, left/right to pan"
              className="mf-zoom mf-band-wide"
            >
              {seen(mix.seconds / view.zoom)}
            </Button>
            <Button
              onPress={mix.resetup}
              label="Separate again"
              title="Set this song up again — the models, and what it is called"
              width={22}
              disabled={mix.engineBusy}
            >
              {again}
            </Button>
          </div>
          <div className="mf-band-bottom">
            <Button
              onPress={mix.resetMix}
              disabled={mix.touched === 0}
              title="Return every stem to unity, unmuted, unsoloed"
              className="mf-band-reset"
            >
              Reset
            </Button>
            <span className="mf-band-model" title={mix.labelOf(song.model)}>
              {mix.labelOf(song.model)}
            </span>
          </div>
        </div>

        <div className="mf-band-track" ref={timeline}>
          <Outside opens={opens} closes={closes} />
          <Ruler mix={mix} view={view} timeline={timeline} />
          <WarpLane
            onsets={mix.onsets}
            bars={grid}
            height={24}
            barMarks={mix.barMarks}
            beats={mix.beats ? grid : undefined}
            hits={mix.hits}
            onMove={mix.moveBeat}
            onPlace={mix.place}
            placing={mix.manual !== null}
            span={span}
          />
        </div>
      </div>

      <div className="mf-lane-list" ref={list}>
        {lanes.map((stem) => {
          const own = mix.level[stem.id];
          const heard = mix.audible(stem.id);
          const ink = heard ? stem.ink : 'var(--idle)';
          return (
            <Fragment key={stem.id}>
              <div
                className="mf-lane"
                data-quiet={!heard || undefined}
                data-tab-open={stem.id === 'bass' && tabOpen ? true : undefined}
                style={{ '--stem': stem.ink } as never}
              >
                <div className="mf-head mf-lane-head">
                  <div className="mf-lane-id">
                    {stem.id === 'bass' ? (
                      <button
                        type="button"
                        className="mf-lane-label mf-tab-toggle"
                        aria-expanded={tabOpen}
                        title={`${tabOpen ? 'Hide' : 'Show'} bass tablature`}
                        onClick={() => setTabFor(tabOpen ? null : song.id)}
                      >
                        {stem.name}
                      </button>
                    ) : (
                      <span className="mf-lane-label">{stem.name}</span>
                    )}
                    <span className="mf-lane-db">{trim(own.volume)}</span>
                  </div>
                  <div className="mf-lane-strip">
                    <Tone stem={stem.name} ink={ink} bands={own.bands} onShape={(change) => mix.shape(stem.id, change)} />
                    <div className="mf-lane-level">
                      <Slider
                        param={LEVEL}
                        value={own.volume}
                        onChange={(next) => mix.adjust(stem.id, { volume: next })}
                        orientation="vertical"
                        travel={travel}
                        showValue={false}
                        ink={ink}
                        label={`${stem.name} level`}
                        className="mf-fader"
                      />
                      <div className="mf-lane-keys">
                        <Toggle
                          on={own.muted}
                          onChange={(next) => mix.adjust(stem.id, { muted: next })}
                          label={`Mute ${stem.name}`}
                          title="Mute"
                        >
                          M
                        </Toggle>
                        <Toggle
                          on={own.soloed}
                          onChange={(next) => mix.adjust(stem.id, { soloed: next })}
                          label={`Solo ${stem.name}`}
                          title="Solo"
                          ink="var(--blue)"
                          className="mf-solo"
                        >
                          S
                        </Toggle>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mf-lane-draw">
                  {/* Drawn whether or not its audio has arrived. The lane, its
                      controls and its grid are known the moment the manifest says
                      which stems the model made; only the waveform has to be
                      waited for, and it fills in as each stem decodes. Swapping a
                      caption out for a canvas made opening a track a flicker of
                      six rows changing shape. */}
                  <Waveform
                    peaks={mix.peaks[stem.id] ?? NOTHING}
                    // The peaks and the samples are the same stem or neither.
                    // The graph still holds the *last* track's buffers until this
                    // one has finished decoding, and a lane that took them while
                    // its own drawing was still empty would draw the song you
                    // just left, magnified, in this song's lane.
                    buffer={mix.peaks[stem.id] ? mix.audioOf(stem.id) : null}
                    ink={`var(--stem-${stem.id})`}
                    quiet={!heard}
                    bars={grid}
                    span={span}
                    onSeek={scrub}
                  />
                  {/* An empty lane and a lane of zeroes look the same and only one
                      of them is honest — but a lane that is still being read is
                      neither, so it says nothing until it knows. */}
                  {!mix.peaks[stem.id] && !mix.decoding && (
                    <span className="mf-lane-none">{mix.audioProblem ?? 'no audio loaded'}</span>
                  )}
                </div>
              </div>
              {stem.id === 'bass' && tabOpen && <TablatureLane mix={mix} span={span} />}
            </Fragment>
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
 * A complete transcription lane immediately beneath the audio it came from.
 *
 * The instrument is a standard four-string bass. There is no setup form in the
 * lane: EADG is part of what this feature means, like the source being Bass.
 */
function TablatureLane({ mix, span }: { mix: Mix; span: Span }) {
  const song = mix.song;
  if (!song) return null;
  const ownJob = mix.transcribingId === song.id;
  const done = mix.transcription?.trackId === song.id ? mix.transcription : null;
  const blocked = mix.runningId !== null || (mix.transcribingId !== null && !ownJob);
  const strings = done?.tuning.length ?? 4;
  const height = Math.max(84, strings * 18 + 22);
  const transpose = done?.sidecar.transpose ?? 0;
  const found = BASS_TRANSPOSE.indexOf(transpose as (typeof BASS_TRANSPOSE)[number]);
  const octave = found < 0 ? 1 : found;

  return (
    <div className="mf-lane mf-tab-lane" style={{ '--tab-height': `${height}px` } as never}>
      <div className="mf-head mf-tab-head">
        <div className="mf-tab-headline">
          <span className="mf-lane-label">Tablature</span>
          <span className="mf-tab-tuning">E A D G</span>
        </div>
        {done && (
          <span className="mf-tab-count">
            {done.sidecar.pitchedCount} notes · {done.sidecar.mutedCount} x
          </span>
        )}
        <div className="mf-tab-actions">
          {done && (
            <Segmented
              items={OCTAVES}
              index={octave}
              onChange={(next) => void mix.transposeBass(BASS_TRANSPOSE[next]!)}
              disabled={blocked}
              label="Bass octave correction"
              title="Move the complete transcription by one octave without running pitch detection again"
              className="mf-tab-octave"
            />
          )}
          {ownJob ? (
            <Button onPress={mix.cancelTranscription}>Cancel</Button>
          ) : done ? (
            <Button onPress={mix.revealTranscription}>Reveal</Button>
          ) : (
            <Button
              onPress={() => void mix.transcribeBass()}
              disabled={blocked}
              title={blocked ? 'The local engine is already working' : 'Detect bass notes and draw them as standard EADG tablature'}
            >
              Transcribe
            </Button>
          )}
        </div>
      </div>
      <div className="mf-tab-draw">
        {done ? (
          <Tablature
            notes={done.sidecar.notes}
            tuning={done.tuning}
            transpose={transpose}
            seconds={done.sidecar.seconds}
            bars={mix.grid}
            span={span}
            height={height}
            onSeek={(fraction) => mix.scrubTo(fraction * mix.seconds)}
          />
        ) : (
          <span className={mix.transcribeProblem ? 'mf-tab-message mf-tab-problem' : 'mf-tab-message'}>
            {mix.transcribeProblem
              ?? (ownJob
                ? mix.transcribeJob?.stage ?? 'transcribing the bass'
                : 'Transcribe the bass into standard four-string tablature')}
          </span>
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
 *
 * **What it asks for is a counted span, not the two ends of the song.** Finding
 * bar 97 of a song nobody has gridded yet is the one thing a person is worst at;
 * counting four bars is a thing they do without thinking. The precision that
 * gives up comes straight back — `state.ts` seeds a fit with the two clicks and
 * lets a line through every kick in the track set the tempo.
 */
function ManualBar({ mix }: { mix: Mix }) {
  const manual = mix.manual;
  if (!manual) return null;
  const step = manual.stage === 'first' ? 'step 1 / 2' : manual.stage === 'late' ? 'step 2 / 2' : 'tune';
  const later = `${manual.span} bar${manual.span === 1 ? '' : 's'} later`;
  const hint =
    manual.stage === 'first'
      ? 'Click any downbeat — the first beat of a bar'
      : manual.stage === 'late'
        ? `Now click the downbeat ${later} — count it out`
        : `Nudge the grid ten milliseconds either way, or click the downbeat ${later} again`;

  return (
    <div className="mf-manual">
      <span className="mf-manual-step">{step}</span>
      <span className="mf-manual-count">
        <span className="mf-cap">count</span>
        <Segmented
          items={SPANS.map(String)}
          index={SPANS.indexOf(manual.span)}
          onChange={(next) => mix.setSpan(SPANS[next])}
          label="How many bars to count"
          title="How many bars apart the two clicks are"
        />
      </span>
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
