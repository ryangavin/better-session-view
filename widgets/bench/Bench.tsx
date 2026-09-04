import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FINE_KEY } from '../src/gesture/platform.ts';
import { format } from '../src/param/format.ts';
import { enumParam, type Param, type UnitStyle } from '../src/param/param.ts';
import { Chain } from '../src/chrome/Chain.tsx';
import { Device, DevicePortRow } from '../src/chrome/Device.tsx';
import { Graph, GraphNode, type GraphCord } from '../src/chrome/Graph.tsx';
import { Modal } from '../src/chrome/Modal.tsx';
import { Port } from '../src/chrome/Port.tsx';
import { Rack } from '../src/chrome/Rack.tsx';
import { Row } from '../src/chrome/Row.tsx';
import { Button } from '../src/controls/Button.tsx';
import { Divider, Label } from '../src/controls/Label.tsx';
import { Meter } from '../src/controls/Meter.tsx';
import { Knob } from '../src/controls/Knob.tsx';
import { NumberField } from '../src/controls/NumberField.tsx';
import { Segmented } from '../src/controls/Segmented.tsx';
import { Select } from '../src/controls/Select.tsx';
import { Slider } from '../src/controls/Slider.tsx';
import { Toggle } from '../src/controls/Toggle.tsx';
import { XYPad } from '../src/controls/XYPad.tsx';
import { DebugCase } from './DebugCase.tsx';
import {
  FactsCase,
  HarnessCase,
  LegendCase,
  PlotCase,
  ScopeCase,
  TransportCase,
  WorkspaceCase,
} from './DebugCases.tsx';
import { WaveCases } from './WaveCases.tsx';
import { Rooms, type Room } from '../src/debug/Rooms.tsx';
import { useRemembered } from '../src/debug/useRemembered.ts';

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

/**
 * The bench, grouped.
 *
 * Eighteen tabs in a row stopped being a list and became a thing you had to
 * read before you could read anything else. The grouping is by what you came
 * to look at rather than by what the file tree happens to say: a control you
 * put your hand on, a shape a window is built out of, a drawing over time, and
 * the harness this page is itself made of.
 */
const ROOMS = [
  {
    id: 'controls',
    title: 'Controls',
    note: 'things you put a hand on',
    sections: ['Knob', 'Slider', 'Number field', 'Toggle', 'Button', 'Meter', 'Segmented', 'Select', 'XY pad'],
  },
  { id: 'chrome', title: 'Chrome', note: 'what a window is built out of', sections: ['Text', 'Row', 'Device', 'Chain', 'Graph', 'Modal'] },
  { id: 'drawing', title: 'Drawing', note: 'over a length of time', sections: ['Waveform'] },
  {
    id: 'debug',
    title: 'Debug',
    note: 'the harness this page is',
    sections: ['Harness', 'Scope', 'Plot', 'Facts', 'Legend', 'Transport', 'Workspace', 'Together', 'Model'],
  },
];

const SECTIONS = ROOMS.flatMap((room) => room.sections);

/** One widget's own value, so every example on the page is genuinely live. */
function Held({
  param,
  children,
}: {
  param: Param;
  children: (value: number, onChange: (next: number) => void) => ReactNode;
}) {
  const [value, setValue] = useState(param.defaultValue);
  return <>{children(value, setValue)}</>;
}

function Case({ note, wide, children }: { note: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`case${wide ? ' wide' : ''}`}>
      <div className="case-stage">{children}</div>
      <p className="case-note">{note}</p>
    </div>
  );
}

/** Something for the plane to draw over, standing in for a device's own curve. */
function PadGrid() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {[25, 50, 75].map((at) => (
        <line key={`v${at}`} x1={at} y1="0" x2={at} y2="100" stroke="#2c2c31" strokeWidth="0.4" />
      ))}
      {[25, 50, 75].map((at) => (
        <line key={`h${at}`} x1="0" y1={at} x2="100" y2={at} stroke="#2c2c31" strokeWidth="0.4" />
      ))}
    </svg>
  );
}

/**
 * Which section is being shown, read by the sections themselves.
 *
 * Through a context rather than by splitting the file, because every case below
 * is written as a sibling of every other and cutting four hundred lines into
 * seventeen components to change which one is visible would be a large edit to
 * make a small point. A section asks whether it is the one wanted and returns
 * nothing when it is not.
 */
const Showing = createContext('');

