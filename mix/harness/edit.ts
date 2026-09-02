/**
 * Correcting a beat map by hand: the truth in, one correction, a new truth
 * out, with the edit that names it appended. Pure, so the page can keep a
 * stack of these and step back through it, and so they can be tested.
 */
import { BEATS_PER_BAR } from '../src/warp.ts';
import type { Report, Truth } from './types.ts';

/** A beat as it is easiest to move around: where it is, and whether a bar starts on it. */
interface Beat {
  sample: number;
  down: boolean;
}

const beatsOf = (truth: Truth): Beat[] => {
  const downs = new Set(truth.beats.downbeat);
  return truth.beats.samples.map((sample, i) => ({ sample, down: downs.has(i) }));
};

/** Back to a Truth: samples in order, downbeats as indices into them, edit appended. */
function withBeats(truth: Truth, beats: Beat[], edit: Truth['edits'][number]): Truth {
  const sorted = [...beats].sort((a, b) => a.sample - b.sample);
  return {
    ...truth,
    beats: {
      rate: truth.beats.rate,
      samples: sorted.map((b) => b.sample),
      downbeat: sorted.flatMap((b, i) => (b.down ? [i] : [])),
    },
    source: 'manual',
    edits: [...truth.edits, edit],
    at: new Date().toISOString(),
  };
}

/** Every fourth beat from `first`, as indices — what a bar line means once it has been rotated. */
export function regularDownbeats(count: number, first: number): number[] {
  const phase = ((first % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  const out: number[] = [];
  for (let i = phase; i < count; i += BEATS_PER_BAR) out.push(i);
  return out;
}

/** The first index a bar starts on, or 0 when nothing is marked. */
const firstDown = (truth: Truth): number => (truth.beats.downbeat.length ? Math.min(...truth.beats.downbeat) : 0);

/** The predicted map over a region, as a starting point for correcting it. */
export function seedTruth(report: Report, region: { from: number; to: number }): Truth {
  const map = report.beats;
  const rate = map?.rate ?? report.track.rate;
  const samples: number[] = [];
  const downbeat: number[] = [];
  if (map) {
    map.samples.forEach((sample, i) => {
      const at = sample / map.rate;
      if (at < region.from || at > region.to) return;
      if ((((map.first + i) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0) downbeat.push(samples.length);
      samples.push(sample);
    });
  }
  return {
    track: report.track.id,
    region: { from: region.from, to: region.to },
    beats: { rate, samples, downbeat },
    source: 'manual',
    edits: [],
    at: new Date().toISOString(),
  };
}

/** The machine had the pulse but not the sample. */
export function moveBeat(truth: Truth, i: number, sample: number): Truth {
  const beats = beatsOf(truth);
  const from = beats[i]?.sample;
  if (from == null || from === sample) return truth;
  beats[i] = { ...beats[i], sample };
  return withBeats(truth, beats, { type: 'moved', beat: i, from, to: sample });
}

/** Nothing was struck as a beat there. */
export function removeBeat(truth: Truth, i: number): Truth {
  const beats = beatsOf(truth);
  const gone = beats[i];
  if (!gone) return truth;
  beats.splice(i, 1);
  return withBeats(truth, beats, { type: 'spurious', beat: i, sample: gone.sample });
}

/** A pulse the machine walked past. */
export function insertBeat(truth: Truth, sample: number): Truth {
  const beats = beatsOf(truth);
  if (beats.some((b) => b.sample === sample)) return truth;
  beats.push({ sample, down: false });
  return withBeats(truth, beats, { type: 'missed', sample });
}

/** The pulses were right, the downbeat was not. */
export function rotateBar(truth: Truth, by: number): Truth {
  const beats = beatsOf(truth);
  const downs = new Set(regularDownbeats(beats.length, firstDown(truth) + by));
  return withBeats(
    truth,
    beats.map((b, i) => ({ ...b, down: downs.has(i) })),
    { type: 'phase', by },
  );
}

/** Half the pulses were the tempo: drop every other beat, keeping the bar lines. */
export function halve(truth: Truth): Truth {
  const beats = beatsOf(truth);
  const first = firstDown(truth);
  const kept = beats.filter((_, i) => (((i - first) % 2) + 2) % 2 === 0);
  const downs = new Set(regularDownbeats(kept.length, Math.floor(first / 2)));
  return withBeats(
    truth,
    kept.map((b, i) => ({ ...b, down: downs.has(i) })),
    { type: 'octave', factor: 0.5 },
  );
}

/** Twice the pulses were the tempo: a beat between each pair. */
export function double(truth: Truth): Truth {
  const beats = beatsOf(truth);
  const grown: Beat[] = [];
  beats.forEach((b, i) => {
    grown.push({ ...b });
    const next = beats[i + 1];
    if (next) grown.push({ sample: Math.round((b.sample + next.sample) / 2), down: false });
  });
  const downs = new Set(regularDownbeats(grown.length, firstDown(truth) * 2));
  return withBeats(
    truth,
    grown.map((b, i) => ({ ...b, down: downs.has(i) })),
    { type: 'octave', factor: 2 },
  );
}
