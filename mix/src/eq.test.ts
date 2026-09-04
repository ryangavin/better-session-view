import { describe, expect, it } from 'vitest';
import {
  BAND,
  BUTTERWORTH_DB,
  BUTTERWORTH_Q,
  FLAT,
  HIGH_BEGINS,
  isFlat,
  KILL,
  linearOf,
  LOW_ENDS,
  Split,
  type Bands,
} from './eq.ts';

/**
 * The numbers the graph is set from, and — the part that used to go untested —
 * the crossover those numbers add up to.
 *
 * Web Audio only runs in a window, so `Split` is given a recording context
 * here: fake gain and biquad nodes that remember their type, their parameters
 * and what they were connected to. Walking that recording gives the three legs
 * as the browser would build them, and each leg is then evaluated against the
 * *spec's* biquad formulas, written out below from the W3C definition rather
 * than derived from anything in `eq.ts`. So these tests are not the code
 * agreeing with itself: they ask whether the topology and the Q values this
 * file chooses are a crossover that sums flat, and they are free to say no.
 */

/** A sample rate to evaluate at; every biquad is defined against one. */
const RATE = 48000;

interface Complex {
  re: number;
  im: number;
}

const mul = (x: Complex, y: Complex): Complex => ({
  re: x.re * y.re - x.im * y.im,
  im: x.re * y.im + x.im * y.re,
});
const add = (x: Complex, y: Complex): Complex => ({ re: x.re + y.re, im: x.im + y.im });
const scale = (x: Complex, k: number): Complex => ({ re: x.re * k, im: x.im * k });
const decibels = (x: Complex): number => 20 * Math.log10(Math.hypot(x.re, x.im));

/**
 * A biquad's response at one frequency, straight out of the specification.
 *
 * The W3C definition is the whole point of writing this out: `Q` reaches a
 * lowpass or a highpass through α_{Q_dB} = sin(ω₀) / (2 · 10^(Q/20)), which
 * reads the parameter as decibels, and reaches an allpass through
 * α_Q = sin(ω₀) / (2Q), which reads it as a plain Q. Nothing here consults
 * `eq.ts` about which is which — that is what is under test.
 */
const response = (type: BiquadFilterType, corner: number, q: number, at: number): Complex => {
  const w0 = (2 * Math.PI * corner) / RATE;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alphaQ = sin / (2 * q);
  const alphaQdB = sin / (2 * 10 ** (q / 20));

  let b: [number, number, number];
  let a: [number, number, number];
  if (type === 'lowpass') {
    b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    a = [1 + alphaQdB, -2 * cos, 1 - alphaQdB];
  } else if (type === 'highpass') {
    b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    a = [1 + alphaQdB, -2 * cos, 1 - alphaQdB];
  } else if (type === 'allpass') {
    b = [1 - alphaQ, -2 * cos, 1 + alphaQ];
    a = [1 + alphaQ, -2 * cos, 1 - alphaQ];
  } else {
    throw new Error(`no formula written for ${type}`);
  }

  const w = (2 * Math.PI * at) / RATE;
  const term = (c: [number, number, number]): Complex => ({
    re: c[0] + c[1] * Math.cos(-w) + c[2] * Math.cos(-2 * w),
    im: c[1] * Math.sin(-w) + c[2] * Math.sin(-2 * w),
  });
  const num = term(b);
  const den = term(a);
  const d = den.re * den.re + den.im * den.im;
  return { re: (num.re * den.re + num.im * den.im) / d, im: (num.im * den.re - num.re * den.im) / d };
};

/**
 * A parameter that remembers being ramped, and separately remembers being set.
 *
 * Writing `value` is the jump a ramp exists to avoid, so it goes through an
 * accessor and lands in `steps`; a ramp moves the same reading without leaving
 * one. That distinction is the whole of the last test.
 */
class FakeParam {
  private held: number;
  readonly ramps: { to: number; at: number }[] = [];
  readonly holds: { to: number; at: number }[] = [];
  readonly steps: number[] = [];

  constructor(initial: number) {
    this.held = initial;
  }

  get value(): number {
    return this.held;
  }

  set value(to: number) {
    this.steps.push(to);
    this.held = to;
  }

