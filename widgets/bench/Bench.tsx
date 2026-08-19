import { useState, type ReactNode } from 'react';
import { FINE_KEY } from '../src/gesture/platform.js';
import { format } from '../src/param/format.js';
import { enumParam, type Param, type UnitStyle } from '../src/param/param.js';
import { Chain } from '../src/chrome/Chain.js';
import { Device } from '../src/chrome/Device.js';
import { Rack } from '../src/chrome/Rack.js';
import { Row } from '../src/chrome/Row.js';
import { Divider, Label } from '../src/controls/Label.js';
import { Knob } from '../src/controls/Knob.js';
import { NumberField } from '../src/controls/NumberField.js';
import { Segmented } from '../src/controls/Segmented.js';
import { Select } from '../src/controls/Select.js';
import { Slider } from '../src/controls/Slider.js';
import { Toggle } from '../src/controls/Toggle.js';
import { XYPad } from '../src/controls/XYPad.js';

const SECTIONS = [
  'Knob', 'Slider', 'Number field', 'Toggle', 'Segmented', 'Select', 'XY pad', 'Text', 'Row', 'Device',
  'Chain',
  'Model',
];

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

function Section({ id, children }: { id: string; children: ReactNode }) {
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

export function Bench() {
  const [hosted, setHosted] = useState(true);

  return (
    <div className={`bench${hosted ? ' hosted' : ''}`}>
      <header>
        <h1>Widget bench</h1>
        <p>
          Drag any control. Hold <kbd>{FINE_KEY}</kbd> for fine, double-click for the
          parameter&rsquo;s default, arrow keys once focused. No control jumps to the click.
        </p>
        <nav>
          {SECTIONS.map((name) => (
            <a key={name} href={`#${name.toLowerCase().replace(/\s+/g, '-')}`}>{name}</a>
          ))}
          <button type="button" onClick={() => setHosted((on) => !on)}>
            {hosted ? 'host tokens: on' : 'host tokens: off'}
          </button>
        </nav>
      </header>

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
          <Case note="Two parameters on one pointer. Drag anywhere on the plane; the fine modifier and double-click to reset work as they do on a knob, and each axis takes the arrows on its own tab stop.">
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

        <Section id="Model">
          <Model />
        </Section>
      </main>
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
