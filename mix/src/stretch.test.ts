import { afterEach, describe, expect, it } from 'vitest';
import { channelsOf } from './stretch.ts';

/**
 * What this protects is the one arithmetic the engine assumes and never checks.
 *
 * `channelsOf` flattens the stems into the worklet's channel list, and the
 * engine splits that list back apart on the other side by taking `2i` and
 * `2i+1` for the stem at index `i` of the same `ids` order. Nothing enforces
 * the pairing: if this file ever emitted one channel for a mono stem, or
 * skipped a stem, or reordered them, the splitter would still wire happily and
 * the bass would come out of the vocal fader. So the assertions here are about
 * two channels per stem, in order, all the same length, at the graph's rate —
 * the four facts the splitter's arithmetic stands on.
 */

/**
 * A stand-in for the parts of `AudioBuffer` this file actually touches.
 *
 * The tests run in node, where there is no Web Audio, and a real buffer is not
 * worth the shim: `channelsOf` reads a duration, a rate, a channel count and
 * `copyFromChannel`, and nothing else. `copyFromChannel` copies from the start
 * and stops at the shorter of the two, which is exactly how the padding to the
 * longest stem happens at all — so the fake has to honour that or the padding
 * test proves nothing.
 */
const buffer = (channels: readonly Float32Array[], sampleRate: number): AudioBuffer => {
  const frames = channels[0].length;
  return {
    sampleRate,
    duration: frames / sampleRate,
    length: frames,
    numberOfChannels: channels.length,
    getChannelData: (c: number) => channels[c],
    copyFromChannel: (dest: Float32Array, c: number) => {
      dest.set(channels[c].subarray(0, Math.min(dest.length, channels[c].length)));
    },
  } as unknown as AudioBuffer;
};

/** A context is only ever asked its rate. */
const context = (sampleRate: number) => ({ sampleRate }) as unknown as BaseAudioContext;

const flat = (value: number, length: number) => new Float32Array(length).fill(value);

const sine = (length: number, period: number) =>
  Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * i) / period));

