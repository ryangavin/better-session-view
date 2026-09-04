import { useMemo, useState } from 'react';
import { Button } from '../src/controls/Button.tsx';
import { Select } from '../src/controls/Select.tsx';
import { Toggle } from '../src/controls/Toggle.tsx';
import { Facts, type Fact } from '../src/debug/Facts.tsx';
import { Group, Harness, Shelf, Status, Toolbar } from '../src/debug/Harness.tsx';
import { Legend } from '../src/debug/Legend.tsx';
import { Plot } from '../src/debug/Plot.tsx';
import { Rooms } from '../src/debug/Rooms.tsx';
import { Scope, ScopeRow } from '../src/debug/Scope.tsx';
import { Transport } from '../src/debug/Transport.tsx';
import { inkOf, xOf, type View } from '../src/debug/index.ts';
import { useAxis } from '../src/debug/useAxis.ts';
import { Workspace } from '../src/debug/Workspace.tsx';

/**
 * One tab a widget, so the seams are visible.
 *
 * The debug module was on the bench as a single case of everything working
 * together, which shows that it does and hides what any of it is. A harness is
 * a frame; a scope is rows on a shared axis; a plot is one drawing with a title
 * on it. Those are different widgets with different jobs and they are worth
 * being able to look at one at a time — particularly by whoever is about to
 * reach for one and needs to know which.
 *
 * `Together` is still here, at the end, because the composition is the point of
 * the module and a page of parts would stop showing it.
 */

const wave = (i: number, seed: number) =>
  Math.sin(i / 7 + seed) * 0.55 + Math.sin(i / 2.3 + seed * 2) * 0.3;

function Frame({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <div className="case wide">
      <div className="case-stage case-stack">{children}</div>
      <p className="case-note">{note}</p>
    </div>
  );
}

/** The frame, with nothing in it, so the frame is what you see. */
export function HarnessCase() {
  const [on, setOn] = useState(true);
  return (
    <Frame note="A head with a title, a subject and a status; a toolbar of captioned groups; a shelf for anything that sits under them. It holds no state and draws nothing — everything else on this page is mounted inside one.">
      <Harness
        title="Harness"
        subject={<Select label="Subject" items={['a made-up signal', 'another']} index={0} onChange={() => {}} width={150} />}
        status={<Status tone="good">nothing wrong</Status>}
      >
        <Toolbar>
          <Group caption="Range">
            <Button onPress={() => {}}>Whole</Button>
            <Button onPress={() => {}}>+</Button>
            <Button onPress={() => {}}>−</Button>
          </Group>
          <Group caption="Show">
            <Toggle on={on} onChange={setOn} label="Show the beats">beats</Toggle>
          </Group>
          <Group caption="Verdict">
            <Status tone="bad">two missing</Status>
            <Status tone="quiet">and one for completeness</Status>
          </Group>
        </Toolbar>
        <Shelf>
          <Facts items={[{ name: 'what a shelf is for', value: 'anything under the toolbar' }]} />
        </Shelf>
      </Harness>
    </Frame>
  );
}

/** Rows that must line up to the pixel, and one zoom over all of them. */
export function ScopeCase() {
  const axis = useAxis({ seconds: 60, initial: { from: 0, to: 20 } });
  const signal = useMemo(() => Array.from({ length: 4096 }, (_, i) => wave(i / 12, 1)), []);

  const line = (ink: 'cool' | 'good', seed: number) => (g: CanvasRenderingContext2D, view: View) => {
    g.strokeStyle = inkOf(g.canvas, ink as 'cool');
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= view.width; x++) {
      const at = view.from + ((view.to - view.from) * x) / view.width;
      const y = view.height / 2 - wave(at * 6 + seed, seed) * view.height * 0.4;
      if (!x) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  };

  const ticks = (g: CanvasRenderingContext2D, view: View) => {
    g.strokeStyle = inkOf(g.canvas, 'edge');
    g.beginPath();
    for (let beat = Math.floor(view.from * 2); beat <= view.to * 2; beat++) {
      const x = Math.round(xOf(view, beat / 2)) + 0.5;
      g.moveTo(x, view.height * 0.2);
      g.lineTo(x, view.height * 0.8);
    }
    g.stroke();
  };

  return (
    <Frame note="Every row draws through a callback handed the same view, which is what makes them line up. The row marked as the ruler owns the time gestures: click to seek, drag to pan, shift-drag for a loop, alt-drag to scrub. Scroll pans, shift-scroll zooms about the pointer. Signal is what it holds; the scope knows nothing about either.">
      <Scope axis={axis}>
        <ScopeRow label="time" height={26} draw={ticks} ruler />
        <ScopeRow label="left" height={64} draw={line('cool', 1)} />
        <ScopeRow label="right" height={64} draw={line('good', 4)} />
      </Scope>
      <span className="case-hint">{signal.length} made-up samples, drawn straight from the view</span>
    </Frame>
  );
}