function Section({ id, children }: { id: string; children: ReactNode }) {
  if (useContext(Showing) !== id) return null;
  return (
    <section id={id.toLowerCase().replace(/\s+/g, '-')}>
      <h2>{id}</h2>
      <div className="cases">{children}</div>
    </section>
  );
}

const DRY_WET: Param = {
  kind: 'float', min: 0, max: 100, defaultValue: 50, unit: 'percent', shortName: 'Dry/Wet',
};
const PAN: Param = {
  kind: 'float', min: -1, max: 1, defaultValue: 0, unit: 'pan', shortName: 'Pan',
};
const FREQ: Param = {
  kind: 'float', min: 20, max: 20000, defaultValue: 440, unit: 'hertz',
  exponent: 3, shortName: 'Freq',
};
const VOICES: Param = {
  kind: 'int', min: 1, max: 16, defaultValue: 8, unit: 'int', shortName: 'Voices',
};
const TIME: Param = {
  kind: 'float', min: 1, max: 5000, defaultValue: 250, unit: 'time', shortName: 'Time',
};
const GAIN: Param = {
  kind: 'float', min: -70, max: 6, defaultValue: 0, unit: 'decibel', shortName: 'Gain',
};
const NOTE: Param = {
  kind: 'int', min: 0, max: 127, defaultValue: 60, unit: 'midi', shortName: 'Root',
};
const CROSSFADE: Param = {
  kind: 'float', min: -1, max: 1, defaultValue: 0, unit: 'float', shortName: 'Crossfade',
};
const STEPPED: Param = {
  kind: 'float', min: 0, max: 64, defaultValue: 0, steps: 4, shortName: 'Steps',
};
const SHAPE = enumParam(['Sine', 'Square', 'Saw', 'Noise'], { defaultIndex: 0, name: 'Shape' });
const FILTER = enumParam(['LP', 'BP', 'HP', 'Notch'], { defaultIndex: 0, name: 'Filter' });

const UNITS: UnitStyle[] = [
  'native', 'int', 'float', 'time', 'hertz', 'decibel',
  'percent', 'pan', 'semitones', 'midi', 'custom',
];

/** A faceplate worth putting in a shell: real controls, each with its own value. */
function Faceplate() {
  return (
    <Row>
      <Held param={FREQ}>{(v, set) => <Knob param={FREQ} value={v} onChange={set} />}</Held>
      <Held param={DRY_WET}>{(v, set) => <Knob param={DRY_WET} value={v} onChange={set} />}</Held>
      <Held param={GAIN}>
        {(v, set) => <Slider param={GAIN} value={v} onChange={set} />}
      </Held>
    </Row>
  );
}

/** The same controls twice: left to themselves, then given a rhythm. */
function Mixed({ ruled }: { ruled?: boolean }) {
  const controls = (
    <>
      <Held param={FREQ}>{(v, set) => <Knob param={FREQ} value={v} onChange={set} />}</Held>
      <Held param={GAIN}>
        {(v, set) => <Slider param={GAIN} value={v} onChange={set} />}
      </Held>
      <Held param={TIME}>{(v, set) => <NumberField param={TIME} value={v} onChange={set} />}</Held>
      <Held param={FILTER}>
        {(v, set) => (
          <Segmented items={FILTER.items ?? []} index={Math.round(v)} onChange={set} name="Filter" />
        )}
      </Held>
    </>
  );
  return ruled ? <Row>{controls}</Row> : <div className="loose">{controls}</div>;
}

function Shell({
  name = 'Auto Filter',
  active = true,
  collapsed = false,
  selected = false,
  swappable = false,
  onSelect,
}: {
  name?: string;
  active?: boolean;
  collapsed?: boolean;
  selected?: boolean;
  swappable?: boolean;
  onSelect?(): void;
}) {
  const [on, setOn] = useState(active);
  const [folded, setFolded] = useState(collapsed);
  return (
    <Device
      name={name}
      on={on}
      onToggle={setOn}
      folded={folded}
      onFold={setFolded}
      selected={selected}
      onSelect={onSelect ?? (() => {})}
      onHotSwap={swappable ? () => {} : undefined}
    >
      <Faceplate />
    </Device>
  );
}

/** Three of them, because a chain is the thing we're actually building. */
function Run({ dropAt }: { dropAt?: number }) {
  const [at, setAt] = useState(1);
  const names = ['EQ Eight', 'Auto Filter', 'Saturator'];
  return (
    <Chain dropAt={dropAt}>
      {names.map((name, i) => (
        <Shell
          key={name}
          name={name}
          collapsed={i === 0}
          selected={i === at}
          swappable={i === 1}
          onSelect={() => setAt(i)}
        />
      ))}
    </Chain>
  );
}

