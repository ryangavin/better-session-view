import { describe, expect, it } from 'vitest';
import { loopBuffer } from './loopBuffer.ts';

function buffer(channels: number, length: number, rate: number): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { length, sampleRate: rate, duration: length / rate, numberOfChannels: channels,
    getChannelData: (channel: number) => data[channel] } as AudioBuffer;
}
const context = { createBuffer: buffer } as unknown as BaseAudioContext;

describe('native loop seam', () => {
  it.each([44100, 48000, 96000])('preserves period and interior while smoothing both channels at %i Hz', rate => {
    const source = buffer(2, rate, rate);
    for (let c = 0; c < 2; c++) {
      const samples = source.getChannelData(c);
      for (let i = 0; i < samples.length; i++) samples[i] = .08 * Math.sin(2 * Math.PI * 223.3 * i / rate + c + .7);
    }
    const original = source.getChannelData(0);
    expect(Math.abs(original[Math.round(rate * .1)] - original[Math.round(rate * .6) - 1])).toBeGreaterThan(.01);
    const result = loopBuffer(context, source, .1, .6);
    expect(result.length).toBe(rate / 2);
    for (let c = 0; c < 2; c++) {
      const output = result.getChannelData(c), input = source.getChannelData(c);
      expect(Math.abs(output[0] - output.at(-1)!)).toBeLessThan(.003);
      expect(Array.from(output.subarray(rate * .01, rate * .49)))
        .toEqual(Array.from(input.subarray(rate * .11, rate * .59)));
    }
  });
  it('handles file edges and a loop shorter than the fade without invalid samples', () => {
    const source = buffer(1, 100, 48000); source.getChannelData(0).fill(.25);
    const result = loopBuffer(context, source, 0, source.duration);
    expect(result.length).toBe(100);
    expect(Array.from(result.getChannelData(0)).every(v => v === .25)).toBe(true);
  });
});
