import { beatAt, sampleOf, tempoOf, type Beats } from './warp.ts';

/**
 * How a map is played at a tempo: the maths, with nothing of Web Audio in it.
 *
 * With warp on, the stems play at the *header's* tempo and every beat of the
 * map is stretched to fit — a beat that took 0.47 seconds on the record takes
 * 60 over the target, whatever it took on the record. That is Live's rule for
 * a clip following the Set. What the stretcher needs from it is a list of
 * boundaries: at this output time, read the file from here, this fast. What
 * the playhead needs is the inverse: this far into the output, where in the
 * file is the sound. Both are here because they have to agree, and because
 * neither can be tested if it lives inside an audio graph.
 */

/** One straight stretch of playback: from one anchor to the next. */
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

/** Output seconds per beat at a tempo. */
const perBeat = (tempo: number): number => 60 / tempo;

/**
 * The boundaries of one pass from `from` seconds into the file: one where it
 * starts, and one at every anchor after it, in output time from the start.
 *
 * An anchor is where the rate may change, so it is where a boundary has to be —
 * and the only place. Between two anchors the record ran at one spacing, and
 * one rate plays it at another: the record's seconds for that beat over the
 * target's.
 */
export function passOf(beats: Beats, tempo: number, from: number): Pass {
  const seconds = beats.length / beats.rate;
  const start = Math.max(0, Math.min(from, seconds));
  const startBeat = beatAt(beats, start * beats.rate);
  const boundaries: Boundary[] = [];
  const spacing = (beat: number): number => {
    const i = Math.max(0, Math.min(beats.samples.length - 2, Math.floor(beat - beats.first)));
    return (beats.samples[i + 1] - beats.samples[i]) / beats.rate;
  };
  boundaries.push({ output: 0, input: start, rate: spacing(startBeat) / perBeat(tempo) });
  for (let i = 0; i < beats.samples.length; i++) {
    const at = beats.samples[i] / beats.rate;
    if (at <= start || at >= seconds) continue;
    const beat = beats.first + i;
    boundaries.push({ output: (beat - startBeat) * perBeat(tempo), input: at, rate: spacing(beat) / perBeat(tempo) });
  }
  const endBeat = beatAt(beats, beats.length);
  return { from: start, boundaries, length: Math.max(0, (endBeat - startBeat) * perBeat(tempo)) };
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
export function sourceAt(beats: Beats, tempo: number, from: number, elapsed: number, looping: boolean): number {
  const seconds = beats.length / beats.rate;
  let start = Math.max(0, Math.min(from, seconds));
  let left = Math.max(0, elapsed);
  const endBeat = beatAt(beats, beats.length);
  for (let pass = 0; pass < 10000; pass++) {
    const startBeat = beatAt(beats, start * beats.rate);
    const length = (endBeat - startBeat) * perBeat(tempo);
    if (!(length > 0)) return seconds;
    if (left < length) return sampleOf(beats, startBeat + left / perBeat(tempo)) / beats.rate;
    if (!looping) return seconds;
    left -= length;
    start = 0;
  }
  return seconds;
}

/**
 * Whether playing this map at this tempo would change nothing worth hearing.
 *
 * A record made to a click, played at its own tempo, is every beat within a
 * per cent of one — and the per cent is the detector's scatter on where a kick
 * began, not the record moving. A stretcher at a rate of one is still a
 * stretcher, not the samples, so that case plays through the plain sources.
 * Ask for a tempo a twentieth of a per cent away and it stretches.
 */
export function straight(beats: Beats, tempo: number): boolean {
  if (Math.abs(tempoOf(beats) - tempo) > tempo * 0.0005) return false;
  return passOf(beats, tempo, 0).boundaries.every((b) => Math.abs(b.rate - 1) < 0.01);
}