/** One drawing with a title bar, which is the graph the scope is not. */
export function PlotCase() {
  const [shape, setShape] = useState(0);
  const curve = (x: number) =>
    shape === 0 ? Math.exp(-Math.pow((x - 0.5) * 5, 2)) : shape === 1 ? x : Math.abs(Math.sin(x * 9));

  return (
    <Frame note="A plot is one drawing, titled, with room for controls beside the title and a caption under it. It is not on the scope's axis and has no time in it — a curve, a distribution, a sweep. The pointer's position is handed to the draw so a plot can say what is under it.">
      <Plot
        title="Tempo sweep"
        height={140}
        actions={<Select label="Shape" items={['a peak', 'a ramp', 'a comb']} index={shape} onChange={setShape} width={110} />}
        caption="Bottom of the curve at 120 bpm"
        draw={(g, width, height, hover) => {
          g.strokeStyle = inkOf(g.canvas, 'fill');
          g.lineWidth = 1.5;
          g.beginPath();
          for (let x = 0; x <= width; x++) {
            const y = height - 8 - curve(x / width) * (height - 22);
            if (!x) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
          if (hover === null) return;
          g.strokeStyle = inkOf(g.canvas, 'text');
          g.beginPath();
          g.moveTo(Math.round(hover) + 0.5, 0);
          g.lineTo(Math.round(hover) + 0.5, height);
          g.stroke();
        }}
      />
    </Frame>
  );
}

/** The ledger a harness opens with. */
export function FactsCase() {
  const items: Fact[] = [
    { name: 'tempo', value: '128.02 bpm' },
    { name: 'beats', value: 705 },
    { name: 'agreement', value: '93%', tone: 'good' },
    { name: 'missing', value: 2, tone: 'bad' },
    { name: 'latency', value: '11.6 ms', tone: 'quiet', title: 'What the output reported' },
    { name: 'arm', value: 'made up' },
  ];
  return (
    <Frame note="Names and values, read at a glance — the summary a harness opens with. A tone marks the one worth noticing: good, bad, or quiet for the ones that exist only for completeness. It is a description list, so it reads in order to a screen reader as it does on the page.">
      <Facts items={items} />
      <Shelf>
        <Facts items={[{ name: 'in a shelf', value: 'the same widget, under a toolbar' }]} />
      </Shelf>
    </Frame>
  );
}

/** What the marks on a drawing mean. */
export function LegendCase() {
  return (
    <Frame note="Six kinds of mark, each in an ink the drawing also uses — usually a var(--…), so a legend follows the palette rather than restating it. It is the only widget here whose whole job is to be read beside something else.">
      <Legend
        items={[
          { kind: 'line', ink: 'var(--wdg-fill)', label: 'beat' },
          { kind: 'tall', ink: 'var(--green)', label: 'downbeat' },
          { kind: 'dashed', ink: 'var(--wdg-caption)', label: 'placed between anchors' },
          { kind: 'swatch', ink: 'var(--blue)', label: 'loop' },
          { kind: 'dot', ink: 'var(--wdg-alarm)', label: 'a fill' },
          { kind: 'text', ink: 'var(--green)', label: 'ms after predicted', text: '+1.2' },
        ]}
      />
    </Frame>
  );
}

/** Play, stop, and where the head is. */
export function TransportCase() {
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(12.3456);
  return (
    <Frame note="A play button, the head as bars and as a clock, and the output's latency when the engine reports one. It owns no playback: it says what is true and calls back when pressed, which is what keeps it usable in a harness with no engine behind it.">
      <Transport playing={playing} onToggle={() => setPlaying((on) => !on)} at={at} latency={0.0116}>
        <Button onPress={() => setAt((n) => n + 1)}>+1s</Button>
        <Button onPress={() => setAt(0)}>Top</Button>
      </Transport>
      <Transport playing={false} onToggle={() => {}} at={0} disabled />
      <span className="case-hint">The second one is disabled, as when nothing is loaded.</span>
    </Frame>
  );
}

/** The two the page you are reading is made of. */
export function WorkspaceCase() {
  const [tab, setTab] = useState('one');
  const [room, setRoom] = useState('a');
  const [inner, setInner] = useState('x');
  const panel = (text: string) => () => <p className="case-hint">{text}</p>;

  return (
    <>
      <Frame note="A workspace is a row of tabs over one panel. Only the selected experiment is mounted, so an experiment that runs something expensive stops when you leave it — and Reset tab remounts it, which is the quickest way to start a measurement over.">
        <Workspace
          experiments={[
            { id: 'one', title: 'One', description: 'The description sits under the tabs.', component: panel('Only this one is mounted.') },
            { id: 'two', title: 'Two', description: 'Each tab brings its own.', component: panel('Switching unmounted the other.') },
            { id: 'three', title: 'Three', description: '', component: panel('An empty description leaves the line out.') },
          ]}
          context={null}
          selected={tab}
          onSelect={setTab}
        />
      </Frame>
      <Frame note="Rooms are the second axis, for when one row of tabs stopped being a list: rooms down the side, that room's tabs across the top. A room is a title and a set of experiments — no layout, no state — so regrouping is moving a line. A remembered tab from another room opens the room rather than emptying it.">
        <Rooms
          rooms={[
            { id: 'a', title: 'First room', note: 'with a note under it', experiments: [
              { id: 'x', title: 'X', description: '', component: panel('Room A, tab X.') },
              { id: 'y', title: 'Y', description: '', component: panel('Room A, tab Y.') },
            ] },
            { id: 'b', title: 'Second room', experiments: [
              { id: 'z', title: 'Z', description: '', component: panel('Room B only has one.') },
            ] },
          ]}
          context={null}
          room={room}
          tab={inner}
          onRoom={setRoom}
          onTab={setInner}
        />
      </Frame>
    </>
  );
}
