import { describe, expect, it } from 'vitest';
import { sectionSuggestions } from './sections.ts';
import { beatsOf, evenBeats } from './warp.ts';
import type { Measurement } from './debug/waveforms/measure.ts';
const grid = evenBeats(100, 9600, 120, 0); // 48 bars, two seconds each
/** Ten bins a second: five to a beat at 120, twenty to a bar. */
function song(energy: (bar: number) => number, vocals: (bar: number) => number, seconds = 96): Measurement {
  const bins = (fn: (b: number) => number) => Float32Array.from({ length: seconds * 10 }, (_, i) => fn(i / 20));
  return { seconds, step: 0.1, rms: bins(energy), peak: bins(energy), bands: [], stems: [{ id: 'vocals', rms: bins(vocals) }] };
}
describe('section suggestions', () => {
  it('finds sustained vocal entries and exits even when overall energy stays steady', () => {
    const got = sectionSuggestions(song(() => 0.5, (b) => b >= 16 && b < 32 ? 0.3 : 0), grid);
    expect(got.map(({ bar, reason }) => ({ bar, reason }))).toEqual([{ bar: 16, reason: 'Vocals enter' }, { bar: 32, reason: 'Vocals recede' }]);
  });
  it('finds an energy drop without inventing a musical section name', () => {
    expect(sectionSuggestions(song((b) => b < 24 ? 0.5 : 0.1, () => 0), grid)).toEqual([{ bar: 24, reason: 'Energy drops', strength: expect.any(Number) }]);
  });
  it('offers a change on the beat it is on, wherever that is from bar one', () => {
    expect(sectionSuggestions(song(() => 0.5, (b) => b >= 20 ? 0.3 : 0), grid).map((s) => s.bar)).toEqual([20]);
    expect(sectionSuggestions(song(() => 0.5, (b) => b >= 20.5 ? 0.3 : 0), grid).map((s) => s.bar)).toEqual([20.5]);
    expect(sectionSuggestions(song(() => 0.5, (b) => b >= 21.75 ? 0.3 : 0), grid).map((s) => s.bar)).toEqual([21.75]);
  });
  it('ignores silence, weak separation bleed and one-bar fills', () => {
    for (const data of [song(() => 0, () => 0), song(() => 0.5, (b) => b > 20 ? 0.005 : 0), song(() => 0.5, (b) => b >= 24 && b < 25 ? 0.3 : 0)]) expect(sectionSuggestions(data, grid)).toEqual([]);
  });
  it('keeps separate changes eight bars apart, and offers one change once', () => {
    const got = sectionSuggestions(song(() => 0.5, (b) => b >= 16 && b < 24 ? 0.3 : 0), grid);
    expect(got.map((s) => s.bar)).toEqual([16, 24]);
  });
  it('hears the record change speed as a section change', () => {
    // Twenty-four bars at 120, then twenty-four at 132, the stems doing nothing.
    const samples = [0];
    for (let k = 0; k < 192; k++) samples.push(samples[k] + (k < 96 ? 50 : Math.round(50 / 1.1)));
    const bent = beatsOf(100, samples[samples.length - 1], 0, samples);
    const got = sectionSuggestions(song(() => 0.5, () => 0, samples[samples.length - 1] / 100), bent);
    expect(got.map(({ bar, reason }) => ({ bar, reason }))).toEqual([{ bar: 24, reason: 'Tempo rises' }]);
  });
});
