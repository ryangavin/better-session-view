import { useState, type ReactNode } from 'react';
import { FINE_KEY } from '../src/gesture/platform.js';
import { format } from '../src/param/format.js';
import { enumParam, type Param, type UnitStyle } from '../src/param/param.js';
import { Divider, Label } from '../src/controls/Label.js';
import { Knob } from '../src/controls/Knob.js';
import { NumberField } from '../src/controls/NumberField.js';
import { Segmented } from '../src/controls/Segmented.js';
import { Slider } from '../src/controls/Slider.js';
import { Toggle } from '../src/controls/Toggle.js';

const SECTIONS = ['Knob', 'Slider', 'Number field', 'Toggle', 'Segmented', 'Text', 'Model'];

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

function Case({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="case">
      <div className="case-stage">{children}</div>
      <p className="case-note">{note}</p>
    </div>
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
const STEPPED: Param = {
  kind: 'float', min: 0, max: 64, defaultValue: 0, steps: 4, shortName: 'Steps',
};
const SHAPE = enumParam(['Sine', 'Square', 'Saw', 'Noise'], { defaultIndex: 0, name: 'Shape' });
const FILTER = enumParam(['LP', 'BP', 'HP', 'Notch'], { defaultIndex: 0, name: 'Filter' });

const UNITS: UnitStyle[] = [
  'native', 'int', 'float', 'time', 'hertz', 'decibel',
  'percent', 'pan', 'semitones', 'midi', 'custom',
];

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
        </Section>

        <Section id="Slider">
          <Case note="Vertical. The same hook as the knob, laid out straight.">
            <Held param={GAIN}>{(v, set) => <Slider param={GAIN} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Horizontal.">
            <Held param={DRY_WET}>
              {(v, set) => (
                <Slider param={DRY_WET} value={v} onChange={set} orientation="horizontal" length={120} />
              )}
            </Held>
          </Case>
          <Case note="Bipolar, on the same widget.">
            <Held param={PAN}>
              {(v, set) => (
                <Slider param={PAN} value={v} onChange={set} orientation="horizontal" length={120} />
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
          <Case note="A MIDI note number, named the way Live names it.">
            <Held param={NOTE}>{(v, set) => <NumberField param={NOTE} value={v} onChange={set} />}</Held>
          </Case>
          <Case note="Display text supplied by the host wins over ours.">
            <Held param={GAIN}>
              {(v, set) => (
                <NumberField param={GAIN} value={v} onChange={set} display={`${v.toFixed(0)} units`} />
              )}
            </Held>
          </Case>
          <Case note="No fill, for a field that isn't a proportion.">
            <Held param={NOTE}>
              {(v, set) => <NumberField param={NOTE} value={v} onChange={set} showFill={false} />}
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
