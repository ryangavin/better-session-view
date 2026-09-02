import { barAt, placeOf, tempoAt, type Bars } from './warp.ts';

/**
 * How a map is played at a tempo: the maths, with nothing of Web Audio in it.
 *
 * With warp on, the stems play at the *header's* tempo and every segment of
 * the map is stretched to fit — a bar that took 1.9 seconds to play takes
 * 240 over the target, whatever it took on the record. That is Live's rule
 * for a clip following the Set. What the stretcher needs from it is a list of
 * boundaries: at this output time, read the file from here, this fast. What
 * the playhead needs is the inverse: this far into the output, where in the
 * file is the sound. Both are here because they have to agree, and because
 * neither can be tested if it lives inside an audio graph.
 */

/** One straight stretch of playback. */
export interface Boundary {
  /** Seconds of output since the pass began, when this segment starts. */
  output: number;
  /** Seconds into the file it starts reading from. */
  input: number;
  /** File seconds per output second: over one to play faster than the record did. */
  rate: number;
}

/** One pass through the file from a point in it, at a tempo. */
export interface Pass {
  /** Where the pass began, in file seconds. */
  from: number;
  boundaries: Boundary[];
  /** How long the pass takes, in output seconds, to reach the end of the file. */
  length: number;
}

/** File seconds per output second inside the segment a bar is in. */
const rateAt = (bars: Bars, tempo: number, bar: number): number => tempo / tempoAt(bars, bar);

/**
 * The boundaries of one pass from `from` seconds into the file: one where it
 * starts, and one at every marker after it, in output time from the start.
 *
 * A marker is where the rate may change, so it is where a boundary has to be —
 * and the only place. Between two, the record ran at one tempo, and one rate
 * plays it at another.
 */
export function passOf(bars: Bars, tempo: number, from: number): Pass {
  const start = Math.max(0, Math.min(from, bars.seconds));
  const startBar = barAt(bars, bars.seconds > 0 ? start / bars.seconds : 0);
  const perBar = 240 / tempo;
  const boundaries: Boundary[] = [{ output: 0, input: start, rate: rateAt(bars, tempo, startBar) }];
  for (const marker of bars.markers) {
    if (marker.at <= start || marker.at >= bars.seconds) continue;
    boundaries.push({
      output: (marker.bar - startBar) * perBar,
      input: marker.at,
      rate: rateAt(bars, tempo, marker.bar),
    });
  }
  const length = Math.max(0, (barAt(bars, 1) - startBar) * perBar);
  return { from: start, boundaries, length };
}

/**
 * Where in the file the sound is, `elapsed` output seconds into a pass.
 *
 * Read off the audio clock rather than the node, which reports where it is
 * only every so often and only by message. The map is what was scheduled, so
 * this is what is playing to the sample as long as the boundaries went in.
 * Looping runs off the end of the file and back in at the top, as the
 * transport's straight path does; not looping, it holds at the end.
 */
export function sourceAt(bars: Bars, tempo: number, from: number, elapsed: number, looping: boolean): number {
  let start = Math.max(0, Math.min(from, bars.seconds));
  let left = Math.max(0, elapsed);
  for (let pass = 0; pass < 10000; pass++) {
    const startBar = barAt(bars, bars.seconds > 0 ? start / bars.seconds : 0);
    const length = (barAt(bars, 1) - startBar) * (240 / tempo);
    if (!(length > 0)) return bars.seconds;
    if (left < length) return placeOf(bars, startBar + (left * tempo) / 240) * bars.seconds;
    if (!looping) return bars.seconds;
    left -= length;
    start = 0;
  }
  return bars.seconds;
}

/**
 * Whether playing this map at this tempo would change nothing.
 *
 * A straight map at its own tempo is every rate within a hair of one, and a
 * stretcher at a rate of one is still a stretcher: not the samples, and not
 * bit-exact. That case plays through the plain sources instead.
 */
export const straight = (bars: Bars, tempo: number): boolean =>
  passOf(bars, tempo, 0).boundaries.every((b) => Math.abs(b.rate - 1) < 1e-4);