const MACROS = ['Macro 1', 'Macro 2', 'Macro 3', 'Macro 4'];

/** A rack in a chain, holding chains of its own. The recursion is the point. */
function Grouped() {
  const [at, setAt] = useState(1);
  const [on, setOn] = useState(true);
  const [folded, setFolded] = useState(false);
  const [device, setDevice] = useState(0);

  return (
    <Chain>
      <Shell name="EQ Eight" collapsed />
      <Rack
        name="Audio Effect Rack"
        on={on}
        onToggle={setOn}
        folded={folded}
        onFold={setFolded}
        selected
        onSelect={() => {}}
        chains={['Dry', 'Delay', 'Reverb']}
        chainAt={at}
        onChain={setAt}
        macros={MACROS.map((name) => (
          <Held key={name} param={DRY_WET}>
            {(v, set) => (
              <Knob param={DRY_WET} value={v} onChange={set} name={name} />
            )}
          </Held>
        ))}
      >
        <Chain placeholder="Drop an audio effect here">
          {at === 0
            ? []
            : ['Delay', 'Reverb']
                .slice(at - 1, at)
                .map((name) => (
                  <Shell
                    key={name}
                    name={name}
                    selected={device === 0}
                    onSelect={() => setDevice(0)}
                  />
                ))}
        </Chain>
      </Rack>
      <Shell name="Saturator" />
    </Chain>
  );
}

/** Small enough that three of them fit on a canvas without scrolling. */
function PatchFace() {
  return (
    <Row>
      <Held param={FREQ}>{(v, set) => <Knob param={FREQ} value={v} onChange={set} />}</Held>
      <Held param={DRY_WET}>{(v, set) => <Knob param={DRY_WET} value={v} onChange={set} />}</Held>
    </Row>
  );
}

/**
 * Two kinds, so the host has something to refuse a cord for.
 *
 * The names are deliberately no device in particular: this module has no list
 * of kinds and no opinion about what a port carries, and a bench case naming a
 * real one would be the first place that stopped being true.
 */
const PATCH = [
  {
    id: 'source',
    name: 'Source',
    x: 16,
    y: 28,
    inlets: [],
    outlets: [
      { id: 'source:notes', label: 'Notes', kind: 'note' },
      { id: 'source:level', label: 'Level', kind: 'signal' },
    ],
  },
  {
    id: 'shape',
    name: 'Shape',
    x: 236,
    y: 16,
    inlets: [
      { id: 'shape:pitch', label: 'Pitch', kind: 'note' },
      { id: 'shape:size', label: 'Size', kind: 'signal' },
    ],
    outlets: [{ id: 'shape:out', label: 'Out', kind: 'signal' }],
  },
  {
    id: 'output',
    name: 'Output',
    x: 456,
    y: 44,
    inlets: [{ id: 'output:in', label: 'In', kind: 'signal' }],
    outlets: [],
  },
] as const;

const PORTS = PATCH.flatMap((node) => [...node.inlets, ...node.outlets]);

/**
 * The canvas, doing the whole bargain: the graph emits a pair of ids, and this
 * host decides whether the kinds agree and whether the inlet was already taken.
 * Refuse one and watch nothing happen.
 *
 * Note there is nothing here about which end was dragged. The graph hands back
 * the outlet first whichever way round the cord was pulled, so `carries` and
 * `takes` are always the right way round and the one-cord-per-inlet rule below
 * still keys off `to`.
 */
