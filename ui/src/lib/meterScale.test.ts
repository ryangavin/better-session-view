import { describe, expect, it } from 'vitest';
import {
  compactParameterDisplay,
  meterDecibels,
  meterFraction,
} from './meterScale.js';

describe('Live meter scale', () => {
  it('uses Live normalized values as positions instead of amplitudes', () => {
    expect(meterDecibels(0)).toBe(-60);
    expect(meterDecibels(0.5)).toBe(-27);
    expect(meterDecibels(1)).toBe(6);
  });

  it('clamps values to the visible rail', () => {
    expect(meterDecibels(-1)).toBe(-60);
    expect(meterDecibels(2)).toBe(6);
    expect(meterFraction(-90)).toBe(0);
    expect(meterFraction(12)).toBe(1);
  });
});

describe('compact mixer parameter display', () => {
  it('matches the narrow Live-style fields', () => {
    expect(compactParameterDisplay('-3.80 dB')).toBe('-3.8');
    expect(compactParameterDisplay('-inf dB')).toBe('−∞');
    expect(compactParameterDisplay('C')).toBe('C');
  });
});
