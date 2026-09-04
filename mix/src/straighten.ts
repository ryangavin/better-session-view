import { resample } from './resample.ts';
import { beatAt, resampled, tempoOf, BEATS_PER_BAR, type Beats } from './warp.ts';

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
 *
 * **One tempo is a special case, not the case.** A band slows into the last
 * chorus and a record cut to tape wanders all night; a single speed lays such
 * a song's average on the grid and everything else beside it, a bar out by
 * the end. So a ruling may carry the beat map instead, and then the record is
 * played a beat at a time — each beat's span at whatever speed puts its far
 * end on the next line of the output grid. The speed changes at the beats
 * and nowhere else, which is where the tempo changed; between two beats
 * nothing is touched, so the drummer is left alone exactly as before.
 *
 * A varispeed that moves is still a varispeed nobody can hear, because the
 * thing it is following is what the record already did.
 */

export interface Straightened {
  channels: Float32Array[];
  rate: number;
  /** Whole bars, the last of which may end in silence. */
  bars: number;
  seconds: number;
  /** How much slower than the record it plays: `to / bpm`, and its average where the map moves. */
  speed: number;
}

export interface Ruling {
  /** The tempo the record was measured at. */
  bpm: number;
  /** Seconds from the top of the record to 1.1.1. */
  offset: number;
  /** The tempo to lay it at. */
  to: number;
  /**
   * Where the beats actually fall, when that is known.
   *
   * The map is the truth where there is one: `bpm` and `offset` are the line
   * drawn through it, kept for whoever is only reading numbers. Counted in
   * whatever rate it was made at — a stem decoded to another one is fine, the
   * map is read across.
   */
  beats?: Beats;
}

export function straightened(channels: readonly Float32Array[], rate: number, ruling: Ruling): Straightened {
  const longest = Math.max(0, ...channels.map((c) => c.length));
  if (ruling.beats) return following(channels, rate, ruling.to, resampled(ruling.beats, rate, longest), longest);
  const speed = ruling.to / ruling.bpm;
  // Laid at its own tempo, the record is not resampled at all: from a whole
  // sample at a speed of one, the output is the input, bit for bit.
  const from = speed === 1 ? Math.round(ruling.offset * rate) : ruling.offset * rate;
  const bar = (BEATS_PER_BAR * 60 * rate) / ruling.to;
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

/**
 * The same laying, followed beat by beat.
 *
 * The output grid is fixed — beat `b` of the song is `b × spacing` samples in,
 * from 1.1.1 at zero — so each beat's span is read at the one speed that fills
 * it: the beats' distance over the grid's. Beats past the last beat carry
 * on at the last spacing, which is what the map says about them.
 *
 * The spans are resampled against the whole channel rather than against a
 * copy of themselves, so a boundary is a change of speed and not an edit:
 * the sinc still reaches either side of it and no join can be heard.
 */
function following(
  channels: readonly Float32Array[],
  rate: number,
  to: number,
  beats: Beats,
  longest: number,
): Straightened {
  const spacing = (60 * rate) / to;
  const bar = BEATS_PER_BAR * spacing;
  const bars = Math.max(1, Math.ceil((beatAt(beats, longest) * spacing) / bar - 1e-6));
  const length = Math.round(bars * bar);
  const out = channels.map(() => new Float32Array(length));
  const { samples, first } = beats;
  for (let beat = 0; beat * spacing < length; beat++) {
    const i = Math.max(0, Math.min(samples.length - 2, beat - first));
    const step = samples[i + 1] - samples[i];
    const speed = step / spacing;
    const source = samples[i] + (beat - first - i) * step;
    const start = Math.max(0, Math.ceil(beat * spacing));
    const upto = Math.min(length, Math.ceil((beat + 1) * spacing));
    if (upto <= start) continue;
    const from = source + (start - beat * spacing) * speed;
    channels.forEach((channel, c) => out[c].set(resample(channel, speed, from, upto - start), start));
  }
  return { channels: out, rate, bars, seconds: length / rate, speed: to / tempoOf(beats) };
}
