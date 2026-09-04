import { pinnedOf, type Every, type Pinned } from './pinned.ts';
import { resample } from './resample.ts';
import { resampled, tempoOf, BEATS_PER_BAR, type Beats } from './warp.ts';

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
 * last bar rather than cut, so nothing of the outro is lost.
 *
 * **One tempo is a special case, not the case.** A band slows into the last
 * chorus and a record cut to tape wanders all night; a single speed lays such
 * a song's average on the grid and everything else beside it, a bar out by
 * the end. So a ruling may carry the beat map instead, and then the record
 * is pinned to the grid — `pinned.ts` — and played a pin at a time, each
 * span at the one speed that puts its far end on the next pin. The speed
 * changes at the pins and nowhere else; between two pins nothing is touched.
 *
 * **How densely it is pinned is the whole of the difference between a loop
 * and a squash.** Pinned per beat, every beat lands on its line, and what
 * was heard as the beat is what is moved: on a record made to a click that
 * is the detector's few milliseconds of scatter turned into a speed change
 * on every beat. Pinned per section, only the cuts land, and every push and
 * pull inside them is left exactly as it was played at one speed. The
 * ruling says which, and the cuts, and says nothing to mean per beat, which
 * is what this did before it could be asked.
 */

export interface Straightened {
  channels: Float32Array[];
  rate: number;
  /** Whole bars, the last of which may end in silence. */
  bars: number;
  seconds: number;
  /** How much slower than the record it plays: `to / bpm`, and its average where the map moves. */
  speed: number;
  /** Where it was pinned, when it was laid from a map. */
  pinned?: Pinned;
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
  /** How densely the map is pinned to the grid: per beat unless asked. */
  every?: Every;
  /** The cuts, in bars from 1.1.1, pinned whatever the density. */
  cuts?: readonly number[];
}

export function straightened(channels: readonly Float32Array[], rate: number, ruling: Ruling): Straightened {
  const longest = Math.max(0, ...channels.map((c) => c.length));
  if (ruling.beats) {
    const beats = resampled(ruling.beats, rate, longest);
    return laid(channels, rate, pinnedOf(beats, ruling.to, ruling.cuts ?? [], ruling.every ?? 'beat'), ruling.to / tempoOf(beats));
  }
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
 * The same laying, a pin at a time.
 *
 * The output grid is fixed — beat `b` of the song is `b × spacing` samples
 * in, from 1.1.1 at zero — and each span between two pins is read at the one
 * speed that fills it: the pins' distance in the record over their distance
 * on the grid. Pinned per beat that is one span a beat, which is what the
 * map says about them; pinned per section it is one span a section.
 *
 * The spans are resampled against the whole channel rather than against a
 * copy of themselves, so a pin is a change of speed and not an edit: the
 * sinc still reaches either side of it and no join can be heard.
 */
function laid(channels: readonly Float32Array[], rate: number, pinned: Pinned, speed: number): Straightened {
  const { pins, spacing, bars } = pinned;
  const length = Math.round(bars * BEATS_PER_BAR * spacing);
  const out = channels.map(() => new Float32Array(length));
  for (let i = 0; i + 1 < pins.length; i++) {
    const a = pins[i];
    const b = pins[i + 1];
    const speed = (b.source - a.source) / (b.output - a.output);
    const start = Math.max(0, Math.ceil(a.output));
    const upto = Math.min(length, Math.ceil(b.output));
    if (upto <= start) continue;
    const from = a.source + (start - a.output) * speed;
    channels.forEach((channel, c) => out[c].set(resample(channel, speed, from, upto - start), start));
  }
  return { channels: out, rate, bars, seconds: length / rate, speed, pinned };
}
