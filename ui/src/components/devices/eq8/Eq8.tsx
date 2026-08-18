import { useState, type ReactNode } from 'react';
import { Device } from '../../../../../widgets/src/chrome/Device.js';
import { Panel, PanelColumn } from '../../../../../widgets/src/chrome/Panel.js';
import { Knob } from '../../../../../widgets/src/controls/Knob.js';
import { NumberField } from '../../../../../widgets/src/controls/NumberField.js';
import { Select } from '../../../../../widgets/src/controls/Select.js';
import { Toggle } from '../../../../../widgets/src/controls/Toggle.js';
import type { Param } from '../../../../../widgets/src/param/param.js';
import './Eq8.css';

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
const SCALE: Param = {
  kind: 'float', min: 0, max: 200, defaultValue: 100, unit: 'percent', shortName: 'Scale',
};
const OUTPUT: Param = {
  kind: 'float', min: -12, max: 12, defaultValue: 0, unit: 'decibel', shortName: 'Output',
};

const INITIAL_FREQUENCIES = [167, 200, 1290, 2610, 100, 10000, 5000, 18000];
const INITIAL_GAINS = [0, 0, -7.81, 3.6, 0, 0, 0, 0];
const INITIAL_QS = [1.37, 0.71, 0.93, 0.71, 0.71, 0.71, 0.71, 0.71];
const INITIAL_FILTERS = [0, 2, 2, 3, 2, 2, 2, 1];
const BLOCK_SIZES = ['1024', '2048', '4096', '8192', '16384'];
const FILTER_TYPES = ['Low', 'Shelf', 'Bell', 'Notch'];
const CHANNEL_MODES = ['Stereo', 'L/R', 'M/S'];

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
    <button type="button" className="eq8-icon" aria-label={label}>
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

/**
 * Live's EQ Eight, drawn out of [`widgets/`](../../../../../widgets/README.md)
 * and composed here rather than there.
 *
 * The parts are the library's, because a knob is a knob wherever it's mounted.
 * The arrangement of them is this device and no other: eight lanes on a shared
 * row grid, the analyzer's controls on one plate and the output's on another,
 * and a title bar carrying the preset chrome only a stock face has. Adding an
 * `Eq8` to `widgets/` would be exporting one particular device from a module
 * whose whole claim is that it knows about none of them — so it is a component
 * of this app, using the same boundary the device chain already crosses.
 *
 * **`Eq8` and not `EQEight`, deliberately.** Live names a device three ways and
 * this is the one a program uses: `class_name` is `Eq8`, `class_display_name`
 * is `EQ Eight`, and `name` is whatever the user retyped in the title bar. The
 * chain publishes the first as `ChainDevice.className`, so it is what a face
 * gets picked by, and the folder, the file, the export and the wire all spell
 * it the same. The display name survives as the string in the title bar below.
 *
 * **It states its own readings.** Not for want of any: an open device publishes
 * its parameters, and `deviceParam` turns one into the `Param` a widget takes.
 * This component simply accepts no props yet, so every value here is its own
 * `useState`. The `display` each control takes is the seam that ends that — it
 * wins over the formatter outright, so Live's `str_for_value` replaces the text
 * computed below without any control changing. See
 * [device faces](../../../../docs/device-faces.md).
 */