describe('channelsOf', () => {
  it('gives two channels per stem, in the order it was handed them', async () => {
    const ctx = context(48000);
    const out = await channelsOf(ctx, [
      buffer([flat(0.1, 100), flat(0.2, 100)], 48000),
      buffer([flat(0.3, 100), flat(0.4, 100)], 48000),
      buffer([flat(0.5, 100), flat(0.6, 100)], 48000),
    ]);
    expect(out).toHaveLength(6);
    // The engine reads `2i` and `2i+1` for stem `i`; these are those pairs.
    expect([...out.map((c) => c[0])]).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map(Math.fround));
  });

  it('sends a mono stem twice rather than leaving it half silent', async () => {
    const ctx = context(48000);
    const out = await channelsOf(ctx, [buffer([flat(0.25, 100)], 48000)]);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(out[0]);
    expect(out[1].every((s) => s === Math.fround(0.25))).toBe(true);
  });

  it('pads every channel out to the longest stem', async () => {
    const ctx = context(48000);
    const out = await channelsOf(ctx, [
      buffer([flat(1, 100), flat(1, 100)], 48000),
      buffer([flat(1, 400), flat(1, 400)], 48000),
      buffer([flat(1, 250)], 48000),
    ]);
    for (const channel of out) expect(channel).toHaveLength(400);
    // The short stems stop where their samples stop, and stay stopped — a
    // wrap or a repeat here would play the head of a stem over the tail of
    // the mix.
    expect([...out[0].subarray(100)].every((s) => s === 0)).toBe(true);
    expect([...out[4].subarray(250)].every((s) => s === 0)).toBe(true);
    expect(out[4][249]).toBe(1);
  });

  it('gives exactly two channels per stem, whatever the stems are', async () => {
    const ctx = context(48000);
    const mono = buffer([flat(1, 10)], 48000);
    const stereo = buffer([flat(1, 10), flat(1, 10)], 48000);
    expect(await channelsOf(ctx, [])).toHaveLength(0);
    expect(await channelsOf(ctx, [mono])).toHaveLength(2);
    expect(await channelsOf(ctx, [mono, stereo, mono])).toHaveLength(6);
    expect(await channelsOf(ctx, [stereo, stereo, stereo, stereo])).toHaveLength(8);
  });

  describe('at another rate', () => {
    /**
     * The resampling goes through `OfflineAudioContext`, which node does not
     * have, so the test supplies one that genuinely resamples — linear
     * interpolation, the same arithmetic a browser would do to within its
     * error. A stub that handed the samples back untouched would pass whether
     * or not `channelsOf` called it at all, which is the one bug this test is
     * here for; so the assertion is on the waveform, at indices where a
     * skipped resample and a real one disagree loudly.
     */
    const original = globalThis.OfflineAudioContext;
    afterEach(() => {
      globalThis.OfflineAudioContext = original;
    });

    class Offline {
      readonly destination = {};
      private source: { buffer?: AudioBuffer } = {};
      constructor(
        readonly numberOfChannels: number,
        readonly length: number,
        readonly sampleRate: number,
      ) {}
      createBufferSource() {
        return Object.assign(this.source, { connect: () => {}, start: () => {} });
      }
      async startRendering(): Promise<AudioBuffer> {
        const from = this.source.buffer!;
        const step = from.sampleRate / this.sampleRate;
        const out: Float32Array[] = [];
        for (let c = 0; c < from.numberOfChannels; c++) {
          const src = from.getChannelData(c);
          const channel = new Float32Array(this.length);
          for (let i = 0; i < this.length; i++) {
            const at = i * step;
            const j = Math.floor(at);
            channel[i] = j + 1 < src.length ? src[j] + (src[j + 1] - src[j]) * (at - j) : (src[j] ?? 0);
          }
          out.push(channel);
        }
        return buffer(out, this.sampleRate);
      }
    }

    it('resamples a stem recorded at another rate to the graph rate', async () => {
      globalThis.OfflineAudioContext = Offline as unknown as typeof OfflineAudioContext;
      // 441 Hz: one cycle every 100 samples at 44.1 kHz, and every 108.84 at
      // 48 kHz. Play it back untouched and it is a semitone and a half sharp,
      // which is what the sample-by-sample comparison below is looking for.
      const frames = 44100;
      const out = await channelsOf(context(48000), [
        buffer([sine(frames, 100), sine(frames, 100)], 44100),
      ]);
      expect(out).toHaveLength(2);
      expect(out[0]).toHaveLength(48000);
      const period = (48000 / 44100) * 100;
      // Indices where the two readings genuinely part company — every
      // hundredth sample is a zero crossing in both, and proves nothing.
      for (const i of [0, 137, 1200, 9001, 24050, 47000]) {
        expect(out[0][i]).toBeCloseTo(Math.sin((2 * Math.PI * i) / period), 3);
        // And is not what the same index would hold had the rate been ignored.
        if (i > 0) expect(out[0][i]).not.toBeCloseTo(Math.sin((2 * Math.PI * i) / 100), 2);
      }
      expect(out[1]).toEqual(out[0]);
    });

    it('pads a resampled stem to the longest at the graph rate', async () => {
      globalThis.OfflineAudioContext = Offline as unknown as typeof OfflineAudioContext;
      const out = await channelsOf(context(48000), [
        buffer([flat(1, 44100)], 44100),
        buffer([flat(1, 96000), flat(1, 96000)], 48000),
      ]);
      for (const channel of out) expect(channel).toHaveLength(96000);
      // A second of 44.1 kHz is 48000 frames once it is at the graph's rate,
      // not 44100 — the seam is where a stem would go quiet early.
      expect(out[0][47999]).toBe(1);
      expect(out[0][48000]).toBe(0);
    });
  });
});
