import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chain } from '../src/chrome/Chain.tsx';
import { Device, DevicePortRow } from '../src/chrome/Device.tsx';
import { Graph, GraphNode, type GraphCord, type GraphView } from '../src/chrome/Graph.tsx';
import { Port } from '../src/chrome/Port.tsx';
import { Row } from '../src/chrome/Row.tsx';
import { Button } from '../src/controls/Button.tsx';
import { Knob } from '../src/controls/Knob.tsx';
import { Meter } from '../src/controls/Meter.tsx';
import { Segmented } from '../src/controls/Segmented.tsx';
import { Select } from '../src/controls/Select.tsx';
import { Slider } from '../src/controls/Slider.tsx';
import { Toggle } from '../src/controls/Toggle.tsx';
import { Facts, type Fact } from '../src/debug/Facts.tsx';
import { Group, Harness, Shelf, Status, Toolbar } from '../src/debug/Harness.tsx';
import { useRemembered } from '../src/debug/useRemembered.ts';
import type { Experiment } from '../src/debug/Workspace.tsx';
import { Case, DRY_WET, FREQ } from './parts.tsx';
import {
  useEntries,
  useReading,
  useTrace,
  useWatch,
  type Reading,
  type Trace,
  type Watch,
} from './trace.ts';

/**
 * The graph, in a room of its own.
 *
 * Every other room on this bench answers "does it look right", and a
 * screenshot settles it. A canvas is the one part of the module a screenshot
 * cannot settle: the drawing is the easy half, and the hard half is whether a
 * cord lands where you aimed it, whether the node stayed put while you turned
 * the knob on it, and what any of that costs when there are two hundred nodes
 * instead of four.
 *
 * So this is not a page of cases. It is a canvas with an instrument on it —
 * [`trace.ts`](./trace.ts) — that keeps an account of what the hand did and
 * what the graph made of it, and prints the half the host never hears about.
 * The loop is: work on the canvas, read the account, change something in
 * `chrome/Graph.tsx`, work on it again, and compare the same numbers.
 *
 * The four tabs are the four questions in order. **Patch** is free play with
 * the instrument running. **Trials** is the same canvas with the graph's
 * documented promises listed beside it, ticked off as you make each one
 * happen. **Scale** is the same graph with far too much on it. **Anatomy** is
 * the still half — where a cord ends, and how a face changes shape to line one
 * up.
 */

type Kind = 'note' | 'signal';

interface Slot {
  id: string;
  label: string;
  kind: Kind;
}

interface Face {
  id: string;
  name: string;
  x: number;
  y: number;
  inlets: readonly Slot[];
  outlets: readonly Slot[];
}

/**
 * Two kinds, so the host has something to refuse a cord for, and a branch, so
 * there is more than one right answer to where a cord should go.
 *
 * The names are deliberately no device in particular: this module has no list
 * of kinds and no opinion about what a port carries, and a bench case naming a
 * real one would be the first place that stopped being true.
 */
const PATCH: readonly Face[] = [
  {
    id: 'source',
    name: 'Source',
    x: 16,
    y: 44,
    inlets: [],
    outlets: [
      { id: 'source:notes', label: 'Notes', kind: 'note' },
      { id: 'source:level', label: 'Level', kind: 'signal' },
    ],
  },
  {
    id: 'shape',
    name: 'Shape',
    x: 232,
    y: 16,
    inlets: [
      { id: 'shape:pitch', label: 'Pitch', kind: 'note' },
      { id: 'shape:size', label: 'Size', kind: 'signal' },
    ],
    outlets: [{ id: 'shape:out', label: 'Out', kind: 'signal' }],
  },
  {
    id: 'blend',
    name: 'Blend',
    x: 232,
    y: 210,
    inlets: [
      { id: 'blend:a', label: 'A', kind: 'signal' },
      { id: 'blend:b', label: 'B', kind: 'signal' },
    ],
    outlets: [{ id: 'blend:out', label: 'Out', kind: 'signal' }],
  },
  {
    id: 'output',
    name: 'Output',
    x: 468,
    y: 108,
    inlets: [{ id: 'output:in', label: 'In', kind: 'signal' }],
    outlets: [],
  },
];

const START: readonly GraphCord[] = [
  { from: 'source:notes', to: 'shape:pitch', kind: 'note' },
  { from: 'shape:out', to: 'output:in', kind: 'signal' },
];