export function Eq8() {
  const [deviceOn, setDeviceOn] = useState(true);
  const [frequencies, setFrequencies] = useState(INITIAL_FREQUENCIES);
  const [gains, setGains] = useState(INITIAL_GAINS);
  const [qs, setQs] = useState(INITIAL_QS);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [bands, setBands] = useState([true, true, true, true, false, false, false, false]);
  const [refresh, setRefresh] = useState(60);
  const [average, setAverage] = useState(1);
  const [analyzing, setAnalyzing] = useState(true);
  const [blockSize, setBlockSize] = useState(3);
  const [channelMode, setChannelMode] = useState(0);
  const [editLeft, setEditLeft] = useState(true);
  const [adaptive, setAdaptive] = useState(true);
  const [scale, setScale] = useState(100);
  const [output, setOutput] = useState(0);

  return (
    <Device
      name="EQ Eight"
      className="eq8-device"
      on={deviceOn}
      onToggle={setDeviceOn}
      headerStart={<IconButton label="Load preset"><DownIcon /></IconButton>}
      headerAfterName={<span className="eq8-status" aria-label="Control surface focus">◆</span>}
      headerEnd={
        <>
          <IconButton label="Hot-swap"><span className="eq8-swap">↗</span></IconButton>
          <IconButton label="Save preset"><span className="eq8-save" /></IconButton>
          <IconButton label="More options"><span className="eq8-more">•••</span></IconButton>
        </>
      }
    >
      <Panel rows={3} gap={2} className="eq8-panel">
        <PanelColumn className="eq8-side eq8-left">
          <div className="eq8-side-content">
            <Toggle on={analyzing} onChange={setAnalyzing} name="Analyze">
              {analyzing ? 'On' : 'Off'}
            </Toggle>
            <Select items={BLOCK_SIZES} index={blockSize} onChange={setBlockSize} name="Block" />
            <NumberField
              param={REFRESH}
              value={refresh}
              onChange={setRefresh}
              display={refresh.toFixed(2)}
            />
            <NumberField
              param={AVERAGE}
              value={average}
              onChange={setAverage}
              display={average.toFixed(2)}
            />
          </div>
        </PanelColumn>

        {frequencies.map((frequency, index) => (
          <PanelColumn
            key={index}
            className={`eq8-band${bands[index] ? ' eq8-band-on' : ''}`}
          >
            <Knob
              param={FREQUENCY}
              value={frequency}
              onChange={(next) => setFrequencies((values) => replaceAt(values, index, next))}
              display={frequencyText(frequency)}
              disabled={!bands[index]}
            />
            <Knob
              param={GAIN}
              value={gains[index]}
              onChange={(next) => setGains((values) => replaceAt(values, index, next))}
              display={`${gains[index].toFixed(2)} dB`}
              disabled={!bands[index]}
            />
            <div className="eq8-band-bottom">
              <NumberField
                param={Q}
                value={qs[index]}
                onChange={(next) => setQs((values) => replaceAt(values, index, next))}
                display={qs[index].toFixed(2)}
                disabled={!bands[index]}
              />
              <Select
                items={FILTER_TYPES}
                index={filters[index]}
                onChange={(next) => setFilters((values) => replaceAt(values, index, next))}
                label={`Band ${index + 1} filter type`}
                disabled={!bands[index]}
              />
              <div className="eq8-band-switch">
                <Toggle
                  on={bands[index]}
                  onChange={(next) => setBands((values) => values.map((on, at) => at === index ? next : on))}
                  label={`Band ${index + 1}`}
                />
                <span>{index + 1}</span>
              </div>
            </div>
          </PanelColumn>
        ))}

        <PanelColumn className="eq8-side eq8-right">
          <div className="eq8-side-content">
            <div className="eq8-side-section">
              <div className="eq8-view-buttons">
                <IconButton label="Headphone audition"><span>◉</span></IconButton>
                <IconButton label="Spectrum view"><span className="eq8-bars">▥</span></IconButton>
              </div>
              <Select
                items={CHANNEL_MODES}
                index={channelMode}
                onChange={setChannelMode}
                name="Mode"
              />
            </div>
            <div className="eq8-side-section">
              <Toggle on={editLeft} onChange={setEditLeft} name="Edit">L</Toggle>
              <Toggle on={adaptive} onChange={setAdaptive} name="Adapt. Q">
                {adaptive ? 'On' : 'Off'}
              </Toggle>
            </div>
            <div className="eq8-side-section">
              <NumberField param={SCALE} value={scale} onChange={setScale} />
              <NumberField param={OUTPUT} value={output} onChange={setOutput} />
            </div>
          </div>
        </PanelColumn>
      </Panel>
    </Device>
  );
}
