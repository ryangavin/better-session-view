import type { Param } from '@openflow/widgets/param/param.ts';

/**
 * Three bands per stem, and the two places they meet.
 *
 * The shape is a DJ isolator rather than a shelving EQ: the spectrum is cut
 * into a low, a mid and a high, each with its own gain, and the two cuts are
 * where the *knobs* say they are. Moving a cut moves the border between two
 * bands — the low band ends where the mid begins — which is what the two
 * frequency controls on a British console's mid section do, turned into a
 * pair of dividers.
 *
 * **None of the filtering is written here.** The browser ships the filters:
 * a `BiquadFilterNode` is the RBJ cookbook, and a Linkwitz-Riley crossover is
 * two Butterworth sections of it in a row. This file only says which nodes
 * to make and what to set them to, which is exactly the part that has to
 * agree with the knobs.
 *
 * ```
 *              ┌─ LP(a) ─ LP(a) ─ AP(b) ──────────── gain(low)  ─┐
 *   input ─────┤                    ┌─ LP(b) ─ LP(b) ─ gain(mid) ─┼─ output
 *              └─ HP(a) ─ HP(a) ────┤                             │
 *                                   └─ HP(b) ─ HP(b) ─ gain(high)─┘
 *   a = where the low band ends, b = where the high band begins
 * ```
 *
 * The cuts are a tree, not three taps off the input: the first divides low
 * from everything above it, and the second divides that remainder again. The
 * high band therefore comes through the first cut's highpass as well, which
 * is what lets the mid and the high add back to exactly what the first cut
 * handed them. Hanging the high band straight off the input instead is a hole
 * at the second cut that only closes when the two cuts are octaves apart —
 * and the knobs can put them both at a kilohertz.
 *
 * The allpass on the low band is what makes the three sum back to flat. The
 * mid and high have both been through the second cut, and a pair of LR4
 * halves adds up to a second-order allpass at that frequency; the low band is
 * put through the same one so that, with every gain at unity, the output is
 * the input in magnitude — which is what "flat" has to mean if the knobs are
 * ever going to be trusted at rest.
 */

/** Decibels for the three bands; hertz for the two cuts. */
export interface Bands {
  low: number;
  mid: number;
  high: number;
  /** Where the low band hands over to the mid. */
  lowEnds: number;
  /** Where the mid hands over to the high. */
  highBegins: number;
}

/** Every band at unity, and the cuts where Live's EQ Three rests them. */
export const FLAT: Bands = { low: 0, mid: 0, high: 0, lowEnds: 250, highBegins: 2500 };

/**
 * The bottom of a band's travel is silence, not a very quiet band.
 *
 * An isolator that cannot kill is a tone control; the whole point of dividing
 * the spectrum is to take a piece of it out. The knob reads `-36.0 dB` at the
 * stop, since a parameter with an infinite range has no taper to turn, and the
 * graph reads that stop as zero.
 */
export const KILL = -36;

export const BAND: Param = { kind: 'float', min: KILL, max: 12, defaultValue: 0, unit: 'decibel' };

/**
 * The cuts, tapered so the octaves are evenly spread across the turn.
 *
 * A power of three over these ranges is within a few percent of logarithmic,
 * which is the taper every frequency knob has and the one the parameter model
 * can express. The two ranges meet at a kilohertz rather than overlap, so a
 * low band can never be asked to end above where the high one begins.
 */
export const LOW_ENDS: Param = {
  kind: 'float',
  min: 40,
  max: 1000,
  defaultValue: FLAT.lowEnds,
  unit: 'hertz',
  exponent: 3,
  name: 'Low band ends',
  shortName: 'Low ends',
};

export const HIGH_BEGINS: Param = {
  kind: 'float',
  min: 1000,
  max: 16000,
  defaultValue: FLAT.highBegins,
  unit: 'hertz',
  exponent: 3,
  name: 'High band begins',
  shortName: 'High from',
};

/** A band's gain, as the graph needs it: silence at the stop, unity at zero. */
export const linearOf = (db: number): number => (db <= KILL ? 0 : 10 ** (db / 20));

/** Whether nothing has been moved, to within what a knob can resolve. */
export const isFlat = (bands: Bands): boolean =>
  (Object.keys(FLAT) as (keyof Bands)[]).every((k) => Math.abs(bands[k] - FLAT[k]) < 0.001);

/**
 * A Butterworth section, spelled the two ways a biquad node wants it.
 *
 * The lowpass and highpass types take their `Q` in decibels — the spec's
 * α_{Q_dB} — so the maximally flat section is minus three, not 0.707. The
 * allpass takes a plain Q. Getting these the wrong way round is a crossover
 * with a bump at every cut, which nobody would report as a bug and everybody
 * would hear.
 */
export const BUTTERWORTH_DB = 20 * Math.log10(Math.SQRT1_2);
export const BUTTERWORTH_Q = Math.SQRT1_2;

/** A parameter is moved by a ramp, so a knob turned during playback does not zip. */
const glide = (param: AudioParam, to: number, now: number, ramp: number): void => {
  if (Math.abs(param.value - to) < 0.0005 * Math.max(1, Math.abs(to))) return;
  if (ramp <= 0) {
    param.value = to;
    return;
  }
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + ramp);
};

/**
 * The split for one stem: an input, an output, and the three bands between.
 *
 * The frequencies are held on the nodes and the gains on three `GainNode`s,
 * so this is a thing to *set* rather than a thing to rebuild — a knob turned
 * while playing is a ramp on a parameter, never a new graph.
 */
export class Split {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly atLowEnd: BiquadFilterNode[];
  private readonly atHighStart: BiquadFilterNode[];
  private readonly gains: Record<'low' | 'mid' | 'high', GainNode>;

  constructor(ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    const section = (type: BiquadFilterType): BiquadFilterNode => {
      const node = ctx.createBiquadFilter();
      node.type = type;
      node.Q.value = type === 'allpass' ? BUTTERWORTH_Q : BUTTERWORTH_DB;
      return node;
    };
    const chain = (...nodes: AudioNode[]): void => {
      for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
    };

    const lowA = [section('lowpass'), section('lowpass')];
    const midA = [section('highpass'), section('highpass')];
    const midB = [section('lowpass'), section('lowpass')];
    const highB = [section('highpass'), section('highpass')];
    const lowB = section('allpass');

    this.gains = { low: ctx.createGain(), mid: ctx.createGain(), high: ctx.createGain() };
    chain(this.input, ...lowA, lowB, this.gains.low, this.output);
    chain(this.input, ...midA, ...midB, this.gains.mid, this.output);
    chain(midA[midA.length - 1], ...highB, this.gains.high, this.output);

    this.atLowEnd = [...lowA, ...midA];
    this.atHighStart = [...midB, ...highB, lowB];
    this.apply(FLAT, 0, 0);
  }

  /** Move every parameter to where the bands say, ramped from wherever it is. */
  apply(bands: Bands, now: number, ramp: number): void {
    for (const node of this.atLowEnd) glide(node.frequency, bands.lowEnds, now, ramp);
    for (const node of this.atHighStart) glide(node.frequency, bands.highBegins, now, ramp);
    glide(this.gains.low.gain, linearOf(bands.low), now, ramp);
    glide(this.gains.mid.gain, linearOf(bands.mid), now, ramp);
    glide(this.gains.high.gain, linearOf(bands.high), now, ramp);
  }

  disconnect(): void {
    this.input.disconnect();
    this.output.disconnect();
  }
}
