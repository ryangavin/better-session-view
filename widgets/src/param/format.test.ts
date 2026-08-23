import { describe, expect, it } from 'vitest';
import { format, noteName, widestText } from './format.ts';
import { enumParam, type Param } from './param.ts';

function withUnit(unit: Param['unit'], over: Partial<Param> = {}): Param {
  return { kind: 'float', min: 0, max: 1, defaultValue: 0, unit, ...over };
}

describe('unit styles', () => {
  it('spells time in milliseconds until it reaches a second', () => {
    const time = withUnit('time', { max: 5000 });
    expect(format(time, 250)).toBe('250 ms');
    expect(format(time, 1500)).toBe('1.50 s');
  });

  it('spells frequency in hertz until it reaches a kilohertz', () => {
    const hertz = withUnit('hertz', { min: 20, max: 20000 });
    expect(format(hertz, 440)).toBe('440 Hz');
    expect(format(hertz, 12000)).toBe('12.00 kHz');
  });

  it('reads pan as a distance from center, like Live', () => {
    const pan = withUnit('pan', { min: -1, max: 1 });
    expect(format(pan, 0)).toBe('C');
    expect(format(pan, -1)).toBe('50L');
    expect(format(pan, 0.5)).toBe('25R');
  });

  it('signs semitones and leaves decibels their tenth', () => {
    expect(format(withUnit('semitones', { min: -24, max: 24 }), 12)).toBe('+12 st');
    expect(format(withUnit('semitones', { min: -24, max: 24 }), -5)).toBe('-5 st');
    expect(format(withUnit('decibel', { min: -70, max: 6 }), -12.75)).toBe('-12.8 dB');
  });

  it('reads silence as -inf rather than as a number', () => {
    expect(format(withUnit('decibel', { min: -Infinity, max: 6 }), -Infinity)).toBe('-inf dB');
  });

  it('names MIDI notes the way Live does, with 60 as C3', () => {
    expect(noteName(60)).toBe('C3');
    expect(noteName(0)).toBe('C-2');
    expect(noteName(61)).toBe('C#3');
    expect(format(withUnit('midi', { min: 0, max: 127 }), 69)).toBe('A3');
  });
});

describe('custom units', () => {
  it('appends a bare symbol to the native reading', () => {
    expect(format(withUnit('custom', { max: 16, customUnit: 'Voices' }), 12)).toBe('12.00 Voices');
  });

  it('honours a sprintf-style pattern', () => {
    const bogons = withUnit('custom', { customUnit: '%0.2f Bogons' });
    expect(format(bogons, 0.87)).toBe('0.87 Bogons');
  });
});

describe('spelling', () => {
  it('names an enum member rather than its index', () => {
    expect(format(enumParam(['Sine', 'Square', 'Saw']), 2)).toBe('Saw');
  });

  // A readout that trims trailing zeros changes width as it counts, so the
  // number slides sideways under the pointer for the whole of a drag.
  it('keeps a fixed width so a drag readout does not jitter', () => {
    const p = withUnit('float');
    expect(format(p, 0.5)).toBe('0.50');
    expect(format(p, 0.75)).toBe('0.75');
    expect(format(p, 1)).toBe('1.00');
  });

  it('takes its precision from the range, not from the value', () => {
    expect(format(withUnit('float', { max: 1000 }), 250.4)).toBe('250');
    expect(format(withUnit('float', { max: 100 }), 25.44)).toBe('25.4');
  });

  it('never shows a negative zero', () => {
    expect(format(withUnit('float', { min: -1, max: 1 }), -0)).toBe('0.00');
  });
});

describe('the widest reading', () => {
  it('finds the longest one rather than assuming an extreme', () => {
    // 999 Hz is longer than either end: 20 Hz below it, 20.00 kHz above.
    expect(widestText(withUnit('hertz', { min: 20, max: 20000 }))).toBe(9);
    // -70.0 dB, and not the -9.5 dB the middle of the range reads.
    expect(widestText(withUnit('decibel', { min: -70, max: 6 }))).toBe(8);
  });

  it('checks every value an int holds, not a sample of them', () => {
    // C#-2 is note 1, one off the bottom, and two characters wider than C3.
    expect(widestText({ kind: 'int', min: 0, max: 127, defaultValue: 60, unit: 'midi' })).toBe(4);
  });

  it('measures an enum by its longest member', () => {
    expect(widestText(enumParam(['LP', 'BP', 'Notch']))).toBe(5);
  });
});