const spots = (faces: readonly Face[]) =>
  Object.fromEntries(faces.map((face) => [face.id, { x: face.x, y: face.y }]));

/**
 * The host half of the bargain, kept in one place because both canvases use it.
 *
 * The graph offers a pair of ids and this decides: the kinds must agree, an
 * inlet takes one cord, and a cord already there is not made twice. Every
 * decision goes through the watch, so a refusal is as visible in the account
 * as a landing — a refusal that costs nothing is the design, and a refusal
 * nobody can see is a canvas that appears to have ignored you.
 */
function usePatch(watch: Watch, trace: Trace) {
  const [faces, setFaces] = useState<readonly Face[]>(PATCH);
  const [at, setAt] = useState<Record<string, { x: number; y: number }>>(() => spots(PATCH));
  const [cords, setCords] = useState<readonly GraphCord[]>(START);
  const [picked, setPicked] = useState<string | null>(null);
  const made = useRef(0);

  const ports = useMemo(
    () => faces.flatMap((face) => [...face.inlets, ...face.outlets]),
    [faces],
  );

  const connect = useCallback(
    (from: string, to: string) => {
      const carries = ports.find((port) => port.id === from)?.kind;
      const takes = ports.find((port) => port.id === to)?.kind;
      if (!carries || !takes) return;
      if (carries !== takes) {
        watch.refused(`${from} carries a ${carries}, ${to} takes a ${takes}`);
        return;
      }
      if (cords.some((cord) => cord.from === from && cord.to === to)) {
        watch.refused(`${from} → ${to} is already there`);
        return;
      }
      watch.landed(from, to);
      // One cord per inlet, which is this host's rule and not the graph's.
      setCords((held) => [...held.filter((cord) => cord.to !== to), { from, to, kind: carries }]);
    },
    [cords, ports, watch],
  );

  const move = useCallback(
    (id: string, x: number, y: number) => {
      watch.moved(id);
      setAt((held) => ({ ...held, [id]: { x: Math.round(x), y: Math.round(y) } }));
    },
    [watch],
  );

  const cut = useCallback(
    (to: string) => {
      trace.say('said', `cut the cord into ${to}, from this page's own ×`);
      setCords((held) => held.filter((cord) => cord.to !== to));
    },
    [trace],
  );

  const add = useCallback(() => {
    const n = (made.current += 1);
    const id = `gain${n}`;
    const face: Face = {
      id,
      name: `Gain ${n}`,
      x: 40 + n * 24,
      y: 320,
      inlets: [{ id: `${id}:in`, label: 'In', kind: 'signal' }],
      outlets: [{ id: `${id}:out`, label: 'Out', kind: 'signal' }],
    };
    setFaces((held) => [...held, face]);
    setAt((held) => ({ ...held, [id]: { x: face.x, y: face.y } }));
    trace.say('said', `${face.name} was dropped on the canvas, wired to nothing`);
  }, [trace]);

  const reset = useCallback(() => {
    made.current = 0;
    setFaces(PATCH);
    setAt(spots(PATCH));
    setCords(START);
    setPicked(null);
    trace.say('said', 'back to four nodes and two cords');
  }, [trace]);

  return { faces, at, cords, picked, setPicked, connect, move, cut, add, reset, ports };
}

type Patch = ReturnType<typeof usePatch>;

/** Small enough that four of them fit on a canvas, and live, so a turn is real. */
function PatchFace({ watch }: { watch: Watch }) {
  const [freq, setFreq] = useState(FREQ.defaultValue);
  const [wet, setWet] = useState(DRY_WET.defaultValue);
  return (
    <Row>
      <Knob
        param={FREQ}
        value={freq}
        onChange={(next) => {
          watch.turned();
          setFreq(next);
        }}
      />
      <Knob
        param={DRY_WET}
        value={wet}
        onChange={(next) => {
          watch.turned();
          setWet(next);
        }}
      />
    </Row>
  );
}

/**
 * The canvas both working tabs share.
 *
 * The `×` beside a taken inlet is **this page's**, not the graph's, and it is
 * here on purpose: deleting a cord is on the module's list of things that
 * aren't built, and the workaround its first host reached for should be
 * something you can put a hand on rather than a sentence in a document. If it
 * turns out to be fine, that is an answer; if it turns out to be awkward, that
 * is the argument for hit-testing a bezier.
 */
