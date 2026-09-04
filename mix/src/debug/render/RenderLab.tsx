import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Harness, Toolbar, Group, Status } from '@openflow/widgets/debug/Harness.tsx';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { ink } from '@openflow/widgets/debug/ink.ts';
import type { View } from '@openflow/widgets/debug/axis.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Mix } from '../../state.ts';
import { STEMS } from '../../mock.ts';
import type { Peak } from '../../audio.ts';
import { cellsIn, levelsOf, packedOf, type Steps } from '@openflow/widgets/wave/levels.ts';
import { densityFor, edgesOf, pathOf, samplesFrom } from '@openflow/widgets/wave/outline.ts';
import { FILLS, paintShape } from './fills.ts';
import './render.css';

/**
 * What a lane could be drawn as, against what a lane is drawn as now.
 *
 * One drawing at a time, over as many lanes as the window stacks. Both at once
 * would be two drawings sharing one frame, and a reading taken like that
 * belongs to neither of them — so the toggle swaps which is mounted rather than
 * putting them side by side, and the eye compares by flipping.
 *
 * The zoom is the real one. `useAxis` and `Scope` are the same window and the
 * same wheel gestures the app has, so a drawing that keeps up here has kept up
 * with the thing it would have to keep up with.
 *
 * Readings are taken inside the frame that does the work: each lane records
 * what it cost to build its shape and what it cost to fill it, and the panel
 * adds up the lanes a few times a second. Timing a redraw from outside times
 * React and the compositor along with it, which is how this hunt went wrong
 * twice before.
 */

/** Two per pixel is what the lanes draw today, and the comb that produces. */
const PER_PIXEL = 2;

interface Timing {
  build: number;
  fill: number;
  worst: number;
  points: number;
  level: number;
  read: number;
}

const fresh = (): Timing => ({ build: 0, fill: 0, worst: 0, points: 0, level: 0, read: 0 });

/** `null` rides the zoom; the rest are there to see what it is choosing between. */
const DENSITIES = [null, 0.25, 0.5, 1, 2];
const SMOOTHS = [0, 0.5, 1];

export function RenderLab({ mix }: { mix: Mix }) {
  const songs = mix.songs.filter((s) => s.stems && s.sources.length);
  return (
    <Harness
      className="mf-render-lab"
      title="Waveform rendering"
      subject={
        <Select
          label="Experiment track"
          items={songs.map((s) => s.title)}
          index={Math.max(0, songs.findIndex((s) => s.id === mix.song?.id))}
          onChange={(i) => mix.select(songs[i].id)}
          width={240}
        />
      }
    >
      {mix.song && Object.keys(mix.peaks).length ? (
        <Lab key={mix.song.id} mix={mix} />
      ) : (
        <p className="mf-render-note">Open a separated track to compare drawings of it.</p>
      )}
    </Harness>
  );
}

