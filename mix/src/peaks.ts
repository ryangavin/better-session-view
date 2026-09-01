/**
 * A waveform to look at, before there is one to read.
 *
 * The lanes have to be laid out against something with the shape of real audio
 * — a drum stem that is all transient and a bass that is all sustain do not
 * occupy a lane the same way, and a flat noise band would have hidden that.
 * So each stem gets an envelope built from its own character, and the numbers
 * are derived rather than random: same picture every launch, which is what
 * makes a screenshot worth comparing against the last one.
 *
 * When the job runner lands this is replaced by peaks read off the file. The
 * shape it returns — one min/max pair per column — is what a peak file holds
 * anyway, so the drawing does not change.
 */

/** One column of the drawing: how far the signal reached either side of zero. */
export interface Peak {
  min: number;
  max: number;
}

/**
 * Deterministic, and seeded from the stem and the song together so two tracks
 * do not draw the same drums.
 */
const noise = (seed: number): (() => number) => {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
};

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Sixteen bars of arrangement, so the lane is not the same four bars all night. */
const section = (beat: number): number => {
  const bar = Math.floor(beat / 4);
  const eight = Math.floor(bar / 8) % 4;
  return [0.7, 1, 0.45, 1][eight];
};

/**
 * How each source fills a bar, which is the whole reason the lanes read
 * differently — a drum stem that is all transient and a bass that is all
 * sustain do not occupy a lane the same way.
 */
const CHARACTER: Record<string, (beat: number, rnd: () => number) => number> = {
  // Kick and snare over hats, and the hats a quarter the height — a lane where
  // every subdivision is the same height reads as a comb rather than a beat.
  drums: (beat, rnd) => {
    const into = beat % 1;
    const backbeat = Math.floor(beat) % 2 === 1 ? 1 : 0.8;
    const hit = Math.exp(-into * 15) * backbeat;
    const hat = Math.exp(-((beat * 2) % 1) * 24) * 0.24;
    // A fill in the last bar of every eight, which is what makes an arrangement
    // legible at a glance rather than sixty-four identical bars.
    const bar = Math.floor(beat / 4);
    const fill = bar % 8 === 7 && beat % 4 > 2 ? 0.5 + rnd() * 0.5 : 0;
    return Math.min(1, (hit + hat + fill) * (0.82 + rnd() * 0.18)) * section(beat);
  },
  // A note per beat that holds most of it, with the octave jumps left in.
  bass: (beat, rnd) => {
    const into = beat % 1;
    const note = Math.floor(beat) % 4 === 2 ? 0.62 : 0.86;
    const envelope = Math.min(1, into * 24) * Math.exp(-into * 0.8);
    return note * envelope * (0.82 + rnd() * 0.18) * section(beat);
  },
  // Phrases: five bars of singing in eight, with breath inside them.
  vocals: (beat, rnd) => {
    const bar = Math.floor(beat / 4);
    const singing = bar % 8 < 5 ? 1 : 0.04;
    const word = Math.exp(-((beat * 2) % 1) * 2.2);
    const breath = 0.5 + 0.5 * Math.sin(beat * 0.7);
    return singing * word * breath * (0.6 + rnd() * 0.4) * section(beat);
  },
  // Strummed on the half bar, and out for a bar in four.
  guitar: (beat, rnd) => {
    const bar = Math.floor(beat / 4);
    if (bar % 4 === 3) return 0.03;
    const into = beat % 2;
    return Math.min(1, into * 30) * Math.exp(-into * 1.5) * (0.5 + rnd() * 0.4) * section(beat);
  },
  // Chords on the downbeat, held, and the quietest thing in the mix. The odd
  // bar gets a second chord half way through so the lane is not a metronome.
  piano: (beat, rnd) => {
    const bar = Math.floor(beat / 4);
    const into = bar % 3 === 1 ? beat % 2 : beat % 4;
    return (
      Math.min(1, into * 18) * Math.exp(-into * 0.55) * (0.3 + rnd() * 0.22) * section(beat)
    );
  },
  // Whatever the model could not place: low, wide and featureless.
  other: (beat, rnd) => (0.1 + rnd() * 0.1) * section(beat),
};

/**
 * How many times each column is sampled before it becomes one peak.
 *
 * A column is a *span* of time, not an instant, and the thing drawn in it is
 * the loudest the signal got anywhere inside it — which is exactly what a peak
 * file holds. Point-sampling instead is what makes a drum lane look like a
 * ruled line: sixty-four bars across nine hundred columns is three columns to
 * the beat, and a transient that decays inside one of them is either caught
 * whole or missed entirely depending on where the column happened to land.
 */
const OVERSAMPLE = 12;

/**
 * `columns` peaks across `bars` bars of four beats.
 *
 * Silence for a stem the model did not produce is the caller's business, not
 * this function's — an empty lane and a lane of zeroes look the same and only
 * one of them is honest.
 */
export function peaksFor(stem: string, song: string, bars: number, columns: number): Peak[] {
  const rnd = noise(hash(`${stem}:${song}`));
  const shape = CHARACTER[stem] ?? CHARACTER.other;
  const beatsPerColumn = (bars * 4) / columns;
  const out: Peak[] = [];
  for (let i = 0; i < columns; i++) {
    // Ends taper, because a separated stem starts and stops with the song.
    const edge = Math.min(1, i / 10, (columns - i) / 16);
    let loudest = 0;
    for (let s = 0; s < OVERSAMPLE; s++) {
      const beat = (i + s / OVERSAMPLE) * beatsPerColumn;
      loudest = Math.max(loudest, shape(beat, rnd));
    }
    const amp = Math.min(1, loudest * edge);
    // Not symmetric: real audio is not, and a mirrored envelope reads as a
    // graphic rather than as a signal.
    out.push({ min: -amp * (0.76 + rnd() * 0.24), max: amp });
  }
  return out;
}
