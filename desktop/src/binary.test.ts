import { describe, expect, it } from 'vitest';
import { fromWire, toWire } from './binary.ts';

// The bug this exists for was silent: a `Float32Array` through `JSON.stringify`
// comes back an object with a key per index, nothing throws, and the caller is
// handed the wrong kind of thing. So the tests are about kind and identity of
// contents, not about whether a round trip "works".

const round = (value: unknown): unknown => fromWire(JSON.parse(JSON.stringify(toWire(value))));

describe('carrying a typed array as text', () => {
  it('comes back the same kind, not an object that looks like one', () => {
    const sent = new Float32Array([0.5, -0.25, 0, 1]);
    const back = round(sent) as Float32Array;
    expect(back).toBeInstanceOf(Float32Array);
    expect(Array.from(back)).toEqual([0.5, -0.25, 0, 1]);
  });

  it('survives JSON without the codec being a no-op', () => {
    // What used to happen, stated so the regression is legible.
    const naive = JSON.parse(JSON.stringify(new Float32Array([1, 2])));
    expect(naive).not.toBeInstanceOf(Float32Array);
    expect(naive).toEqual({ 0: 1, 1: 2 });
  });

  it('keeps every kind the API actually sends', () => {
    for (const sent of [
      new Float32Array([1.5]),
      new Float64Array([1.5]),
      new Uint8Array([255]),
      new Int16Array([-2]),
      new Uint32Array([4294967295]),
    ]) {
      const back = round(sent) as ArrayBufferView;
      expect(back.constructor.name).toBe(sent.constructor.name);
      expect(Array.from(back as unknown as number[])).toEqual(Array.from(sent as unknown as number[]));
    }
  });

  it('finds them nested, which is how they are actually passed', () => {
    // `keepPeaks` sends `Record<string, Float32Array>`, one per stem.
    const sent = { trackId: 'x', columns: 9000, sources: { drums: new Float32Array([0.1, 0.2]) } };
    const back = round(sent) as typeof sent;
    expect(back.sources.drums).toBeInstanceOf(Float32Array);
    expect(back.trackId).toBe('x');
    expect(back.columns).toBe(9000);
  });

  it('carries a large one without overflowing the stack', () => {
    // Half a megabyte is one stem of peaks, and the chunking exists for it.
    const sent = new Float32Array(72000 * 2).map((_, i) => (i % 200) / 200);
    const back = round(sent) as Float32Array;
    expect(back).toHaveLength(sent.length);
    expect(back[71999]).toBeCloseTo(sent[71999], 6);
  });

  it('leaves everything that already survives alone', () => {
    const sent = { a: 1, b: 'two', c: null, d: [1, 'x', { e: true }], f: false };
    expect(toWire(sent)).toEqual(sent);
    expect(round(sent)).toEqual(sent);
  });

  it('leaves a tag it does not know rather than guessing', () => {
    const odd = { '~bin': 'BigInt64Array', b64: 'AAAA' };
    expect(fromWire(odd)).toEqual(odd);
  });
});