function Lab({ mix }: { mix: Mix }) {
  const [mode, setMode] = useState(0);
  const [count, setCount] = useState(0);
  const [density, setDensity] = useState(0);
  const [smooth, setSmooth] = useState(2);
  const [fill, setFill] = useState(1);
  const [ladder, setLadder] = useState(true);
  const lanes = count === 0 ? 4 : 6;
  const axis = useAxis({ seconds: mix.seconds, narrowest: 0.02 });

  /**
   * As many lanes as asked for, in the window's own colours.
   *
   * A track separates into four, so six repeats the first two rather than
   * inventing sound — what the sixth lane is for is the cost of a sixth lane,
   * and that is the same whatever is drawn in it.
   */
  const rows = useMemo(() => {
    const ids = Object.keys(mix.peaks);
    if (!ids.length) return [];
    return Array.from({ length: lanes }, (_, i) => {
      const id = ids[i % ids.length];
      const stem = STEMS[i % STEMS.length];
      return { key: `${id}-${i}`, id, label: stem.name.toLowerCase(), ink: stem.ink };
    });
  }, [mix.peaks, lanes]);

  // One ladder per stem, built once. This is the cost the whole idea rests on
  // being paid on open rather than on every frame.
  const [ladders, built] = useMemo(() => {
    const at = performance.now();
    const map = new Map<string, readonly Steps[]>();
    for (const id of Object.keys(mix.peaks)) {
      map.set(id, levelsOf(packedOf(mix.peaks[id] as readonly Peak[])));
    }
    return [map, performance.now() - at] as const;
  }, [mix.peaks]);

  const timing = useRef<Timing[]>([]);
  const [shown, setShown] = useState<Timing[]>([]);
  useEffect(() => {
    timing.current = rows.map(fresh);
    const tick = setInterval(() => setShown(timing.current.map((t) => ({ ...t }))), 400);
    return () => clearInterval(tick);
  }, [rows, mode]);

  const tintOf = (g: CanvasRenderingContext2D, token: string) =>
    ink(g.canvas, token.replace('var(', '').replace(')', ''), '#6f97bd');

  const drawVector = useCallback(
    (i: number, id: string, token: string) => (g: CanvasRenderingContext2D, view: View) => {
      const levels = ladders.get(id);
      if (!levels) return;
      const t0 = performance.now();
      const share = (view.to - view.from) / mix.seconds;
      const ask = {
        from: view.from / mix.seconds,
        to: view.to / mix.seconds,
        width: view.width,
        height: view.height,
        density: DENSITIES[density] ?? densityFor(share),
        smooth: SMOOTHS[smooth],
        headroom: 0.86,
      };
      // The same handover the lanes make. A master cell is milliseconds wide,
      // so past it every rung is a drawing being enlarged — and an enlarged
      // envelope is why an attack stopped looking like an attack.
      const buffer = mix.audioOf(id);
      const master = cellsIn(levels[0]);
      const wanted = Math.round(view.width * ask.density);
      const fine = buffer && (ask.to - ask.from) * master < wanted;
      const edges = fine
        ? samplesFrom(
            Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)),
            { ...ask, length: buffer.length },
          )
        : edgesOf(ladder ? levels : [levels[0]], ask);
      const shape = {
        path: pathOf(edges, ask.smooth),
        points: edges.points,
        level: edges.level,
        read: edges.read,
      };
      const made = performance.now();
      // How it is painted is `fills.ts`'s argument, on its own timetable. The
      // shape is the same shape whichever treatment is chosen.
      paintShape(g, FILLS[fill], {
        path: shape.path,
        view,
        tint: tintOf(g, token),
        density: ask.density,
      });
      const at = timing.current[i];
      if (!at) return;
      at.build = made - t0;
      at.fill = performance.now() - made;
      at.worst = Math.max(at.worst, at.build + at.fill);
      at.points = shape.points;
      at.level = shape.level;
      at.read = shape.read;
    },
    [ladders, ladder, density, smooth, fill, mix.seconds, mix.audioOf],
  );

  // The lanes' own drawing, mirrored: a column per half pixel, every column in
  // view read, gathered into one path. Kept here rather than imported because
  // the lane builds it inside an effect; if that changes, this has to follow.
  const drawRects = useCallback(
    (i: number, id: string, token: string) => (g: CanvasRenderingContext2D, view: View) => {
      const peaks = mix.peaks[id];
      if (!peaks?.length) return;
      const t0 = performance.now();
      const from = view.from / mix.seconds;
      const to = view.to / mix.seconds;
      const first = Math.max(0, Math.floor(from * peaks.length));
      const last = Math.min(peaks.length, Math.ceil(to * peaks.length));
      const span = Math.max(1, last - first);
      const columns = Math.min(span, Math.max(1, Math.round(view.width * PER_PIXEL)));
      const middle = view.height / 2;
      const reach = middle * 0.86;
      const shape = new Path2D();
      for (let c = 0; c < columns; c++) {
        const a = first + Math.floor((c * span) / columns);
        const b = Math.max(a + 1, first + Math.floor(((c + 1) * span) / columns));
        let low = 0;
        let high = 0;
        for (let p = a; p < b; p++) {
          if (peaks[p].min < low) low = peaks[p].min;
          if (peaks[p].max > high) high = peaks[p].max;
        }
        const x = ((a / peaks.length - from) / (to - from)) * view.width;
        const wide = ((b / peaks.length - from) / (to - from)) * view.width - x;
        const top = middle - high * reach;
        shape.rect(x, top, Math.max(wide - 0.35, 0.6), Math.max(middle - low * reach - top, 1));
      }
      const made = performance.now();
      g.fillStyle = tintOf(g, token);
      g.fill(shape);
      const at = timing.current[i];
      if (!at) return;
      at.build = made - t0;
      at.fill = performance.now() - made;
      at.worst = Math.max(at.worst, at.build + at.fill);
      at.points = columns;
      at.level = 0;
      at.read = span;
    },
    [mix.peaks, mix.seconds],
  );

  /**
   * Both drawings on one lane, which is the only way to ask whether they agree.
   *
   * Faster is half the question. The other half is whether the same sound still
   * reads as the same thing — a snare where a snare was, an attack that still
   * looks like an attack — and no amount of flipping between two rows answers
   * that as well as one drawn through the other. The columns go down in grey
   * and the outline over them in the stem's colour, so anywhere the curve has
   * invented or swallowed a shape it shows as colour with no grey under it, or
   * grey with no line on it.
   */
  const drawBoth = useCallback(
    (i: number, id: string, token: string) => (g: CanvasRenderingContext2D, view: View) => {
      g.save();
      g.globalAlpha = 0.55;
      drawRects(i, id, '--fg-dim')(g, view);
      g.restore();
      const before = { ...timing.current[i] };
      g.save();
      drawVector(i, id, token)(g, view);
      g.restore();
      // The overlay's reading is the vector's; the columns under it are there
      // to be looked at, not to be timed.
      const at = timing.current[i];
      if (at) at.worst = Math.max(at.worst, before.worst);
    },
    [drawRects, drawVector],
  );

  const [bench, setBench] = useState('');
  const running = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /**
   * Each drawing swept, then stormed, over the lanes actually on screen.
   *
   * The storm is the part worth having. A wheel that reports faster than the
   * screen refreshes lands several zooms inside one frame, and a drawing that
   * only keeps up when it is asked once a frame has not been asked the question
   * a hand asks.
   */
  const sweep = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const said: string[] = [];
    for (const next of [0, 1]) {
      setMode(next);
      setBench(`measuring ${next === 0 ? 'vector' : 'lanes today'}…`);
      await new Promise((r) => setTimeout(r, 400));
      const marks: string[] = [];
      for (const [what, storm] of [['sweep', 1], ['×4', 4], ['×8', 8]] as const) {
        axis.whole();
        for (const t of timing.current) t.worst = 0;
        await new Promise((r) => setTimeout(r, 220));
        const t0 = performance.now();
        let frames = 0;
        let worst = 0;
        let last = t0;
        await new Promise<void>((done) => {
          const tick = () => {
            const now = performance.now();
            if (frames > 2) worst = Math.max(worst, now - last);
            last = now;
            frames++;
            for (let i = 0; i < storm; i++) axis.zoom(0.985, 0.5);
            now - t0 < 1500 ? requestAnimationFrame(tick) : done();
          };
          requestAnimationFrame(tick);
        });
        const secs = (performance.now() - t0) / 1000;
        const per = timing.current.reduce((n, t) => n + t.worst, 0);
        marks.push(`${what} ${(frames / secs).toFixed(0)}fps w${worst.toFixed(0)} draw≤${per.toFixed(1)}ms`);
      }
      said.push(`${next === 0 ? 'vector' : 'lanes'}: ${marks.join(', ')}`);
    }
    axis.whole();
    setBench(`${lanes} lanes — ${said.join(' — ')}`);
    running.current = false;
  }, [axis, lanes]);

  const total = shown.reduce(
    (n, t) => ({
      frame: n.frame + t.build + t.fill,
      worst: n.worst + t.worst,
      read: n.read + t.read,
    }),
    { frame: 0, worst: 0, read: 0 },
  );
  const first = shown[0] ?? fresh();

  return (
    <>
      <Toolbar>
        <Group caption="Drawing">
          <Segmented
            items={['vector', 'lanes today', 'overlay']}
            index={mode}
            onChange={setMode}
            label="Which drawing"
          />
        </Group>
        <Group caption="Lanes">
          <Segmented items={['4', '6']} index={count} onChange={setCount} label="How many lanes" />
        </Group>
        {mode === 0 && (
          <>
            <Group caption="Detail">
              <Select
                label="Points per pixel"
                items={DENSITIES.map((d) => (d === null ? 'auto' : `${d}/px`))}
                index={density}
                onChange={setDensity}
                width={78}
              />
              <Toggle on={ladder} onChange={setLadder} label="Read from the ladder">
                ladder
              </Toggle>
            </Group>
            <Group caption="Curve">
              <Select
                label="Smoothing"
                items={['none', 'half', 'full']}
                index={smooth}
                onChange={setSmooth}
                width={72}
              />
              <Select
                label="Fill"
                items={[...FILLS]}
                index={fill}
                onChange={setFill}
                width={72}
              />
            </Group>
          </>
        )}
        <Group caption="Range">
          <Button onPress={axis.whole}>Whole track</Button>
          <Button label="Zoom in" onPress={() => axis.zoom(0.5, 0.5)}>+</Button>
          <Button label="Zoom out" onPress={() => axis.zoom(2, 0.5)}>−</Button>
        </Group>
        <Group caption="Measure">
          <Button onPress={() => void sweep()}>Sweep &amp; storm</Button>
        </Group>
      </Toolbar>
      <div className="mf-render-stats">
        <Status tone={total.frame > 8 ? 'bad' : 'good'}>
          {lanes} lanes · {total.frame.toFixed(2)}ms a frame (worst {total.worst.toFixed(1)}) ·{' '}
          {total.read.toLocaleString()} cells read
        </Status>
        <Status>
          each lane · {first.points} {mode === 0 ? 'points' : 'columns'}
          {mode === 0 ? (first.level < 0 ? ' · from samples' : ` · rung ${first.level}`) : ''}
          {mode === 0 && DENSITIES[density] === null
            ? ` · ${densityFor((axis.window.to - axis.window.from) / mix.seconds).toFixed(2)}/px`
            : ''}
        </Status>
        <Status>
          ladders {ladders.size} × {ladders.size ? [...ladders.values()][0].length : 0} rungs, built
          in {built.toFixed(0)}ms{bench ? ` · ${bench}` : ''}
        </Status>
      </div>
      <Scope axis={axis}>
        {rows.map((row, i) => (
          <ScopeRow
            key={row.key}
            label={row.label}
            height={lanes === 4 ? 116 : 78}
            ruler={i === 0}
            draw={
              mode === 1
                ? drawRects(i, row.id, row.ink)
                : mode === 0
                  ? drawVector(i, row.id, row.ink)
                  : drawBoth(i, row.id, row.ink)
            }
          />
        ))}
      </Scope>
    </>
  );
}
