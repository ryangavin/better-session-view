import { describe, expect, it } from 'vitest';
import { sectionSuggestions } from './sections.ts';
import { evenBeats } from './warp.ts';
import type { Measurement } from './debug/waveforms/measure.ts';
const grid = evenBeats(100, 9600, 120, 0); // 48 bars, two seconds each
function song(energy: (bar: number) => number, vocals: (bar: number) => number): Measurement {
  const bins = (fn: (b: number) => number) => Float32Array.from({ length: 960 }, (_, i) => fn(Math.floor(i / 20)));
  return { seconds: 96, step: 0.1, rms: bins(energy), peak: bins(energy), bands: [], stems: [{ id: 'vocals', rms: bins(vocals) }] };
}
describe('section suggestions', () => {
  it('finds sustained vocal entries and exits even when overall energy stays steady', () => {
    const got = sectionSuggestions(song(() => 0.5, (b) => b >= 16 && b < 32 ? 0.3 : 0), grid, 8);
    expect(got.map(({ bar, reason }) => ({ bar, reason }))).toEqual([{ bar: 16, reason: 'Vocals enter' }, { bar: 32, reason: 'Vocals recede' }]);
  });
  it('finds an energy drop without inventing a musical section name', () => {
    expect(sectionSuggestions(song((b) => b < 24 ? 0.5 : 0.1, () => 0), grid, 8)).toEqual([{ bar: 24, reason: 'Energy drops', strength: expect.any(Number) }]);
  });
  it('quantizes a sustained change relative to bar one on four or eight bars', () => {
    const data = song(() => 0.5, (b) => b >= 20 ? 0.3 : 0);
    expect(sectionSuggestions(data, grid, 4).map((s) => s.bar)).toEqual([20]);
    expect(sectionSuggestions(data, grid, 8).map((s) => s.bar)).toEqual([24]);
  });
  it('ignores silence, weak separation bleed and one-bar fills', () => {
    for (const data of [song(() => 0, () => 0), song(() => 0.5, (b) => b > 20 ? 0.005 : 0), song(() => 0.5, (b) => b === 24 ? 0.3 : 0)]) expect(sectionSuggestions(data, grid, 4)).toEqual([]);
  });
  it('keeps separate changes eight bars apart', () => {
    expect(sectionSuggestions(song(() => 0.5, (b) => b >= 16 && b < 24 ? 0.3 : 0), grid, 8).map((s) => s.bar)).toEqual([16, 24]);
  });
});
