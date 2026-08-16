import { describe, expect, it } from 'vitest';
import type { Param } from '../param/param.js';
import { defaultOrigin, fillFrom } from './fill.js';

const pan: Param = { kind: 'float', min: -1, max: 1, defaultValue: 0, unit: 'pan' };
const gain: Param = { kind: 'float', min: -70, max: 6, defaultValue: 0, unit: 'decibel' };
const dryWet: Param = { kind: 'float', min: 0, max: 100, defaultValue: 50, unit: 'percent' };

describe('default origin', () => {
  it('fills from the middle when zero is the middle', () => {
    expect(defaultOrigin(pan)).toBe('center');
    expect(defaultOrigin({ ...pan, min: -12, max: 12, unit: 'semitones' })).toBe('center');
  });

  it('fills a fader from its floor, though its range straddles zero', () => {
    expect(defaultOrigin(gain)).toBe('min');
  });

  it('fills from min when the range has one side', () => {
    expect(defaultOrigin(dryWet)).toBe('min');
    expect(defaultOrigin({ ...gain, max: 0 })).toBe('min');
  });
});

describe('fill geometry', () => {
  it('runs from the floor to the value', () => {
    expect(fillFrom(gain, 'min', 0.92)).toMatchObject({
      '--wdg-fill-start': 0,
      '--wdg-fill-size': 0.92,
    });
  });

  it('runs either side of the middle', () => {
    expect(fillFrom(pan, 'center', 0.25)).toMatchObject({
      '--wdg-fill-start': 0.25,
      '--wdg-fill-size': 0.25,
    });
    expect(fillFrom(pan, 'center', 0.75)).toMatchObject({
      '--wdg-fill-start': 0.5,
      '--wdg-fill-size': 0.25,
    });
  });
});