function Patch() {
  const [at, setAt] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(PATCH.map((node) => [node.id, { x: node.x, y: node.y }])),
  );
  const [cords, setCords] = useState<GraphCord[]>([
    { from: 'source:notes', to: 'shape:pitch', kind: 'note' },
    { from: 'shape:out', to: 'output:in', kind: 'signal' },
  ]);
  const [picked, setPicked] = useState<string | null>('shape');
  const [said, setSaid] = useState('two cords, both landed');

  const connect = (from: string, to: string) => {
    const carries = PORTS.find((port) => port.id === from)?.kind;
    const takes = PORTS.find((port) => port.id === to)?.kind;
    if (carries !== takes) {
      setSaid(`refused: ${from} carries ${carries}, ${to} takes ${takes}`);
      return;
    }
    setSaid(`${from} to ${to}`);
    // One cord per inlet, which is this host's rule and not the graph's.
    setCords((held) => [...held.filter((cord) => cord.to !== to), { from, to, kind: carries }]);
  };

  return (
    <div className="patch-case">
      <Graph
        className="patch"
        cords={cords}
        onConnect={connect}
        onMove={(id, x, y) => setAt((held) => ({ ...held, [id]: { x, y } }))}
        onClearSelection={() => setPicked(null)}
      >
        {PATCH.map((node) => (
          <GraphNode key={node.id} id={node.id} x={at[node.id].x} y={at[node.id].y}>
            <Device
              name={node.name}
              on
              onToggle={() => {}}
              selected={picked === node.id}
              onSelect={() => setPicked(node.id)}
              inlets={node.inlets.map((port) => (
                <Port
                  key={port.id}
                  id={port.id}
                  side="in"
                  label={port.label}
                  kind={port.kind}
                  connected={cords.some((cord) => cord.to === port.id)}
                />
              ))}
              outlets={node.outlets.map((port) => (
                <Port
                  key={port.id}
                  id={port.id}
                  side="out"
                  label={port.label}
                  kind={port.kind}
                  connected={cords.some((cord) => cord.from === port.id)}
                />
              ))}
            >
              <PatchFace />
            </Device>
          </GraphNode>
        ))}
      </Graph>
      <p className="patch-out">{said}</p>
    </div>
  );
}

/**
 * A source for a driven row, sampled at a **display's** rate and not a
 * renderer's.
 *
 * Ten readings a second is what a host actually hands a control — anything
 * faster is a number nobody can read changing — and it is the rate the wake
 * exists to smooth. Held, it is the case that decides the drawing: three
 * delayed samples of a sample-and-hold sit at three unrelated values, and a
 * cascade of lags turns the same step into a streak that collapses.
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
        <Select
          items={['One', 'Two']}
          index={0}
          onChange={() => {}}
          label="Target"
          width={138}
        />
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
            inlet={
              <Port id="row-face:in" side="in" label="Input" kind="note" showLabel={false} />
            }
          >
            <span className="row-face-label">Input</span>
          </DevicePortRow>
          <DevicePortRow
            inlet={
              <Port
                id="row-face:depth"
                side="in"
                label="Depth"
                kind="signal"
                showLabel={false}
              />
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

/**
 * The point of the page: change the model, not the widget, and watch every
 * control that reads it change with it.
 */
