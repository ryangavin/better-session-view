import { resample } from './resample.ts';
import { BEATS_PER_BAR } from './warp.ts';

/**
 * A record laid straight at a whole tempo, from its first downbeat.
 *
 * What a loop off a sample pack is: it starts on 1.1.1, it runs a whole
 * number of bars, and its tempo is the number on the box. Dropped into Live
 * it needs no warping, because the grid is the file.
 *
 * A song measured at 128.055 with its downbeat at 1.41 s is played from
 * 1.41 s at 128/128.055 of its speed — four hundredths of a percent, which
 * is a varispeed nobody can hear — so that its beats land exactly a
 * sixtieth of 128 apart, and it is padded with silence to the end of its
 * last bar rather than cut, so nothing of the outro is lost. Push and pull
 * inside the beats are left exactly as they were played: this is a
 * straightening of the grid, not of the drummer.
 */

export interface Straightened {
  channels: Float32Array[];
  rate: number;
  /** Whole bars, the last of which may end in silence. */
  bars: number;
  seconds: number;
  /** How much slower than the record it plays: `to / bpm`. */
  speed: number;
}

export interface Ruling {
  /** The tempo the record was measured at. */
  bpm: number;
  /** Seconds from the top of the record to 1.1.1. */
  offset: number;
  /** The tempo to lay it at. */
  to: number;
}

export function straightened(channels: readonly Float32Array[], rate: number, ruling: Ruling): Straightened {
  const speed = ruling.to / ruling.bpm;
  // Laid at its own tempo, the record is not resampled at all: from a whole
  // sample at a speed of one, the output is the input, bit for bit.
  const from = speed === 1 ? Math.round(ruling.offset * rate) : ruling.offset * rate;
  const bar = (BEATS_PER_BAR * 60 * rate) / ruling.to;
  const longest = Math.max(0, ...channels.map((c) => c.length));
  const remaining = Math.max(0, longest - from) / speed;
  const bars = Math.max(1, Math.ceil(remaining / bar - 1e-6));
  const length = Math.round(bars * bar);
  return {
    channels: channels.map((c) => resample(c, speed, from, length)),
    rate,
    bars,
    seconds: length / rate,
    speed,
  };
}
