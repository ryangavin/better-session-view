import { describe, expect, it } from 'vitest';
import { alignmentOf, mapped, type Request } from './model.ts';
import { renderAlignment } from './render.ts';
import { sampleOf, type Beats } from '../../warp.ts';
import { readWav, wavOf } from '../../audio.ts';

// Swing / push-pull inside two unequal four-bar spans; boundary rates differ by 2%.
const rate = 8000;
const beats: Beats = { rate, first: 0, length: 200000, samples: Array.from({ length: 49 }, (_, i) =>
  100 + i * 4000 + (i > 16 ? (i - 16) * 80 : 0) + (i % 2 ? 130 : 0)) };
const request: Request = { startBar: 0, endBar: 8, bpm: 120, policy: { kind: 'recurring', bars: 4 } };

describe('explicit musical alignment', () => {
  it('requires every four bars even with no appreciable drift, and leaves interior swing', () => {
    const map = alignmentOf(beats, request);
    expect(map.pins.map((p) => p.output)).toEqual([0, 64000, 128000]);
    expect(map.pins.map((p) => p.source)).toEqual([100, 64100, 129380]);
    expect(mapped(map.pins, beats.samples[1])).toBe(4130);
    expect(map.speeds).toEqual([1, 1.02]);
    expect(mapped(map.pins, beats.samples[17]) - 17 * 4000).not.toBe(0);
  });
  it('every eight bars does not pin the four-bar midpoint', () => {
    const map = alignmentOf(beats, { ...request, policy: { kind: 'recurring', bars: 8 } });
    expect(map.pins).toHaveLength(2);
    expect(Math.abs(mapped(map.pins, beats.samples[16]) - 64000)).toBeGreaterThan(600);
    const a = beats.samples[1], b = beats.samples[2], c = beats.samples[3];
    expect((mapped(map.pins, b) - mapped(map.pins, a)) / (mapped(map.pins, c) - mapped(map.pins, b))).toBeCloseTo((b - a) / (c - b), 12);
  });
  it('counts custom intervals from the selection and fits a shorter final span', () => {
    const map = alignmentOf(beats, { ...request, startBar: 1, endBar: 8, policy: { kind: 'recurring', bars: 3 } });
    expect(map.pins.map((p) => p.source)).toEqual([4, 16, 28, 32].map((b) => sampleOf(beats, b)));
    expect(map.pins.map((p) => p.output)).toEqual([0, 48000, 96000, 112000]);
  });
  it('uses explicit section length independently of source seconds and name', () => {
    const map = alignmentOf(beats, { ...request, bpm: 135, policy: { kind: 'section', name: 'Verse', bars: 9 } });
    expect(map.pins).toHaveLength(2);
    expect(map.length).toBe(128000);
    expect(alignmentOf(beats, { ...map.request, policy: { kind: 'section', name: 'Chorus', bars: 9 } }).pins).toEqual(map.pins);
  });
  it('keeps original mode bit-exact and independent of target tempo', () => {
    const map = alignmentOf(beats, { ...request, bpm: 0, policy: { kind: 'original' } });
    const channel = Float32Array.from({ length: beats.length }, (_, i) => Math.sin(i / 13));
    const out = renderAlignment([channel], map)[0];
    expect(out).toEqual(channel.slice(100, 129380));
    expect(map.speeds).toEqual([1]);
  });
  it('rounds absolute targets once, bounds duration error, and never creates gaps', () => {
    const map = alignmentOf(beats, { ...request, bpm: 119.731 });
    map.pins.forEach((p, i) => expect(Math.abs(p.output - i * 16 * 60 * rate / 119.731)).toBeLessThanOrEqual(0.5));
    const out = renderAlignment([new Float32Array(beats.length).fill(0.25)], map)[0];
    expect(out.length).toBe(Math.round(32 * 60 * rate / 119.731));
    expect(Math.max(...out.subarray(0, 100))).toBeCloseTo(0.25, 6);
    for (const pin of map.pins.slice(1, -1)) for (let i = -3; i <= 3; i++) expect(out[pin.output + i]).toBeCloseTo(0.25, 6);
    const wav = readWav(wavOf([out], rate))!;
    expect(wav.channels[0]).toEqual(out);
  });
  it('preserves relative stem alignment, polarity and recombination through the rate step', () => {
    const map = alignmentOf(beats, request);
    const a = new Float32Array(beats.length);
    for (const pin of map.pins.slice(0, -1)) a[pin.source] = 1;
    a[beats.samples[20]] = 0.5;
    const b = Float32Array.from(a, (n) => -n);
    const [one, two, sum] = renderAlignment([a, b, new Float32Array(beats.length)], map);
    for (const pin of map.pins.slice(0, -1)) expect(one[pin.output]).toBe(1);
    expect(one.every((n, i) => n + two[i] === sum[i])).toBe(true);
    expect(renderAlignment([a], map)[0]).toEqual(one);
  });
  it('uses a shared crop origin without changing the kernel at region or rate boundaries', () => {
    const map = alignmentOf(beats, request);
    const channel = Float32Array.from({ length: beats.length }, (_, i) => Math.sin(i / 13));
    expect(renderAlignment([channel.slice(36, 129444)], map, 36)[0]).toEqual(renderAlignment([channel], map)[0]);
  });
  it('policy changes are reproducible and do not modify source edits', () => {
    const before = structuredClone(beats);
    const first = alignmentOf(beats, request);
    alignmentOf(beats, { ...request, policy: { kind: 'recurring', bars: 8 } });
    expect(alignmentOf(beats, request)).toEqual(first);
    expect(beats).toEqual(before);
  });
  it.each([
    { startBar: 3, endBar: 2 }, { startBar: NaN }, { endBar: 100 }, { bpm: 0 }, { bpm: 200 },
    { policy: { kind: 'recurring', bars: 0 } }, { policy: { kind: 'recurring', bars: 1.5 } },
    { policy: { kind: 'section', name: '', bars: 8 } }, { policy: { kind: 'section', name: 'Verse', bars: 0 } },
  ])('rejects unsupported or contradictory requests: %j', (change) => {
    expect(() => alignmentOf(beats, { ...request, ...change } as Request)).toThrow();
  });
  it('rejects malformed source and mismatched stem coverage', () => {
    expect(() => alignmentOf({ ...beats, samples: [100, 100, 500] }, request)).toThrow(/strictly increasing/);
    expect(() => alignmentOf({ ...beats, samples: [100, NaN, 500] }, request)).toThrow(/finite/);
    expect(() => renderAlignment([new Float32Array(100)], alignmentOf(beats, request))).toThrow(/same source timeline/);
  });
  it('bounds render work even for original timing', () => {
    const long = { ...beats, length: 2000000, samples: beats.samples.map((s) => s * 10) };
    expect(() => alignmentOf(long, { ...request, policy: { kind: 'original' } })).toThrow(/120 seconds/);
  });
  it('a rendered four-bar click loop repeats on its frame boundary without extra padding', () => {
    const map = alignmentOf(beats, { ...request, endBar: 4, bpm: 119.731 });
    const clicks = new Float32Array(beats.length);
    // One pulse at every required downbeat, including the next loop's first beat.
    clicks[beats.samples[0]] = 1;
    clicks[beats.samples[16]] = 1;
    const loop = renderAlignment([clicks], map)[0];
    const repeated = new Float32Array(loop.length * 3);
    for (let pass = 0; pass < 3; pass++) repeated.set(loop, pass * loop.length);
    const ideal = 16 * 60 * rate / 119.731;
    for (let pass = 0; pass < 3; pass++) {
      expect(repeated[pass * loop.length]).toBe(1);
      expect(repeated.slice(pass * loop.length, (pass + 1) * loop.length)).toEqual(loop);
      expect(Math.abs(pass * loop.length - pass * ideal)).toBeLessThanOrEqual(pass * 0.5);
    }
    // This checks sample placement, deliberately not whether a music selection has a clean join.
    expect(readWav(wavOf([repeated], rate))!.channels[0].length).toBe(map.length * 3);
  });
});