  cancelScheduledValues(): void {}

  setValueAtTime(to: number, at: number): void {
    this.holds.push({ to, at });
  }

  linearRampToValueAtTime(to: number, at: number): void {
    this.ramps.push({ to, at });
    this.held = to;
  }
}

const fakeParam = (initial: number): FakeParam => new FakeParam(initial);

interface FakeNode {
  kind: 'gain' | 'biquad';
  /** Only a biquad has one; a gain node leaves it undefined, as the walk expects. */
  type?: BiquadFilterType;
  gain?: FakeParam;
  frequency?: FakeParam;
  Q?: FakeParam;
  to: FakeNode[];
  connect(node: FakeNode): void;
  disconnect(): void;
}

const fakeNode = (kind: 'gain' | 'biquad'): FakeNode => {
  const node: FakeNode = {
    kind,
    to: [],
    connect(next: FakeNode) {
      node.to.push(next);
    },
    disconnect() {
      node.to.length = 0;
    },
  };
  if (kind === 'gain') node.gain = fakeParam(1);
  else {
    // The node defaults a browser ships with, so a parameter left alone shows.
    node.type = 'lowpass';
    node.frequency = fakeParam(350);
    node.Q = fakeParam(1);
  }
  return node;
};

/** Enough of a context to build a `Split` in, and to read back what it built. */
const recorder = () => ({
  createGain: () => fakeNode('gain'),
  createBiquadFilter: () => fakeNode('biquad'),
});

/** One path from input to output: the sections it passes and the gain it lands on. */
interface Leg {
  sections: { type: BiquadFilterType; corner: number; q: number }[];
  gain: number;
}

/** Every route through the recorded graph, found by walking it rather than assuming it. */
const legsOf = (input: FakeNode, output: FakeNode): Leg[] => {
  const found: Leg[] = [];
  const walk = (node: FakeNode, sections: Leg['sections'], gain: number): void => {
    if (node === output) {
      found.push({ sections, gain });
      return;
    }
    const nextSections =
      node.kind === 'biquad'
        ? [
            ...sections,
            {
              type: node.type as BiquadFilterType,
              corner: (node.frequency as FakeParam).value,
              q: (node.Q as FakeParam).value,
            },
          ]
        : sections;
    const nextGain = node.kind === 'gain' && node !== input ? gain * (node.gain as FakeParam).value : gain;
    for (const next of node.to) walk(next, nextSections, nextGain);
  };
  walk(input, [], 1);
  return found;
};

/** How the sections are allowed to be bent, for the variants a test needs to fail. */
interface Bend {
  /** Read the filter Q as plain and the allpass Q as decibels — the swap. */
  swapUnits?: boolean;
  /** Leave the allpass out, to find out whether it was holding anything up. */
  dropAllpass?: boolean;
}

const legResponse = (leg: Leg, at: number, bend: Bend = {}): Complex => {
  let h: Complex = { re: leg.gain, im: 0 };
  for (const s of leg.sections) {
    if (s.type === 'allpass' && bend.dropAllpass) continue;
    const q = bend.swapUnits ? (s.type === 'allpass' ? BUTTERWORTH_DB : BUTTERWORTH_Q) : s.q;
    h = mul(h, response(s.type, s.corner, q, at));
  }
  return h;
};

const sumAt = (legs: Leg[], at: number, bend: Bend = {}): Complex =>
  legs.reduce<Complex>((acc, leg) => add(acc, legResponse(leg, at, bend)), { re: 0, im: 0 });

/** The graph a `Split` builds for one setting of the knobs. */
const built = (bands: Bands = FLAT): { legs: Leg[]; input: FakeNode; output: FakeNode; split: Split } => {
  const ctx = recorder();
  const split = new Split(ctx as unknown as BaseAudioContext);
  if (bands !== FLAT) split.apply(bands, 0, 0);
  const input = split.input as unknown as FakeNode;
  const output = split.output as unknown as FakeNode;
  return { legs: legsOf(input, output), input, output, split };
};