function Canvas({ patch, watch, tall }: { patch: Patch; watch: Watch; tall?: boolean }) {
  const view = useRef<GraphView>(null);

  useEffect(() => {
    watch.reads(() => view.current?.scale() ?? 1);
    return () => watch.reads(null);
  }, [watch]);

  return (
    <div className="patch-case" ref={watch.attach}>
      <Graph
        className={`patch${tall ? ' tall' : ''}`}
        viewRef={view}
        cords={patch.cords}
        onConnect={patch.connect}
        onMove={patch.move}
        onClearSelection={() => patch.setPicked(null)}
      >
        {patch.faces.map((face) => (
          <GraphNode key={face.id} id={face.id} x={patch.at[face.id].x} y={patch.at[face.id].y}>
            <Device
              name={face.name}
              on
              onToggle={() => {}}
              selected={patch.picked === face.id}
              onSelect={() => patch.setPicked(face.id)}
              inlets={face.inlets.map((slot) => {
                const taken = patch.cords.some((cord) => cord.to === slot.id);
                return (
                  <span key={slot.id} className="patch-inlet">
                    <Port
                      id={slot.id}
                      side="in"
                      label={slot.label}
                      kind={slot.kind}
                      connected={taken}
                    />
                    {taken && (
                      <button
                        type="button"
                        className="patch-cut"
                        title={`Cut the cord into ${slot.label}`}
                        aria-label={`Cut the cord into ${slot.label}`}
                        onClick={() => patch.cut(slot.id)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
              outlets={face.outlets.map((slot) => (
                <Port
                  key={slot.id}
                  id={slot.id}
                  side="out"
                  label={slot.label}
                  kind={slot.kind}
                  connected={patch.cords.some((cord) => cord.from === slot.id)}
                />
              ))}
            >
              <PatchFace watch={watch} />
            </Device>
          </GraphNode>
        ))}
      </Graph>
    </div>
  );
}

/**
 * Everything the instrument has to say, on a cadence of its own.
 *
 * A leaf, and the graph is not underneath it. Four readings a second cost four
 * renders of a definition list and nothing at all of the canvas being measured
 * — which is the only way a number like "worst frame in a gesture" means
 * anything.
 */
function Readings({ watch, asked }: { watch: Watch; asked: number }) {
  const reading = useReading(watch);
  const tried = reading.landed + reading.dropped;
  const items: Fact[] = [
    { name: 'cords landed', value: reading.landed },
    {
      name: 'let go over nothing',
      value: reading.dropped,
      tone: reading.dropped > reading.landed ? 'bad' : reading.dropped ? 'normal' : 'quiet',
      title: 'The half the host never hears about. A cord picked up and released on no port.',
    },
    {
      name: 'aim',
      value: tried ? `${Math.round((reading.landed / tried) * 100)}%` : '—',
      title: 'Of every cord picked up, the share that reached a port.',
    },
    {
      name: 'time to land',
      value: reading.reachMs === null ? '—' : `${reading.reachMs}ms`,
      title: 'Mean, from the port going down to the host hearing about it.',
    },
    { name: 'refused', value: reading.refused, tone: 'quiet' },
    {
      name: 'outlet / inlet / keys',
      value: `${reading.fromOutlet} / ${reading.fromInlet} / ${reading.byKeyboard}`,
      title: 'Which end the hand started at. A cord pulls from either.',
    },
    {
      name: 'node dragged by a knob',
      value: reading.snagged,
      tone: reading.snagged ? 'bad' : 'quiet',
      title: 'A control was turned and the node moved with it. This must stay at zero.',
    },
    {
      name: 'worst frame',
      value: reading.worstFrameMs === null ? '—' : `${reading.worstFrameMs}ms`,
      tone: (reading.worstFrameMs ?? 0) > 32 ? 'bad' : 'normal',
      title: 'The longest gap between frames during the last gesture worth timing.',
    },
    { name: 'moves in that drag', value: reading.moves },
    {
      name: 'cords drawn / asked',
      value: `${reading.cordsDrawn} / ${asked}`,
      tone: reading.cordsDrawn === asked ? 'normal' : 'bad',
      title: 'A cord naming a port that is not mounted is skipped. These should agree.',
    },
    { name: 'nodes / ports', value: `${reading.nodes} / ${reading.ports}` },
    { name: 'zoom', value: `${reading.scale.toFixed(2)}×` },
    { name: 'pan', value: `${Math.round(reading.panX)}, ${Math.round(reading.panY)}` },
    { name: 'in hand', value: reading.holding, tone: 'quiet' },
  ];
  return <Facts className="graph-readings" items={items} />;
}

/** The running account, printed. Newest last, because that is where a log is read. */
function Account({ trace }: { trace: Trace }) {
  const entries = useEntries(trace);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="graph-account">
      <span className="case-hint">
        {entries.length
          ? `${entries.length} entries, newest last`
          : 'nothing yet — put a hand on the canvas'}
      </span>
      <ol ref={list}>
        {entries.map((entry) => (
          <li key={entry.n} data-kind={entry.kind}>
            <span className="graph-account-at">{(entry.at / 1000).toFixed(2)}s</span>
            <span className="graph-account-kind">{entry.kind}</span>
            <span className="graph-account-said">{entry.said}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The one line that says whether anything is wrong rather than merely counted. */
function Verdict({ watch, asked }: { watch: Watch; asked: number }) {
  const reading = useReading(watch, 400);
  if (reading.snagged > 0) {
    return <Status tone="bad">a knob dragged its node — {reading.snagged} times</Status>;
  }
  if (reading.cordsDrawn !== asked) {
    return (
      <Status tone="bad">
        {asked} cords asked for, {reading.cordsDrawn} drawn
      </Status>
    );
  }
  if (reading.landed + reading.dropped === 0) return <Status tone="quiet">nothing tried yet</Status>;
  const aim = Math.round((reading.landed / (reading.landed + reading.dropped)) * 100);
  return (
    <Status tone={aim >= 80 ? 'good' : 'bad'}>
      {aim}% of cords picked up reached a port
    </Status>
  );
}

export function PatchRoom() {
  const trace = useTrace();
  const watch = useWatch(trace);
  const patch = usePatch(watch, trace);

  return (
    <Harness
      title="Patch"
      subject={
        <span className="graph-subject">
          {patch.faces.length} nodes, {patch.ports.length} ports, {patch.cords.length} cords
        </span>
      }
      status={<Verdict watch={watch} asked={patch.cords.length} />}
    >
      <Toolbar>
        <Group caption="Canvas" title="The document is this page's; the view is the graph's.">
          <Button onPress={patch.add}>Add a node</Button>
          <Button onPress={patch.reset}>Reset</Button>
        </Group>
        <Group caption="Account" title="Clears the counts and the printed entries together.">
          <Button
            onPress={() => {
              watch.clear();
              trace.clear();
            }}
          >
            Clear
          </Button>
        </Group>
      </Toolbar>
      <Canvas patch={patch} watch={watch} tall />
      <Shelf>
        <Readings watch={watch} asked={patch.cords.length} />
        <Account trace={trace} />
      </Shelf>
    </Harness>
  );
}

interface Trial {
  id: string;
  task: string;
  how: string;
  met(reading: Reading): boolean;
}

/**
 * What the graph promises, one line each.
 *
 * Every one of these is a sentence from [the graph's own document](../docs/graph.md)
 * turned into something you can do and something that can be seen to have
 * happened. That is the point of the list: a promise nobody exercises is a
 * promise nobody notices breaking, and half of these break silently — a cord
 * that will not pull from the inlet end still connects perfectly the other
 * way round.
 */
const TRIALS: readonly Trial[] = [
  {
    id: 'outlet',
    task: 'Land a cord pulled from an outlet',
    how: 'Drag from Source’s Level onto Shape’s Size.',
    met: (r) => r.fromOutlet > 0,
  },
  {
    id: 'inlet',
    task: 'Land one pulled from the inlet instead',
    how: 'Drag from Output’s In onto Blend’s Out. It makes the same cord.',
    met: (r) => r.fromInlet > 0,
  },
  {
    id: 'keys',
    task: 'Land one with no pointer at all',
    how: 'Tab to a port, Enter to arm it, tab to one on the other side, Enter again.',
    met: (r) => r.byKeyboard > 0,
  },
  {
    id: 'reached',
    task: 'Reach a port with Tab',
    how: 'Ports are ordinary buttons. Tabbing through the patch should get to one.',
    met: (r) => r.reachedPort,
  },
  {
    id: 'refused',
    task: 'Be refused, and lose nothing',
    how: 'Drag Notes onto Size. The graph offers the pair; this page says no.',
    met: (r) => r.refused > 0,
  },
  {
    id: 'escaped',
    task: 'Drop a cord that is already in flight',
    how: 'Pick one up, then press Escape without releasing over a port.',
    met: (r) => r.escaped > 0,
  },
  {
    id: 'turned',
    task: 'Turn a knob without moving its node',
    how: 'Drag a dial inside a node. The node must stay exactly where it was.',
    met: (r) => r.turnedClean > 0,
  },
  {
    id: 'dragged',
    task: 'Drag a node by its title bar',
    how: 'Anywhere a control has not claimed works; the head is the obvious place.',
    met: (r) => r.moves > 0,
  },
  {
    id: 'nudged',
    task: 'Nudge a node with the arrow keys',
    how: 'Focus a title bar and press an arrow. Shift is the fine one, 1 unit against 8.',
    met: (r) => r.nudged > 0,
  },
  {
    id: 'zoomed',
    task: 'Zoom about the cursor',
    how: 'Scroll over the canvas. The point under the pointer must not drift.',
    met: (r) => Math.abs(r.scale - 1) > 0.01,
  },
  {
    id: 'turned-zoomed',
    task: 'Turn a control while the canvas is zoomed',
    how: 'Zoom out, then drag a knob. The fill has to keep up with the hand — a control drawn half size takes half the hand to cross.',
    met: (r) => r.turnedZoomed > 0,
  },
  {
    id: 'panned',
    task: 'Pan the empty background',
    how: 'Drag the canvas itself. Only the background pans; a node is its own target.',
    met: (r) => Math.abs(r.panX) > 2 || Math.abs(r.panY) > 2,
  },
];

/**
 * Latched, because a checklist that un-ticks itself is not a checklist.
 *
 * Zoom back to 1 and the reading says 1 again, which is true and is not the
 * question being asked. What is being asked is whether the gesture worked
 * once, so the answer is kept until the round is reset.
 */
function Trials({ watch }: { watch: Watch }) {
  const reading = useReading(watch, 200);
  const [met, setMet] = useState<readonly string[]>([]);

  useEffect(() => {
    const now = TRIALS.filter((trial) => trial.met(reading)).map((trial) => trial.id);
    const next = [...new Set([...met, ...now])];
    if (next.length !== met.length) setMet(next);
  }, [reading, met]);

  return (
    <div className="graph-trials">
      <p className="graph-trials-score">
        {met.length} of {TRIALS.length} done
        {reading.snagged > 0 ? ` — and a knob dragged its node ${reading.snagged} times` : ''}
      </p>
      <ol>
        {TRIALS.map((trial) => {
          const done = met.includes(trial.id);
          return (
            <li key={trial.id} {...(done ? { 'data-met': '' } : {})}>
              <span className="graph-trial-state">{done ? 'done' : 'not yet'}</span>
              <span className="graph-trial-task">{trial.task}</span>
              <span className="graph-trial-how">{trial.how}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function TrialRoom() {
  const trace = useTrace();
  const watch = useWatch(trace);
  const patch = usePatch(watch, trace);
  const [round, setRound] = useState(0);

  return (
    <Harness
      title="Trials"
      subject={<span className="graph-subject">{TRIALS.length} promises, on one patch</span>}
      status={<Verdict watch={watch} asked={patch.cords.length} />}
    >
      <Toolbar>
        <Group caption="Round" title="Clears the ticks and every count behind them.">
          <Button
            onPress={() => {
              watch.clear();
              trace.clear();
              patch.reset();
              setRound((n) => n + 1);
            }}
          >
            Start again
          </Button>
        </Group>
      </Toolbar>
      <div className="graph-trials-case">
        <Canvas patch={patch} watch={watch} tall />
        <Trials key={round} watch={watch} />
      </div>
      <Shelf>
        <Account trace={trace} />
      </Shelf>
    </Harness>
  );
}

const SIZES = [6, 24, 96, 240];

/** A block, wide rather than tall, so panning it is the gesture under test. */
function block(count: number) {
  const columns = Math.max(4, Math.ceil(Math.sqrt(count) * 1.6));
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `n${i}`,
      { x: (i % columns) * 210, y: Math.floor(i / columns) * 150 },
    ]),
  );
}

const runOf = (count: number): readonly GraphCord[] =>
  Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({
    from: `n${i}:out`,
    to: `n${i + 1}:in`,
    kind: 'signal',
  }));

/**
 * The same graph with far too much on it, and one switch to tell whose cost it is.
 *
 * A canvas that is smooth with four nodes tells you nothing. What the number
 * below is for is the comparison, not its absolute value: drag a node with
 * faces on, drag one with faces off, and the difference is what the faceplates
 * cost. Ablate before concluding — a slow canvas at 240 nodes with faces on
 * and a fast one with them off is a device-rendering problem, and no amount of
 * work on `Graph.tsx` will touch it.
 */
export function ScaleRoom() {
  const trace = useTrace();
  const watch = useWatch(trace);
  const [size, setSize] = useRemembered('graph-scale', 1);
  const [faces, setFaces] = useRemembered('graph-scale-faces', true);
  const count = SIZES[size] ?? SIZES[0];

  const [at, setAt] = useState<Record<string, { x: number; y: number }>>(() => block(count));
  useEffect(() => setAt(block(count)), [count]);
  const cords = useMemo(() => runOf(count), [count]);

  return (
    <Harness
      title="Scale"
      subject={
        <span className="graph-subject">
          {count} nodes, {count * 2} ports, {cords.length} cords
        </span>
      }
      status={<Cost watch={watch} />}
    >
      <Toolbar>
        <Group caption="Nodes">
          <Segmented
            items={SIZES.map(String)}
            index={size}
            onChange={setSize}
            label="How many nodes"
          />
        </Group>
        <Group caption="Faces" title="Off is the ablation: a node with nothing on it but its name.">
          <Toggle on={faces} onChange={setFaces} label="Draw the faceplates">
            {faces ? 'drawn' : 'bare'}
          </Toggle>
        </Group>
        <Group caption="Account">
          <Button
            onPress={() => {
              watch.clear();
              trace.clear();
            }}
          >
            Clear
          </Button>
        </Group>
      </Toolbar>
      <div className="patch-case" ref={watch.attach}>
        <Graph
          className="patch tall"
          cords={cords}
          onMove={(id, x, y) => {
            watch.moved(id);
            setAt((held) => ({ ...held, [id]: { x: Math.round(x), y: Math.round(y) } }));
          }}
        >
          {Object.entries(at).map(([id, spot]) => (
            <GraphNode key={id} id={id} x={spot.x} y={spot.y}>
              <Device
                name={id}
                on
                onToggle={() => {}}
                inlets={<Port id={`${id}:in`} side="in" label="In" kind="signal" />}
                outlets={<Port id={`${id}:out`} side="out" label="Out" kind="signal" />}
              >
                {faces ? <PatchFace watch={watch} /> : <span className="scale-bare">—</span>}
              </Device>
            </GraphNode>
          ))}
        </Graph>
      </div>
      <Shelf>
        <Readings watch={watch} asked={cords.length} />
        <Account trace={trace} />
      </Shelf>
    </Harness>
  );
}

function Cost({ watch }: { watch: Watch }) {
  const reading = useReading(watch, 400);
  if (reading.worstFrameMs === null) return <Status tone="quiet">drag something to measure</Status>;
  return (
    <Status tone={reading.worstFrameMs > 32 ? 'bad' : reading.worstFrameMs > 20 ? 'normal' : 'good'}>
      worst frame {reading.worstFrameMs}ms over {reading.moves} moves
    </Status>
  );
}

/**
 * A source for a driven row, sampled at a **display's** rate and not a
 * renderer's.
 *
 * Ten readings a second is what a host actually hands a control — anything
 * faster is a number nobody can read changing — and it is the rate the wake
 * exists to smooth.
 */
function useSignal(held: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((was) => was + 1), 100);
    return () => window.clearInterval(timer);
  }, []);
  const phase = (tick * 0.04) % 1;
  if (!held) return Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
  const step = Math.sin(Math.floor(phase * 4) * 127.1 + 311.7) * 43758.5453;
  return step - Math.floor(step);
}

function RowFace() {
  const [depth, setDepth] = useState(41);
  const [size, setSize] = useState(62);
  const [reach, setReach] = useState(0.26);
  const [held, setHeld] = useState(false);
  const signal = useSignal(held);
  return (
    <div className="row-face-case">
      <Toggle on={held} onChange={setHeld} name="Source">
        {held ? 'hold' : 'smooth'}
      </Toggle>
      <Device
        name="Ripple"
        className="row-face"
        headerAfterName={<span className="row-face-kind">Shape</span>}
        onHotSwap={() => {}}
        screen={<div className="row-face-preview">live picture</div>}
        chooser={
          <Select items={['One', 'Two']} index={0} onChange={() => {}} label="Target" width={138} />
        }
        outlets={
          <>
            <Port id="row-face:point" side="out" label="Point" kind="note" />
            <Port id="row-face:value" side="out" label="Value" kind="signal" />
          </>
        }
        portRows={
          <>
            <DevicePortRow
              inlet={<Port id="row-face:in" side="in" label="Input" kind="note" showLabel={false} />}
            >
              <span className="row-face-label">Input</span>
            </DevicePortRow>
            <DevicePortRow
              inlet={
                <Port id="row-face:depth" side="in" label="Depth" kind="signal" showLabel={false} />
              }
            >
              <Slider
                param={DRY_WET}
                value={depth}
                onChange={setDepth}
                name="Depth"
                orientation="horizontal"
                layout="inside"
              />
            </DevicePortRow>
            <DevicePortRow
              inlet={
                <Port
                  id="row-face:size"
                  side="in"
                  label="Size"
                  kind="signal"
                  showLabel={false}
                  connected
                />
              }
            >
              <Slider
                param={DRY_WET}
                value={size}
                onChange={setSize}
                depth={reach}
                onDepth={setReach}
                live={signal}
                name="Size"
                orientation="horizontal"
                layout="inside"
              />
            </DevicePortRow>
            <DevicePortRow
              inlet={
                <Port
                  id="row-face:energy"
                  side="in"
                  label="Energy"
                  kind="signal"
                  showLabel={false}
                />
              }
            >
              <Meter value={0.62} name="Energy" layout="inside" showValue />
            </DevicePortRow>
          </>
        }
      />
    </div>
  );
}

/** The still half: where a cord ends, with no canvas needed to look at it. */
export function AnatomyRoom() {
  return (
    <div className="cases">
      <Case note="The opt-in row face: its picture is outside the frame, its chooser and outlet bands stay put, and every inlet dot shares a line with its label, slider or meter. Empty reserved rows keep the frame the same size when its contents change.">
        <RowFace />
      </Case>
      <Case note="A device with ports and no graph around it. The rails draw; nothing measures them and nothing connects, because the surface is what owns both.">
        <Device
          name="Shape"
          on
          onToggle={() => {}}
          inlets={<Port id="loose:in" side="in" label="In" kind="signal" />}
          outlets={<Port id="loose:out" side="out" label="Out" kind="signal" connected />}
        >
          <BareFace />
        </Device>
      </Case>
      <Case note="In a chain, where adjacency is the connection and there is nothing to draw. The same shell, no ports passed, exactly as it was.">
        <Chain>
          <Device name="Shape" on onToggle={() => {}}>
            <BareFace />
          </Device>
        </Chain>
      </Case>
    </div>
  );
}

/** The patch face without an instrument behind it, for the cases that only look. */
function BareFace() {
  const [freq, setFreq] = useState(FREQ.defaultValue);
  const [wet, setWet] = useState(DRY_WET.defaultValue);
  return (
    <Row>
      <Knob param={FREQ} value={freq} onChange={setFreq} />
      <Knob param={DRY_WET} value={wet} onChange={setWet} />
    </Row>
  );
}

const tab = (
  id: string,
  title: string,
  description: string,
  component: Experiment<null>['component'],
): Experiment<null> => ({ id, title, description, component });

export const GRAPH_TABS: readonly Experiment<null>[] = [
  tab(
    'patch',
    'Patch',
    'The canvas with an instrument on it. Everything the graph reports is counted, and so is the half it cannot report — a cord let go over nothing tells the host nothing at all.',
    PatchRoom,
  ),
  tab(
    'trials',
    'Trials',
    'The same canvas with the graph’s own promises listed beside it, ticked off as you make each one happen. Start a round after a change and see whether all eleven still tick.',
    TrialRoom,
  ),
  tab(
    'scale',
    'Scale',
    'Six nodes, or two hundred and forty. The switch for the faceplates is the ablation: it says whether a slow canvas is the graph’s fault or the faces’.',
    ScaleRoom,
  ),
  tab(
    'anatomy',
    'Anatomy',
    'Where a cord ends. The rails a device carries by default, the aligned rows a face opts into, and the same shell in a chain with nothing to draw.',
    AnatomyRoom,
  ),
];
