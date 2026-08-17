import { useState, type ReactNode } from 'react';
import { Device } from '../src/chrome/Device.js';
import { Panel, PanelColumn } from '../src/chrome/Panel.js';
import { Knob } from '../src/controls/Knob.js';
import { NumberField } from '../src/controls/NumberField.js';
import { Toggle } from '../src/controls/Toggle.js';
import type { Param } from '../src/param/param.js';
import './eq-eight.css';

const FREQUENCY: Param = {
  kind: 'float', min: 20, max: 20000, defaultValue: 167, exponent: 3, shortName: 'Freq',
};
const GAIN: Param = {
  kind: 'float', min: -15, max: 15, defaultValue: 0, shortName: 'Gain',
};
const Q: Param = {
  kind: 'float', min: 0.1, max: 18, defaultValue: 0.71, exponent: 2, shortName: 'Q',
};
const REFRESH: Param = {
  kind: 'float', min: 1, max: 60, defaultValue: 60, shortName: 'Refresh',
};
const AVERAGE: Param = {
  kind: 'float', min: 0, max: 10, defaultValue: 1, shortName: 'Avg',
};

const INITIAL_FREQUENCIES = [167, 200, 1290, 2610, 100, 10000, 5000, 18000];
const INITIAL_GAINS = [0, 0, -7.81, 3.6, 0, 0, 0, 0];
const INITIAL_QS = [1.37, 0.71, 0.93, 0.71, 0.71, 0.71, 0.71, 0.71];
const INITIAL_FILTERS = [0, 2, 2, 3, 2, 2, 2, 1];

function replaceAt(values: number[], at: number, next: number) {
  return values.map((value, index) => (index === at ? next : value));
}

function frequencyText(value: number) {
  if (value < 1000) return `${Math.round(value)} Hz`;
  const decimals = value >= 10000 ? 1 : 2;
  return `${(value / 1000).toFixed(decimals)} kHz`;
}

function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button type="button" className="eq-eight-icon" aria-label={label}>
      {children}
    </button>
  );
}

function DownIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 2v6M3.5 5.8 6 8.3l2.5-2.5M3 10h6" />
    </svg>
  );
}

function FilterShape({ shape }: { shape: number }) {
  const paths = [
    'M1 9V5.5C1 3.6 2.2 2.4 4.2 2.4H11',
    'M1 9H3.1C4.3 9 5 7.5 5.8 5.6 6.6 3.7 7.4 2.2 8.7 2.2H11',
    'M1 6 3.7 2.5h4.1L11 6 7.8 9.5H3.7Z',
    'M1 6h3l2-3.4L8 6h3',
  ];
  return <path d={paths[shape % paths.length]} />;
}

function FilterMenu({ shape, onChange }: { shape: number; onChange(next: number): void }) {
  return (
    <button
      type="button"
      className="eq-eight-filter"
      aria-label="Filter type"
      onClick={() => onChange((shape + 1) % 4)}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true"><FilterShape shape={shape} /></svg>
      <span aria-hidden="true" />
    </button>
  );
}

function MenuField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button type="button" className="eq-eight-menu" aria-label={label}>
      <span>{children}</span><i aria-hidden="true" />
    </button>
  );
}

/** A composed stock-device face kept in the bench, never in the reusable library. */
export function EQEight() {
  const [deviceOn, setDeviceOn] = useState(true);
  const [frequencies, setFrequencies] = useState(INITIAL_FREQUENCIES);
  const [gains, setGains] = useState(INITIAL_GAINS);
  const [qs, setQs] = useState(INITIAL_QS);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [bands, setBands] = useState([true, true, true, true, false, false, false, false]);
  const [refresh, setRefresh] = useState(60);
  const [average, setAverage] = useState(1);
  const [adaptive, setAdaptive] = useState(true);

  return (
    <Device
      name="EQ Eight"
      className="eq-eight-device"
      on={deviceOn}
      onToggle={setDeviceOn}
      headerStart={<IconButton label="Load preset"><DownIcon /></IconButton>}
      headerAfterName={<span className="eq-eight-hand" aria-label="Control surface focus">♨</span>}
      headerEnd={
        <>
          <IconButton label="Hot-swap"><span className="eq-eight-swap">↗</span></IconButton>
          <IconButton label="Save preset"><span className="eq-eight-save" /></IconButton>
          <IconButton label="More options"><span className="eq-eight-more">•••</span></IconButton>
        </>
      }
    >
      <Panel rows={3} gap={2} className="eq-eight-panel">
        <PanelColumn className="eq-eight-side eq-eight-left">
          <div className="eq-eight-side-content">
            <button type="button" className="eq-eight-analyze">Analyze</button>
            <label>Block</label>
            <MenuField label="Analyzer block size">8192</MenuField>
            <NumberField
              param={REFRESH}
              value={refresh}
              onChange={setRefresh}
              display={refresh.toFixed(2)}
              showFill={false}
              width={41}
            />
            <NumberField
              param={AVERAGE}
              value={average}
              onChange={setAverage}
              display={average.toFixed(2)}
              showFill={false}
              width={41}
            />
          </div>
        </PanelColumn>

        {frequencies.map((frequency, index) => (
          <PanelColumn
            key={index}
            className={`eq-eight-band${bands[index] ? ' eq-eight-band-on' : ''}`}
          >
            <Knob
              param={FREQUENCY}
              value={frequency}
              onChange={(next) => setFrequencies((values) => replaceAt(values, index, next))}
              display={frequencyText(frequency)}
              disabled={!bands[index]}
              size={27}
            />
            <Knob
              param={GAIN}
              value={gains[index]}
              onChange={(next) => setGains((values) => replaceAt(values, index, next))}
              display={`${gains[index].toFixed(2)} dB`}
              disabled={!bands[index]}
              size={27}
            />
            <div className="eq-eight-band-bottom">
              <NumberField
                param={Q}
                value={qs[index]}
                onChange={(next) => setQs((values) => replaceAt(values, index, next))}
                display={qs[index].toFixed(2)}
                showFill={false}
                disabled={!bands[index]}
                width={35}
              />
              <FilterMenu
                shape={filters[index]}
                onChange={(next) => setFilters((values) => replaceAt(values, index, next))}
              />
              <div className="eq-eight-band-switch">
                <Toggle
                  on={bands[index]}
                  onChange={(next) => setBands((values) => values.map((on, at) => at === index ? next : on))}
                  label={`Band ${index + 1}`}
                  width={11}
                />
                <span>{index + 1}</span>
              </div>
            </div>
          </PanelColumn>
        ))}

        <PanelColumn className="eq-eight-side eq-eight-right">
          <div className="eq-eight-side-content">
            <div className="eq-eight-view-buttons">
              <IconButton label="Headphone audition"><span>◉</span></IconButton>
              <IconButton label="Spectrum view"><span className="eq-eight-bars">▥</span></IconButton>
            </div>
            <label>Mode</label>
            <MenuField label="Channel mode">Stereo</MenuField>
            <label>Edit</label>
            <button type="button" className="eq-eight-value">L</button>
            <label>Adapt. Q</label>
            <Toggle on={adaptive} onChange={setAdaptive} width={45} className="eq-eight-adaptive">
              {adaptive ? 'On' : 'Off'}
            </Toggle>
            <label>Scale</label>
            <button type="button" className="eq-eight-value eq-eight-value-cyan">100 %</button>
            <label>Output</label>
            <button type="button" className="eq-eight-value eq-eight-value-cyan">0.00 dB</button>
          </div>
        </PanelColumn>
      </Panel>
    </Device>
  );
}