/** The worst departure from unity across the audible span, and where it is. */
const flatness = (legs: Leg[], bend: Bend = {}): { worst: number; at: number } => {
  let worst = 0;
  let at = 20;
  for (let i = 0; i <= 1200; i++) {
    const f = 20 * 1000 ** (i / 1200);
    const d = decibels(sumAt(legs, f, bend));
    if (Math.abs(d) > Math.abs(worst)) {
      worst = d;
      at = f;
    }
  }
  return { worst, at };
};

/** The one leg that carries a band, picked out by the corner its sections sit on. */
const band = (legs: Leg[], which: 'low' | 'mid' | 'high', bands: Bands): Leg => {
  const has = (leg: Leg, type: BiquadFilterType, corner: number): boolean =>
    leg.sections.some((s) => s.type === type && Math.abs(s.corner - corner) < 0.5);
  const found = legs.filter((leg) =>
    which === 'low'
      ? has(leg, 'lowpass', bands.lowEnds)
      : which === 'mid'
        ? has(leg, 'highpass', bands.lowEnds) && has(leg, 'lowpass', bands.highBegins)
        : has(leg, 'highpass', bands.highBegins),
  );
  expect(found).toHaveLength(1);
  return found[0];
};

describe('a band gain', () => {
  it('is unity at zero', () => {
    expect(linearOf(0)).toBe(1);
  });

  it('is half amplitude six down, as decibels say', () => {
    expect(linearOf(-6.0206)).toBeCloseTo(0.5, 4);
  });

  it('is silence at the stop, not a very quiet band', () => {
    expect(linearOf(KILL)).toBe(0);
    expect(linearOf(KILL - 10)).toBe(0);
    expect(linearOf(KILL + 0.1)).toBeGreaterThan(0);
  });

  it('is the bottom of the knob', () => {
    expect(BAND.min).toBe(KILL);
    expect(BAND.defaultValue).toBe(0);
  });
});

describe('the cuts', () => {
  it('meet at a kilohertz rather than overlap, so the low can never end above the high', () => {
    expect(LOW_ENDS.max).toBeLessThanOrEqual(HIGH_BEGINS.min);
  });

  it('rest where the bands say they do', () => {
    expect(LOW_ENDS.defaultValue).toBe(FLAT.lowEnds);
    expect(HIGH_BEGINS.defaultValue).toBe(FLAT.highBegins);
  });
});

describe('a Butterworth section', () => {
  it('is minus three decibels where the node wants decibels, and 0.707 where it wants a Q', () => {
    expect(BUTTERWORTH_DB).toBeCloseTo(-3.0103, 3);
    expect(BUTTERWORTH_Q).toBeCloseTo(0.7071, 3);
    expect(10 ** (BUTTERWORTH_DB / 20)).toBeCloseTo(BUTTERWORTH_Q, 6);
  });
});

describe('flat', () => {
  it('is every band at rest', () => {
    expect(isFlat(FLAT)).toBe(true);
    expect(isFlat({ ...FLAT, mid: 0.5 })).toBe(false);
    expect(isFlat({ ...FLAT, lowEnds: 300 })).toBe(false);
  });
});

