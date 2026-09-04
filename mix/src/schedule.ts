import { outputOf, sourceOf, speedAt, type Pinned } from './pinned.ts';

/**
 * How a pinned record is played: the maths, with nothing of Web Audio in it.
 *
 * With warp on, the stems play at the *header's* tempo, and where the record
 * is pinned to that grid — `pinned.ts` — is where the speed changes. Pinned
 * per beat that is Live's clip following the Set, every beat in the time the
 * tempo gives a beat; pinned per section it is one speed a section. What the
 * stretcher needs from it is a list of boundaries: at this output time, read
 * the file from here, this fast. What the playhead needs is the inverse:
 * this far into the output, where in the file is the sound. Both are here
 * because they have to agree, and because neither can be tested if it lives
 * inside an audio graph.
 */
/**
 * The stretch of the file being played round and round, in file seconds.
 *
 * A loop over a section rather than over the record: the pass ends at `to`
 * instead of at the last sample, and the next one starts at `from` instead of
 * at the top. Nothing else changes — the boundaries inside it are the same
 * boundaries, because a loop is a choice about where playback turns round and
 * not a different way of reading the file.
 */
export interface Span {
  from: number;
  to: number;
}

/** The whole file, which is what a span is when nobody has picked one. */
export const whole = (pinned: Pinned): Span => ({ from: 0, to: pinned.length / pinned.rate });

/** One straight stretch of playback: from one pin to the next. */
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

/**
 * The boundaries of one pass from `from` seconds into the file: one where it
 * starts, and one at every pin after it, in output time from the start.
 *
 * A pin is where the rate may change, so it is where a boundary has to be —
 * and the only place. Between two pins the record runs at one speed: their
 * distance in the record over their distance on the grid.
 */
export function passOf(pinned: Pinned, from: number, span?: Span): Pass {
  const { rate } = pinned;
  const { from: opens, to: closes } = held(pinned, span);
  const start = Math.max(opens, Math.min(from, closes));
  const origin = outputOf(pinned, start * rate);
  const boundaries: Boundary[] = [{ output: 0, input: start, rate: speedAt(pinned, origin) }];
  for (const pin of pinned.pins) {
    const at = pin.source / rate;
    if (at <= start || at >= closes) continue;
    boundaries.push({ output: (pin.output - origin) / rate, input: at, rate: speedAt(pinned, pin.output) });
  }
  return { from: start, boundaries, length: Math.max(0, (outputOf(pinned, closes * rate) - origin) / rate) };
}

/**
 * A span made safe: inside the file, and the right way round.
 *
 * A span from the window is bars turned into seconds, and bars outlive the
 * file they were counted on — a slice at bar 60 of a track that was replaced
 * by a shorter one is a loop off the end. Held rather than refused, because
 * the loop is how somebody is listening and not something to be correct
 * about; a span with nothing in it is the whole file, which is what they had
 * before they asked.
 */
export function held(pinned: Pinned, span?: Span): Span {
  const seconds = pinned.length / pinned.rate;
  if (!span) return { from: 0, to: seconds };
  const from = Math.max(0, Math.min(span.from, seconds));
  const to = Math.max(0, Math.min(span.to, seconds));
  return to - from > 0.001 ? { from, to } : { from: 0, to: seconds };
}

/**
 * Where in the file the sound is, `elapsed` output seconds into a pass.
 *
 * Read off the audio clock rather than the node, which reports where it is
 * only every so often and only by message. The map is what was scheduled, so
 * this is what is playing to the sample as long as the boundaries went in.
 * Looping runs to the end of the span and back in at its start — the whole
 * file, unless somebody has picked a section — as the transport's straight
 * path does; not looping, it holds at the end.
 */
export function sourceAt(pinned: Pinned, from: number, elapsed: number, looping: boolean, span?: Span): number {
  const { rate } = pinned;
  const { from: opens, to: closes } = held(pinned, span);
  let start = Math.max(0, Math.min(from, pinned.length / rate));
  let left = Math.max(0, elapsed);
  const end = outputOf(pinned, closes * rate);
  for (let pass = 0; pass < 10000; pass++) {
    const origin = outputOf(pinned, start * rate);
    const length = (end - origin) / rate;
    if (!(length > 0)) return closes;
    if (left < length) return sourceOf(pinned, origin + left * rate) / rate;
    if (!looping) return closes;
    left -= length;
    start = opens;
  }
  return closes;
}

/**
 * Whether playing this pinning would change nothing worth hearing.
 *
 * A record made to a click, played at its own tempo, is every pin within a
 * per cent of one — and the per cent is the detector's scatter on where a
 * kick began, not the record moving. A stretcher at a rate of one is still a
 * stretcher, not the samples, so that case plays through the plain sources.
 * Ask for a tempo a twentieth of a per cent away and it stretches.
 */
export function straight(pinned: Pinned): boolean {
  const { pins } = pinned;
  const first = pins[0];
  const last = pins[pins.length - 1];
  if (Math.abs((last.source - first.source) / (last.output - first.output) - 1) > 0.0005) return false;
  return passOf(pinned, 0).boundaries.every((b) => Math.abs(b.rate - 1) < 0.01);
}
