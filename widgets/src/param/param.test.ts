import { describe, expect, it } from 'vitest';
import {
  clamp,
  enumParam,
  fractionOf,
  isSwitch,
  quantize,
  span,
  stepSize,
  valueAt,
  type Param,
} from './param.js';

const unipolar: Param = { kind: 'float', min: 0, max: 1, defaultValue: 0.85 };
const bipolar: Param = { kind: 'float', min: -1, max: 1, defaultValue: 0, unit: 'pan' };

describe('range', () => {
  it('clamps to the parameter, not to 0..1', () => {
    expect(clamp(bipolar, -4)).toBe(-1);
    expect(clamp(bipolar, 4)).toBe(1);
  });

  it('refuses NaN but lets an infinity clamp like any other value', () => {
    expect(clamp(bipolar, Number.NaN)).toBe(-1);
    expect(clamp(bipolar, -Infinity)).toBe(-1);
  });

  it('never divides by a zero-width range', () => {
    const stuck: Param = { kind: 'float', min: 5, max: 5, defaultValue: 5 };
    expect(span(stuck)).toBe(1);
    expect(Number.isFinite(fractionOf(stuck, 5))).toBe(true);
  });
});

describe('position', () => {
  it('maps a value to its place on the control and back', () => {
    expect(fractionOf(unipolar, 0)).toBe(0);
    expect(fractionOf(unipolar, 1)).toBe(1);
    expect(fractionOf(bipolar, 0)).toBe(0.5);
    expect(valueAt(bipolar, 0.5)).toBe(0);
  });

  it('round-trips through the taper', () => {
    const tapered: Param = { kind: 'float', min: 20, max: 20000, defaultValue: 440, exponent: 3 };
    for (const value of [20, 100, 440, 5000, 20000]) {
      expect(valueAt(tapered, fractionOf(tapered, value))).toBeCloseTo(value, 6);
    }
  });

  // Above 1 the low end gets more of the control, which is the whole point of
  // an exponent on a frequency: half a knob covers 20 Hz to 2.5 kHz, not 10 kHz.
  it('gives the low end more travel as the exponent rises', () => {
    const tapered: Param = { kind: 'float', min: 20, max: 20000, defaultValue: 440, exponent: 3 };
    const linear: Param = { ...tapered, exponent: 1 };
    expect(valueAt(tapered, 0.5)).toBeLessThan(valueAt(linear, 0.5));
  });
});

describe('steps', () => {
  // Max's own worked example, and the reason the divisor is steps - 1.
  it('counts reachable values rather than intervals', () => {
    const stepped: Param = { kind: 'float', min: 0, max: 64, defaultValue: 0, steps: 4 };
    expect(quantize(stepped, 0)).toBe(0);
    expect(quantize(stepped, 20)).toBeCloseTo(21.333, 3);
    expect(quantize(stepped, 43)).toBeCloseTo(42.667, 3);
    expect(quantize(stepped, 64)).toBe(64);
  });

  it('spaces steps evenly however the control is tapered', () => {
    const stepped: Param = {
      kind: 'float', min: 0, max: 64, defaultValue: 0, steps: 5, exponent: 4,
    };
    const reached = [0, 0.25, 0.5, 0.75, 1].map((f) => valueAt(stepped, f));
    expect(new Set(reached).size).toBeGreaterThan(1);
    for (const value of reached) expect(quantize(stepped, value)).toBeCloseTo(value, 6);
  });

  it('rounds int and enum parameters whether or not steps are declared', () => {
    const count: Param = { kind: 'int', min: 1, max: 8, defaultValue: 1 };
    expect(quantize(count, 3.7)).toBe(4);
    expect(quantize(enumParam(['Low', 'Mid', 'High']), 1.6)).toBe(2);
  });
});

describe('keyboard step', () => {
  it('moves a quantized parameter by exactly one of its own values', () => {
    const stepped: Param = { kind: 'float', min: 0, max: 64, defaultValue: 0, steps: 4 };
    expect(stepSize(stepped)).toBeCloseTo(64 / 3, 6);
    expect(stepSize(enumParam(['a', 'b', 'c']))).toBe(1);
  });

  it('falls back to a hundredth of the range, or a thousandth held fine', () => {
    expect(stepSize(bipolar)).toBeCloseTo(0.02, 6);
    expect(stepSize(bipolar, true)).toBeCloseTo(0.002, 6);
  });
});

describe('enum', () => {
  it('addresses its members by index', () => {
    const shape = enumParam(['Sine', 'Square', 'Saw'], { defaultIndex: 1 });
    expect(shape.min).toBe(0);
    expect(shape.max).toBe(2);
    expect(shape.defaultValue).toBe(1);
    expect(valueAt(shape, 1)).toBe(2);
  });

  it('recognizes a two-state parameter whichever kind declares it', () => {
    expect(isSwitch({ kind: 'int', min: 0, max: 1, defaultValue: 0 })).toBe(true);
    expect(isSwitch(enumParam(['Off', 'On']))).toBe(true);
    expect(isSwitch(unipolar)).toBe(false);
  });
});