describe('the crossover', () => {
  it('is three bands and nothing else between the input and the output', () => {
    const { legs } = built();
    expect(legs).toHaveLength(3);
    for (const leg of legs) expect(leg.gain).toBe(1);
  });

  it('sums flat from twenty hertz to twenty kilohertz, wherever the cuts are put', () => {
    // Both extremes of both knobs, and the setting where the two ranges meet
    // and the cuts land on the same frequency — the case a crossover hung off
    // the input three times cannot survive.
    const settings: Bands[] = [
      FLAT,
      { ...FLAT, lowEnds: LOW_ENDS.min, highBegins: HIGH_BEGINS.max },
      { ...FLAT, lowEnds: LOW_ENDS.max, highBegins: HIGH_BEGINS.min },
      { ...FLAT, lowEnds: 250, highBegins: 1000 },
      { ...FLAT, lowEnds: 800, highBegins: 4000 },
    ];
    for (const bands of settings) {
      const { worst, at } = flatness(built(bands).legs);
      expect(Math.abs(worst), `${worst.toFixed(3)} dB at ${at.toFixed(0)} Hz for ${JSON.stringify(bands)}`).toBeLessThan(
        0.01,
      );
    }
  });

  it('is six down on each band at its own corner, so the bands meet rather than overlap', () => {
    const bands = FLAT;
    const { legs } = built(bands);
    const six = -20 * Math.log10(2);
    expect(decibels(legResponse(band(legs, 'low', bands), bands.lowEnds))).toBeCloseTo(six, 2);
    expect(decibels(legResponse(band(legs, 'mid', bands), bands.lowEnds))).toBeCloseTo(six, 2);
    expect(decibels(legResponse(band(legs, 'mid', bands), bands.highBegins))).toBeCloseTo(six, 2);
    expect(decibels(legResponse(band(legs, 'high', bands), bands.highBegins))).toBeCloseTo(six, 2);
  });

  it('reads Q as decibels on the filters and as a plain Q on the allpass', () => {
    const { legs } = built();
    const sections = legs.flatMap((leg) => leg.sections);
    for (const s of sections) {
      if (s.type === 'allpass') expect(s.q).toBe(BUTTERWORTH_Q);
      else expect(s.q).toBe(BUTTERWORTH_DB);
    }
    expect(sections.some((s) => s.type === 'allpass')).toBe(true);

    // And the swap is not a rounding difference: reading the same numbers the
    // other way round puts several decibels of bump at the second cut, which
    // is the failure the file's own comment names.
    const { worst } = flatness(legs, { swapUnits: true });
    expect(Math.abs(worst)).toBeGreaterThan(3);
  });

  it('is holding the sum up with the allpass, not carrying it for decoration', () => {
    // Wide apart, the allpass barely earns its keep — a tenth of a decibel.
    const wide = built().legs;
    expect(Math.abs(flatness(wide, { dropAllpass: true }).worst)).toBeGreaterThan(0.01);

    // Close together it is the whole thing: without it the two halves of the
    // second cut arrive out of phase with the low band and dig a hole.
    const near = built({ ...FLAT, lowEnds: LOW_ENDS.max, highBegins: HIGH_BEGINS.min }).legs;
    expect(Math.abs(flatness(near, { dropAllpass: true }).worst)).toBeGreaterThan(6);
  });

  it('is silence in a killed band, not a quiet band still leaking into the sum', () => {
    const bands: Bands = { ...FLAT, low: KILL };
    const { legs } = built(bands);
    expect(band(legs, 'low', bands).gain).toBe(0);
    // Well below the low cut there is nothing else to hear, so all that is
    // left is the mid band's skirt on its way down: silence, not a quiet low.
    expect(decibels(sumAt(legs, 50))).toBeLessThan(-50);
    expect(decibels(sumAt(legs, 25))).toBeLessThan(-70);
    // And the two bands left are untouched by their neighbour's stop.
    expect(decibels(sumAt(legs, 8000))).toBeCloseTo(0, 2);
  });

  it('ramps a corner moved during playback rather than stepping it', () => {
    const { split, input, output } = built();
    const before = legsOf(input, output);
    const corners = before.flatMap((leg) => leg.sections.map((s) => s.corner));
    expect(corners).toContain(FLAT.lowEnds);

    const nodes: FakeNode[] = [];
    const collect = (node: FakeNode, seen = new Set<FakeNode>()): void => {
      if (seen.has(node)) return;
      seen.add(node);
      nodes.push(node);
      for (const next of node.to) collect(next, seen);
    };
    collect(input);
    const params = nodes.flatMap((n) => [n.frequency, n.gain].filter((p): p is FakeParam => !!p));
    for (const p of params) p.steps.length = 0;

    split.apply({ ...FLAT, lowEnds: 400, high: -6 }, 2, 0.02);

    const moved = params.filter((p) => p.ramps.length > 0);
    expect(moved.length).toBeGreaterThan(0);
    for (const p of moved) {
      expect(p.ramps.at(-1)).toEqual({ to: p.value, at: 2.02 });
      // A ramp starts from where the parameter already was, held at `now`.
      expect(p.holds.at(-1)?.at).toBe(2);
    }
    // Nothing was written straight onto a parameter: that is the zip.
    for (const p of params) expect(p.steps).toEqual([]);
    expect(params.filter((p) => p.ramps.some((r) => r.to === 400))).toHaveLength(4);
  });
});