function Model() {
  const [unit, setUnit] = useState<UnitStyle>('percent');
  const [exponent, setExponent] = useState(1);
  const [steps, setSteps] = useState(0);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(100);
  const [value, setValue] = useState(50);

  const param: Param = {
    kind: 'float',
    min,
    max,
    defaultValue: (min + max) / 2,
    unit,
    customUnit: 'Bogons',
    exponent,
    steps: steps >= 2 ? steps : undefined,
    shortName: 'Model',
  };

  const numeric = (
    label: string, held: number, set: (n: number) => void, step: number, low: number, high: number,
  ) => (
    <label className="model-field">
      <span>{label}</span>
      <input
        type="number"
        value={held}
        step={step}
        min={low}
        max={high}
        onChange={(e) => set(Number(e.currentTarget.value))}
      />
    </label>
  );

  return (
    <div className="model">
      <div className="model-inputs">
        <label className="model-field">
          <span>unit</span>
          <select value={unit} onChange={(e) => setUnit(e.currentTarget.value as UnitStyle)}>
            {UNITS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        {numeric('min', min, setMin, 1, -100000, 100000)}
        {numeric('max', max, setMax, 1, -100000, 100000)}
        {numeric('exponent', exponent, setExponent, 0.5, 0.1, 8)}
        {numeric('steps', steps, setSteps, 1, 0, 64)}
      </div>
      <div className="model-stage">
        <Knob param={param} value={value} onChange={setValue} />
        <Slider param={param} value={value} onChange={setValue} orientation="horizontal" length={140} />
        <NumberField param={param} value={value} onChange={setValue} width={72} />
      </div>
      <dl className="model-out">
        <dt>raw</dt>
        <dd>{value}</dd>
        <dt>format</dt>
        <dd>{format(param, value)}</dd>
      </dl>
    </div>
  );
}

/** Every case the bench has, with one section of them showing. */
function Cases({ only }: { only: string }) {
  return (
    <Showing.Provider value={only}>
      <main>

        <Section id="Knob">
          <Case note="Unipolar. The arc grows from the left, like Live's Dry/Wet.">
            <Held param={DRY_WET}>{(v, set) => <Knob param={DRY_WET} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Bipolar. A range straddling zero fills from the middle by default.">
            <Held param={PAN}>{(v, set) => <Knob param={PAN} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Exponent 3. Half a turn reaches 2.5 kHz, not 10 kHz.">
            <Held param={FREQ}>{(v, set) => <Knob param={FREQ} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="An int parameter. One arrow press is one voice.">
            <Held param={VOICES}>{(v, set) => <Knob param={VOICES} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Four steps across the range — Max's own worked example.">
            <Held param={STEPPED}>{(v, set) => <Knob param={STEPPED} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Disabled, as when Live reports is_enabled = 0.">
            <Held param={DRY_WET}>
              {(v, set) => <Knob param={DRY_WET} value={v} onChange={set} disabled />}
            </Held>
          </Case>
          <Case note="Laid inline: caption, control and reading on one line, for an inspector rather than a faceplate.">
            <Held param={FREQ}>
              {(v, set) => <Knob param={FREQ} value={v} onChange={set} layout="inline" />}
            </Held>
          </Case>
        </Section>

        <Section id="Slider">
          <Case note="Vertical. The same hook as the knob, laid out straight.">
            <Held param={GAIN}>{(v, set) => <Slider param={GAIN} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Horizontal. The rarer choice — a value box usually reads better in a row.">
            <Held param={DRY_WET}>
              {(v, set) => (
                <Slider param={DRY_WET} value={v} onChange={set} orientation="horizontal" length={120} />
              )}
            </Held>
          </Case>
          <Case note="Bipolar and horizontal at once: Live's crossfader, and why the orientation is here.">
            <Held param={CROSSFADE}>
              {(v, set) => (
                <Slider param={CROSSFADE} value={v} onChange={set} orientation="horizontal" length={120} />
              )}
            </Held>
          </Case>
          <Case
            wide
            note="Orientation and layout are two questions. The track runs across; the caption and the reading sit beside it rather than above and below."
          >
            <Held param={GAIN}>
              {(v, set) => (
                <Slider
                  param={GAIN}
                  value={v}
                  onChange={set}
                  orientation="horizontal"
                  layout="inline"
                  length={120}
                />
              )}
            </Held>
          </Case>
        </Section>

        <Section id="Number field">
          <Case note="Drag to change. Type a digit or press Enter to edit.">
            <Held param={TIME}>{(v, set) => <NumberField param={TIME} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Decibels keep their tenth.">
            <Held param={GAIN}>{(v, set) => <NumberField param={GAIN} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="A pan collapsed to a value box. Zero is the middle, so the fill has two sides.">
            <Held param={PAN}>{(v, set) => <NumberField param={PAN} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="A MIDI note, named as Live names it. No fill: a note isn't a proportion.">
            <Held param={NOTE}>
              {(v, set) => <NumberField param={NOTE} value={v} onChange={set} showFill={false} />}
            </Held>
          </Case>
          <Case note="Display text supplied by the host wins over ours.">
            <Held param={GAIN}>
              {(v, set) => (
                <NumberField param={GAIN} value={v} onChange={set} display={`${v.toFixed(0)} units`} />
              )}
            </Held>
          </Case>
          <Case note="Disabled.">
            <Held param={TIME}>
              {(v, set) => <NumberField param={TIME} value={v} onChange={set} disabled />}
            </Held>
          </Case>
        </Section>

        <Section id="Toggle">
          <Case note="A switch. Live's device activator is one of these.">
            <Switch />
          </Case>
          <Case note="Momentary — springs back on release.">
            <Switch momentary />
          </Case>
          <Case note="Disabled.">
            <Switch disabled />
          </Case>
        </Section>

        <Section id="Button">
          <Case note="An action, not a parameter. Nothing is left behind when you let go.">
            <Button onPress={() => {}}>Add node</Button>
          </Case>
          <Case note="Quiet: furniture on a canvas, where a box on every control would read as a form.">
            <Button tone="quiet" onPress={() => {}} label="Unwire">
              ×
            </Button>
          </Case>
          <Case note="Danger. Ordinary until you are on it, then it says so.">
            <Button tone="danger" onPress={() => {}}>
              Delete
            </Button>
          </Case>
          <Case note="Disabled, and with a caption so it lines up in a Row.">
            <Button name="Roll" disabled onPress={() => {}}>
              Roll
            </Button>
          </Case>
        </Section>

        <Section id="Meter">
          <Case note="A level, read-only. Not a disabled slider — it never invited you.">
            <Meter value={0.62} name="Out" />
          </Case>
          <Case note="With a hold, drawn as a line: where it is now, and how far it has been.">
            <Meter value={0.45} peak={0.83} name="Peak" />
          </Case>
          <Case note="Vertical, which is the mixer's shape.">
            <Meter value={0.7} peak={0.9} orientation="vertical" length={60} name="L" />
          </Case>
        </Section>

        <Section id="Segmented">
          <Case note="An enum with every member on screen, like Live's filter type.">
            <Held param={FILTER}>
              {(v, set) => (
                <Segmented
                  items={FILTER.items ?? []}
                  index={Math.round(v)}
                  onChange={set}
                  name="Filter"
                />
              )}
            </Held>
          </Case>
          <Case note="Vertical, for a narrow column.">
            <Held param={SHAPE}>
              {(v, set) => (
                <Segmented
                  items={SHAPE.items ?? []}
                  index={Math.round(v)}
                  onChange={set}
                  name="Shape"
                  orientation="vertical"
                />
              )}
            </Held>
          </Case>
          <Case note="Disabled.">
            <Held param={FILTER}>
              {(v, set) => (
                <Segmented items={FILTER.items ?? []} index={Math.round(v)} onChange={set} disabled />
              )}
            </Held>
          </Case>
        </Section>

        <Section id="Select">
          <Case note="A compact enum for a panel that cannot show every member at once.">
            <Held param={FILTER}>
              {(v, set) => (
                <Select
                  items={FILTER.items ?? []}
                  index={Math.round(v)}
                  onChange={set}
                  name="Filter"
                />
              )}
            </Held>
          </Case>
          <Case note="Disabled.">
            <Select
              items={FILTER.items ?? []}
              index={0}
              onChange={() => {}}
              name="Filter"
              disabled
            />
          </Case>
        </Section>

        <Section id="XY pad">
          <Case note="Two parameters on one pointer. Press anywhere and the handle comes to you, then stays with the pointer — a plane is the one control that doesn't grab where its value already is. The fine modifier and double-click to reset work as they do on a knob, and each axis takes the arrows on its own tab stop.">
            <Held param={FREQ}>
              {(hz, setHz) => (
                <Held param={GAIN}>
                  {(db, setDb) => (
                    <XYPad
                      x={{ param: FREQ, value: hz, onChange: setHz }}
                      y={{ param: GAIN, value: db, onChange: setDb }}
                      label="Frequency and gain"
                    />
                  )}
                </Held>
              )}
            </Held>
          </Case>
          <Case
            wide
            note="Wider than it is tall, with artwork behind it — the slot a device's response curve goes in. The plane owns the geometry and the gesture and knows nothing about what's drawn under it."
          >
            <Held param={FREQ}>
              {(hz, setHz) => (
                <Held param={GAIN}>
                  {(db, setDb) => (
                    <XYPad
                      x={{ param: FREQ, value: hz, onChange: setHz }}
                      y={{ param: GAIN, value: db, onChange: setDb }}
                      width={260}
                      height={110}
                      label="Frequency and gain over a grid"
                    >
                      <PadGrid />
                    </XYPad>
                  )}
                </Held>
              )}
            </Held>
          </Case>
          <Case note="A tapered axis reads as position: the frequency's exponent puts a third of the plane under the first 200 Hz, exactly as it puts a third of a knob's travel there.">
            <Held param={FREQ}>
              {(hz, setHz) => (
                <Held param={PAN}>
                  {(pan, setPan) => (
                    <XYPad
                      x={{ param: FREQ, value: hz, onChange: setHz }}
                      y={{ param: PAN, value: pan, onChange: setPan }}
                      label="Frequency and pan"
                    />
                  )}
                </Held>
              )}
            </Held>
          </Case>
          <Case note="Disabled.">
            <XYPad
              x={{ param: FREQ, value: 440, onChange: () => {} }}
              y={{ param: GAIN, value: 0, onChange: () => {} }}
              label="Frequency and gain"
              disabled
            />
          </Case>
        </Section>

        <Section id="Text">
          <Case note="A section heading and a control label.">
            <div className="stack">
              <Label heading>Oscillator</Label>
              <Label>Coarse</Label>
            </div>
          </Case>
          <Case note="A rule between sections.">
            <div className="stack wide">
              <Label heading>Filter</Label>
              <Divider />
              <Label heading>Envelope</Label>
            </div>
          </Case>
        </Section>

        <Section id="Row">
          <Case wide note="Left to themselves: four controls, four different heights, nothing on a line.">
            <Mixed />
          </Case>
          <Case
            wide
            note="The same four in a row. Captions at one height, readings at another, whatever is between them — the value box has no reading to place, so it sits in the control band."
          >
            <Mixed ruled />
          </Case>
          <Case
            wide
            note="An inline widget in a row takes the whole height rather than one of the three bands, so it lines up with the stacked ones on the middle instead of arguing with them."
          >
            <Row>
              <Held param={FREQ}>{(v, set) => <Knob param={FREQ} value={v} onChange={set} />}</Held>
              <Held param={GAIN}>
                {(v, set) => (
                  <Slider
                    param={GAIN}
                    value={v}
                    onChange={set}
                    orientation="horizontal"
                    layout="inline"
                    length={100}
                  />
                )}
              </Held>
              <Held param={DRY_WET}>
                {(v, set) => (
                  <Knob param={DRY_WET} value={v} onChange={set} layout="inline" />
                )}
              </Held>
            </Row>
          </Case>
        </Section>

        <Section id="Device">
          <Case note="The shell: activator, fold triangle, name, and a faceplate under it.">
            <Shell />
          </Case>
          <Case note="Deactivated. The faceplate dims; every control on it still works.">
            <Shell active={false} />
          </Case>
          <Case note="Folded, the way a long chain stays readable — name on end, body gone.">
            <Shell collapsed />
          </Case>
          <Case note="Selected, and with presets: the hot-swap button appears only if a host can serve it.">
            <Shell selected swappable />
          </Case>
        </Section>

        <Section id="Chain">
          <Case
            wide
            note="The run itself. Click a title bar to move the selection; fold the first one back open."
          >
            <Run />
          </Case>
          <Case wide note="Mid-drag: the strip marks where a device would land. Whoever is dragging decides whether it may.">
            <Run dropAt={2} />
          </Case>
          <Case note="Empty, which is most of what a new track's chain looks like.">
            <Chain placeholder="Drop an audio effect here" />
          </Case>
          <Case
            wide
            note="A one-switch faceplate. In a chain a device is never narrower than it is tall, so it stops at square rather than collapsing to a sliver — Live's rule, and what keeps a run readable."
          >
            <Chain>
              <Device name="Gate" on onToggle={() => {}}>
                <Row>
                  <Switch />
                </Row>
              </Device>
              <Shell name="Auto Filter" />
            </Chain>
          </Case>
          <Case note="The same device on its own. No chain, no floor — it's the width of its faceplate, which is what a node on a canvas will want.">
            <Device name="Gate" on onToggle={() => {}}>
              <Row>
                <Switch />
              </Row>
            </Device>
          </Case>
          <Case
            wide
            note="A rack: bookends around the selected chain's devices, not a box holding them. Delay inside the rack is exactly as tall as Saturator beside it. Pick a chain to see its devices — Dry has none."
          >
            <Grouped />
          </Case>
        </Section>

        <Section id="Graph">
          <Case note="The opt-in row face: its picture is outside the frame, its chooser and outlet bands stay put, and every inlet dot shares a line with its label, slider or meter. Empty reserved rows keep the frame the same size when its contents change.">
            <RowFace />
          </Case>
          <Case
            wide
            note="The canvas the chain leaves room for. Drag a node by anywhere a control hasn't claimed, drag between two ports to connect, scroll to zoom about the cursor, drag the background to pan. A cord pulls from either end — start on Output's In and drop on Shape's Out and you get the same cord as the other way round; the ports that could take it outline themselves while it is out, and the ones on the wrong side dim. Notes only reach Pitch and signals only reach Size: the graph offers the pair, this page refuses it."
          >
            <Patch />
          </Case>
          <Case
            wide
            note="The same connection without a pointer, and from either end too: tab to a port, press Enter to arm it, tab to one on the other side and press Enter again. Arming an inlet marks the outlets exactly as arming an outlet marks the inlets. Escape drops the cord. Arrow keys move a node once its title bar has focus, so a patch needs no tab stop of its own."
          >
            <Patch />
          </Case>
          <Case note="A device with ports and no graph around it. The rails draw; nothing measures them and nothing connects, because the surface is what owns both.">
            <Device
              name="Shape"
              on
              onToggle={() => {}}
              inlets={<Port id="loose:in" side="in" label="In" kind="signal" />}
              outlets={<Port id="loose:out" side="out" label="Out" kind="signal" connected />}
            >
              <PatchFace />
            </Device>
          </Case>
          <Case note="In a chain, where adjacency is the connection and there is nothing to draw. The same shell, no ports passed, exactly as it was.">
            <Chain>
              <Shell name="Shape" />
            </Chain>
          </Case>
        </Section>

        <Section id="Waveform">
          <WaveCases />
        </Section>

        <Section id="Modal">
          <Case note="Ask it, and it is over everything: a native dialog, so it sits in the top layer whatever it opened over, focus is trapped inside it and returns to the button afterwards, escape and the scrim both close it. The × is always there because those two ways out are invisible; the row along the bottom is only for what the modal is for, so there is no Cancel saying what the × already says.">
            <Asking />
          </Case>
        </Section>

        <Section id="Harness"><HarnessCase /></Section>
        <Section id="Scope"><ScopeCase /></Section>
        <Section id="Plot"><PlotCase /></Section>
        <Section id="Facts"><FactsCase /></Section>
        <Section id="Legend"><LegendCase /></Section>
        <Section id="Transport"><TransportCase /></Section>
        <Section id="Workspace"><WorkspaceCase /></Section>

        <Section id="Together">
          <Case
            wide
            note="All of them at once, which is the point of the module and the thing a page of parts stops showing. A made-up signal, beats every half second, a head on the wall clock. Click the time row to seek, drag it to pan, shift-drag for a loop, alt-drag or drag the head to scrub; scroll pans and shift-scroll zooms about the pointer. Everything is drawn in palette inks read off the page, so it follows the host-tokens switch."
          >
            <DebugCase />
          </Case>
        </Section>

        <Section id="Model">
          <Model />
        </Section>
      </main>
    </Showing.Provider>
  );
}

export function Bench() {
  const [hosted, setHosted] = useState(true);
  const [room, setRoom] = useRemembered('bench-room', ROOMS[0].id);
  const [tab, setTab] = useRemembered('bench-tab', slug(SECTIONS[0]));

  // The bench is the harness rather than a thing behind a button in one: this
  // module owns `Rooms` and `Workspace`, and the surest way to know a widget
  // holds up is to have built the page you are reading it on out of it.
  const rooms = useMemo<readonly Room<null>[]>(
    () =>
      ROOMS.map((one) => ({
        id: one.id,
        title: one.title,
        note: one.note,
        experiments: one.sections.map((name) => ({
          id: slug(name),
          title: name,
          description: '',
          component: () => <Cases only={name} />,
        })),
      })),
    [],
  );

  return (
    <div className={`bench${hosted ? ' hosted' : ''}`}>
      <Rooms
        rooms={rooms}
        context={null}
        room={room}
        tab={tab}
        onRoom={setRoom}
        onTab={setTab}
        aside={
          <div className="bench-aside">
            <h1>Widget bench</h1>
            <p>
              Drag any control. Hold <kbd>{FINE_KEY}</kbd> for fine, double-click for the
              parameter&rsquo;s default, arrow keys once focused.
            </p>
            <button type="button" onClick={() => setHosted((on) => !on)}>
              {hosted ? 'host tokens: on' : 'host tokens: off'}
            </button>
          </div>
        }
      />
    </div>
  );
}


/** Mounted while the question is being asked, and unmounted once it is answered. */
function Asking() {
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState('nothing yet');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button onPress={() => setAsking(true)}>Delete take</Button>
      <span className="case-note" style={{ margin: 0 }}>{answer}</span>
      {asking && (
        <Modal
          title="delete take"
          onClose={() => setAsking(false)}
          actions={
            <Button
              tone="danger"
              onPress={() => {
                setAnswer('deleted');
                setAsking(false);
              }}
            >
              Delete
            </Button>
          }
        >
          <p style={{ margin: 0, fontSize: 'var(--text-lead)', lineHeight: 1.7 }}>
            Take 4 is nine bars long and has never been played back. Deleting it removes the
            audio from the disk as well as the row from the list.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Switch({ momentary, disabled }: { momentary?: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <Toggle on={on} onChange={setOn} momentary={momentary} disabled={disabled} name="Active">
      {on ? 'On' : 'Off'}
    </Toggle>
  );
}
