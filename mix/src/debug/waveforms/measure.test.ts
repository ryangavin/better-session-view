import { describe, it, expect } from 'vitest';
import { measure } from './measure.ts';
const signal = () => new AbortController().signal;

describe('waveform measurements', () => {
  it('sums stems before measuring but preserves opposing stereo channels', async () => {
    const stereo = await measure([{ id: 'stereo', channels: [new Float32Array([0.5, -0.5]), new Float32Array([-0.5, 0.5])] }], 48000, signal());
    expect(Array.from(stereo.peak)).toEqual([0.5, 0.5]);
    expect(Array.from(stereo.rms)).toEqual([0.5, 0.5]);
    const cancellation = await measure([{ id: 'one', channels: [new Float32Array([0.5])] }, { id: 'two', channels: [new Float32Array([-0.5])] }], 48000, signal());
    expect(cancellation.peak[0]).toBe(0);
    expect(cancellation.stems.map((s) => s.rms[0])).toEqual([0.5, 0.5]);
  });
  it('keeps a transient and the last partial bin, without changing input', async () => {
    const audio = new Float32Array(32769); audio[audio.length - 1] = 0.75;
    const result = await measure([{ id: 'drums', channels: [audio] }], 48000, signal());
    expect(result.peak.at(-1)).toBe(0.75);
    expect(result.seconds).toBe(audio.length / 48000);
    expect(audio.at(-1)).toBe(0.75);
  });
  it('distinguishes low and high frequency energy', async () => {
    for (const [hz, band] of [[60, 0], [10000, 2]]) {
      const audio = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i * 2 * Math.PI * hz / 48000));
      const result = await measure([{ id: 'tone', channels: [audio] }], 48000, signal());
      const energy = result.bands.map((b) => b.reduce((sum, x) => sum + x * x, 0));
      expect(energy.indexOf(Math.max(...energy))).toBe(band);
    }
  });
  it('cancels discarded work', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(measure([{ id: 'x', channels: [new Float32Array(100)] }], 48000, controller.signal)).rejects.toThrow();
  });
});
