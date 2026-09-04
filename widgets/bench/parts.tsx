import { useState, type ReactNode } from 'react';
import { enumParam, type Param, type UnitStyle } from '../src/param/param.ts';

/**
 * The pieces every case on the bench is made of, and the parameters they run on.
 *
 * They live here rather than in `Bench.tsx` because the page is no longer one
 * file: a room whose cases are involved enough to want their own module still
 * wants the same card around them and the same made-up parameters inside them,
 * and a second copy of either would be a second thing to keep true.
 */

/** One widget's own value, so every example on the page is genuinely live. */
export function Held({
  param,
  children,
}: {
  param: Param;
  children: (value: number, onChange: (next: number) => void) => ReactNode;
}) {
  const [value, setValue] = useState(param.defaultValue);
  return <>{children(value, setValue)}</>;
}

export function Case({
  note,
  wide,
  children,
}: {
  note: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`case${wide ? ' wide' : ''}`}>
      <div className="case-stage">{children}</div>
      <p className="case-note">{note}</p>
    </div>
  );
}

export const DRY_WET: Param = {
  kind: 'float', min: 0, max: 100, defaultValue: 50, unit: 'percent', shortName: 'Dry/Wet',
};
export const PAN: Param = {
  kind: 'float', min: -1, max: 1, defaultValue: 0, unit: 'pan', shortName: 'Pan',
};
export const FREQ: Param = {
  kind: 'float', min: 20, max: 20000, defaultValue: 440, unit: 'hertz',
  exponent: 3, shortName: 'Freq',
};
export const VOICES: Param = {
  kind: 'int', min: 1, max: 16, defaultValue: 8, unit: 'int', shortName: 'Voices',
};
export const TIME: Param = {
  kind: 'float', min: 1, max: 5000, defaultValue: 250, unit: 'time', shortName: 'Time',
};
export const GAIN: Param = {
  kind: 'float', min: -70, max: 6, defaultValue: 0, unit: 'decibel', shortName: 'Gain',
};
export const NOTE: Param = {
  kind: 'int', min: 0, max: 127, defaultValue: 60, unit: 'midi', shortName: 'Root',
};
export const CROSSFADE: Param = {
  kind: 'float', min: -1, max: 1, defaultValue: 0, unit: 'float', shortName: 'Crossfade',
};
export const STEPPED: Param = {
  kind: 'float', min: 0, max: 64, defaultValue: 0, steps: 4, shortName: 'Steps',
};
export const SHAPE = enumParam(['Sine', 'Square', 'Saw', 'Noise'], { defaultIndex: 0, name: 'Shape' });
export const FILTER = enumParam(['LP', 'BP', 'HP', 'Notch'], { defaultIndex: 0, name: 'Filter' });

export const UNITS: UnitStyle[] = [
  'native', 'int', 'float', 'time', 'hertz', 'decibel',
  'percent', 'pan', 'semitones', 'midi', 'custom',
];
