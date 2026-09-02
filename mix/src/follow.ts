import { beatnessOf, phaseOf, type Fit } from './tempo.ts';
import type { FollowTrace, StretchTrace } from './trace.ts';
import type { Heard, Transient } from './transients.ts';
import { beatAt, beatsOf, type Beats } from './warp.ts';

/**
 * Following the beat through the song: an anchor for every beat.
 *
 * `tempo.ts` finds one straight line, which is the right shape for a record
 * and the wrong one for a band. This finds the beats themselves, one by one,
 * and hands back the map `warp.ts` is built on: the exact sample of every
 * beat, from the top of the file to the end, whether or not a drum was struck
 * on it.
 *
 * **Every beat is a prediction matched to a transient under a smoothness
 * cost**, and the matching is done for the whole song at once rather than
 * beat by beat. A greedy walk grabs the syncopated kick inside its window and
 * then has to find its way back; dynamic programming asks which sequence of
 * beats, taken together, sits on the most onset strength while changing its
 * spacing the least, and reads the answer off backwards from the end. Where
 * nothing was struck for sixteen bars the cost of changing spacing is all
 * there is, so the beats go on at the spacing they had — evenly, which is
 * exactly what a beat in silence is.
 *
 * **The spacing it is held to is local.** The seed's tempo is a whole-song
 * average, and a song that moves from 128 to 140 at the drop is not near
 * either for long. So the period the cost is measured against is read off the
 * song a stretch at a time, within a quarter either side of the seed, and the
 * cost is then stiff: a beat that lands late by a twentieth of its spacing
 * pays as much as a missing kick.
 *
 * **Then each beat is anchored to a sample.** The beat found in the strength
 * is placed to five milliseconds; the transient it was found on is placed to
 * the sample, and that is the anchor. A beat with no transient under it is
 * placed evenly between the anchored beats either side of it, because that is
 * what the sound did. Bar 1 beat 1 is the first beat found, as a clip
 * dropped in Ableton starts at 1.1.1: the whole file, the start, and every
 * anchor are kept, and where the music's one is elsewhere the count is moved
 * rather than the beats — `renumbered` in `warp.ts`. The kick's vote for the
 * heaviest quarter is still taken, and reported, for whoever moves it.
 */

export interface Follow extends Fit {
  beats: Beats;
  /** The share of the kick and snare strength landing within an eighth of a beat of the map. */
  agreement: number;
  /** The share of the beats that had a transient under them. */
  tracked: number;
  slowest: number;
  fastest: number;
}

/** Seconds per frame of the onset strength the beats are found in. */
const FRAME = 0.005;
/** How much each band counts for in the strength. */
const WEIGHT: Record<Transient['band'], number> = { low: 1, mid: 0.7, high: 0.3 };
/** How far a beat may be found from its prediction, as a share of the local spacing. */
const NEAREST = 0.7;
const FURTHEST = 1.4;
/** How dearly a change of spacing is paid for. A twentieth's deviation costs about one strong hit. */
const STIFF = 400;
/**
 * The stretch of song a local period is read over, and how often. In seconds.
 *
 * Twenty seconds, because the thing a local period must not be read off is a
 * fill: a build-up roll before a drop is eight seconds of hits every ninety
 * milliseconds, as periodic as anything in the song, and a stretch it fills
 * reads at the roll's tempo. A real change of tempo lasts minutes. Twenty
 * seconds dilutes the roll and smears the change by a few bars, which the
 * beats themselves take up.
 */
const STRETCH = 20;
const STEP = 4;
/** How far the local period may stray from the seed, either way. */
const STRAY = 0.25;
/** How much onset strength a stretch needs before its own period is believed over the seed's. About twelve strong hits. */
const ENOUGH = 12;
/** How far a stretch's best lag must stand above the run of lags to be a period and not noise. */
const CLEAR = 1.5;
/** How many times busier than the song's usual stretch a stretch has to be to be a fill rather than the beat. */
const FILL = 2.5;
/** How much better a stretch's own period must look as the beat than the seed's before it is believed. */
const BETTER = 1.1;
/** How far a found beat looks for the transient to anchor to, in seconds. */
const SNAP = 0.02;

/** The onset strength, frame by frame. */
function strengthOf(heard: Heard): Float32Array {
  const frames = Math.max(1, Math.ceil(heard.seconds / FRAME));
  const out = new Float32Array(frames);
  for (const hit of heard.transients) {
    const centre = hit.at / FRAME;
    const weight = hit.strength * WEIGHT[hit.band];
    for (let i = Math.max(0, Math.floor(centre) - 2); i <= Math.min(frames - 1, Math.ceil(centre) + 2); i++) {
      const d = (i - centre) / 1.2;
      out[i] += weight * Math.exp(-0.5 * d * d);
    }
  }
  return out;
}

/**
 * The period the song runs at, frame by frame.
 *
 * Read off the autocorrelation of a stretch of the strength, within a quarter
 * of the seed's period either way, every few seconds — but only where the
 * stretch states it clearly: enough hits to correlate, a peak that stands well
 * above the run of lags, and not a fill. A build-up roll is eight seconds of
 * hits every ninety milliseconds, as periodic as anything in the song and
 * nothing to do with its tempo, and it gives itself away by density: several
 * times the hits of a stretch of the beat. A stretch that says nothing clearly
 * — a breakdown, an intro, a roll — takes the period of the clear stretches
 * either side of it, drawn straight between them, because that is the best
 * guess there is about where a song's tempo was when it stopped saying. Not
 * the seed's: a song with two tempos in it has a seed that is one of them.
 *
 * And a period a stretch does state clearly still has to be the beat. A
 * syncopated section correlates with itself at a spacing that is not its
 * beat as readily as at one that is, so the stretch's period is judged the
 * way the seed's octave was — by what the kit does on and between its pulses
 * — against the seed's period over the same stretch, and believed only where
 * it looks more like the beat than the seed does.
 */
function periodsOf(strength: Float32Array, seed: number, heard: Heard, hits: readonly Transient[], trace?: FollowTrace): Float32Array {
  const frames = strength.length;
  const span = Math.round(STRETCH / FRAME);
  const step = Math.round(STEP / FRAME);
  const lo = Math.max(2, Math.floor(seed * (1 - STRAY)));
  const hi = Math.ceil(seed * (1 + STRAY));
  const centres: number[] = [];
  const totals: number[] = [];
  const read: (number | null)[] = [];
  for (let start = 0; start < frames; start += step) {
    const end = Math.min(frames, start + span);
    let total = 0;
    for (let i = start; i < end; i++) total += strength[i];
    centres.push(Math.min(frames - 1, start + span / 2));
    totals.push(total);
    let period: number | null = null;
    if (total > ENOUGH) {
      const acf = new Float64Array(hi + 2);
      let best = -1;
      let at = -1;
      let mean = 0;
      for (let lag = lo; lag <= hi; lag++) {
        let sum = 0;
        for (let i = start; i + lag < end; i++) sum += strength[i] * strength[i + lag];
        acf[lag] = sum;
        mean += sum;
        if (sum > best) {
          best = sum;
          at = lag;
        }
      }
      mean /= hi - lo + 1;
      if (best > mean * CLEAR && at > lo && at < hi) {
        const a = acf[at - 1];
        const c = acf[at + 1];
        const bend = a - 2 * best + c;
        const found = at + (bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / bend)) : 0);
        // Does it look like the beat here, more than the seed's period does?
        const startAt = start * FRAME;
        const endAt = end * FRAME;
        const local: Heard = {
          seconds: heard.seconds,
          rate: heard.rate,
          transients: hits.filter((h) => h.at >= startAt && h.at < endAt),
        };
        const own = found * FRAME;
        const base = seed * FRAME;
        const ownLooks = beatnessOf(local, own, phaseOf(local.transients, own, heard.seconds).first);
        const seedLooks = beatnessOf(local, base, phaseOf(local.transients, base, heard.seconds).first);
        if (Math.abs(found - seed) < seed * 0.02 || ownLooks >= seedLooks * BETTER) period = found;
      }
    }
    read.push(period);
  }
  // A fill is a stretch several times as busy as the song usually is.
  const busy = totals.filter((t) => t > ENOUGH).sort((a, b) => a - b);
  const usual = busy[busy.length >> 1] ?? 0;
  const fills = read.map((_, i) => usual > 0 && totals[i] > usual * FILL);
  if (trace) {
    trace.stretches = centres.map(
      (centre, i): StretchTrace => ({
        at: centre * FRAME,
        total: totals[i],
        read: read[i] === null ? null : 60 / (read[i]! * FRAME),
        fill: fills[i],
      }),
    );
  }
  for (let i = 0; i < read.length; i++) if (fills[i]) read[i] = null;

  // Draw straight between the stretches that spoke; hold flat past the
  // first and last of them; and where none did, the seed.
  const found: number[] = read.map((p) => p ?? NaN);
  let lastKnown = -1;
  for (let i = 0; i < found.length; i++) {
    if (!Number.isNaN(found[i])) {
      if (lastKnown < 0) for (let j = 0; j < i; j++) found[j] = found[i];
      else for (let j = lastKnown + 1; j < i; j++) found[j] = found[lastKnown] + ((found[i] - found[lastKnown]) * (j - lastKnown)) / (i - lastKnown);
      lastKnown = i;
    }
  }
  if (lastKnown < 0) found.fill(seed);
  else for (let j = lastKnown + 1; j < found.length; j++) found[j] = found[lastKnown];

  // Smoothed over five stretches, so a stretch or two that read wrongly
  // cannot bend the beats on their own.
  const smooth = found.map((_, i) => {
    const five: number[] = [];
    for (let j = -2; j <= 2; j++) five.push(found[Math.max(0, Math.min(found.length - 1, i + j))]);
    five.sort((a, b) => a - b);
    return five[2];
  });

  const out = new Float32Array(frames);
  let c = 0;
  for (let i = 0; i < frames; i++) {
    while (c + 1 < centres.length && centres[c + 1] <= i) c++;
    const a = smooth[c];
    const b = smooth[Math.min(c + 1, smooth.length - 1)];
    const from = centres[c];
    const to = centres[Math.min(c + 1, centres.length - 1)];
    out[i] = to > from && i > from ? a + (b - a) * Math.min(1, (i - from) / (to - from)) : a;
  }
  return out;
}

/**
 * The beats, as frames of the strength: the sequence that sits on the most
 * strength while changing its spacing the least, found by dynamic programming
 * and read back from the end.
 */
function beatFramesOf(strength: Float32Array, period: Float32Array): number[] {
  const n = strength.length;
  const score = new Float64Array(n);
  const from = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const p = period[i];
    let best = 0;
    let via = -1;
    const lo = Math.max(0, i - Math.ceil(p * FURTHEST));
    const hi = i - Math.floor(p * NEAREST);
    for (let j = lo; j <= hi; j++) {
      const stretch = Math.log((i - j) / p);
      const value = score[j] - STIFF * stretch * stretch;
      if (value > best) {
        best = value;
        via = j;
      }
    }
    score[i] = strength[i] + best;
    from[i] = via;
  }
  // The last beat is the best-scoring frame within a spacing of the end;
  // everything before it follows from the links.
  let end = n - 1;
  const tail = Math.max(0, n - Math.ceil(period[n - 1] * FURTHEST));
  for (let i = tail; i < n; i++) if (score[i] > score[end]) end = i;
  const out: number[] = [];
  for (let i = end; i >= 0; i = from[i]) {
    out.push(i);
    if (from[i] < 0) break;
  }
  out.reverse();
  return out;
}

/** The kick or snare nearest a moment within reach, or nothing. */
function anchorNear(hits: readonly Transient[], at: number, reach: number): Transient | null {
  let lo = 0;
  let hi = hits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid].at < at - reach) lo = mid + 1;
    else hi = mid;
  }
  let best: Transient | null = null;
  let score = 0;
  for (let i = lo; i < hits.length && hits[i].at <= at + reach; i++) {
    const s = hits[i].strength * WEIGHT[hits[i].band] * (1 - Math.abs(hits[i].at - at) / reach / 2);
    if (s > score) {
      score = s;
      best = hits[i];
    }
  }
  return best;
}

/** The share of the kick and snare strength within an eighth of a beat of the map. */
function agreementOf(hits: readonly Transient[], beats: Beats): number {
  let all = 0;
  let on = 0;
  for (const hit of hits) {
    const w = hit.strength * WEIGHT[hit.band];
    all += w;
    const beat = beatAt(beats, hit.sample);
    if (Math.abs(beat - Math.round(beat)) <= 1 / 8) on += w;
  }
  return all > 0 ? on / all : 0;
}

/**
 * The beats of the song, followed from a seed, as a map.
 *
 * Nothing where nothing can be followed: fewer than four beats found, or a
 * seed with no transients to anchor to, is null rather than a guess.
 */
export function followOf(heard: Heard, seed: Fit, trace?: FollowTrace): Follow | null {
  const refuse = (why: string): null => {
    if (trace) trace.refused = why;
    return null;
  };
  const hits = heard.transients.filter((t) => t.band !== 'high');
  if (hits.length < 8) return refuse('fewer than eight kick or snare hits');
  const strength = strengthOf(heard);
  if (trace) trace.strength = Array.from(strength);
  const seedPeriod = 60 / seed.bpm / FRAME;
  const period = periodsOf(strength, seedPeriod, heard, hits, trace);
  if (trace) trace.tempo = Array.from(period, (p) => 60 / (p * FRAME));
  const frames = beatFramesOf(strength, period);
  if (frames.length < 4) return refuse('fewer than four beats found');

  // Anchor each beat to the transient under it; mark the ones with none.
  const under: (Transient | null)[] = frames.map((frame) => anchorNear(hits, frame * FRAME, SNAP));
  const anchored: (number | null)[] = under.map((hit) => (hit ? hit.sample : null));
  const found = anchored.filter((s) => s !== null).length;
  if (found < 4) return refuse('fewer than four beats had a transient under them');

  // Beats with nothing under them sit evenly between the anchored beats
  // either side; before the first or after the last, at that neighbour's
  // spacing to the next.
  const samples = new Array<number>(anchored.length);
  let prev = -1;
  for (let i = 0; i < anchored.length; i++) {
    if (anchored[i] === null) continue;
    if (prev < 0) {
      // Before the first anchor: back from it at the spacing to the next.
      let next = i + 1;
      while (next < anchored.length && anchored[next] === null) next++;
      const spacing =
        next < anchored.length ? (anchored[next]! - anchored[i]!) / (next - i) : (frames[i] - frames[0]) * FRAME * heard.rate / Math.max(1, i);
      for (let j = 0; j < i; j++) samples[j] = Math.round(anchored[i]! - (i - j) * spacing);
    } else {
      for (let j = prev + 1; j < i; j++) {
        samples[j] = Math.round(anchored[prev]! + ((anchored[i]! - anchored[prev]!) * (j - prev)) / (i - prev));
      }
    }
    samples[i] = anchored[i]!;
    prev = i;
  }
  if (prev < anchored.length - 1) {
    let before = prev - 1;
    while (before >= 0 && anchored[before] === null) before--;
    const spacing = before >= 0 ? (anchored[prev]! - anchored[before]!) / (prev - before) : period[frames[prev]] * FRAME * heard.rate;
    for (let j = prev + 1; j < anchored.length; j++) samples[j] = Math.round(anchored[prev]! + (j - prev) * spacing);
  }

  // The heaviest quarter, voted by how loud the kick got on each of the four
  // — reported, not acted on: the first beat found is 1.1.1, and the count
  // moves from there if somebody says so.
  const kicks = heard.transients.filter((t) => t.band === 'low');
  const votes = [0, 0, 0, 0];
  anchored.forEach((sample, i) => {
    if (sample === null) return;
    const kick = anchorNear(kicks, sample / heard.rate, SNAP);
    if (kick) votes[i % 4] += kick.level;
  });
  let downbeat = 0;
  for (let r = 1; r < 4; r++) if (votes[r] > votes[downbeat] * 1.05) downbeat = r;
  const beats = beatsOf(heard.rate, Math.round(heard.seconds * heard.rate), 0, samples, seed.bpm);
  if (trace) {
    trace.beats = frames.map((frame, i) => ({
      frame,
      at: frame * FRAME,
      hit: under[i] ? heard.transients.indexOf(under[i]!) : null,
      sample: samples[i],
    }));
    trace.votes = votes;
    trace.downbeat = downbeat;
  }

  let slowest = Infinity;
  let fastest = 0;
  for (let i = 0; i + 1 < beats.samples.length; i++) {
    const bpm = (60 * beats.rate) / (beats.samples[i + 1] - beats.samples[i]);
    if (bpm < slowest) slowest = bpm;
    if (bpm > fastest) fastest = bpm;
  }
  return {
    bpm: seed.bpm,
    // 1.1.1 as the map has it: the first beat found.
    offset: beats.samples[0] / beats.rate,
    beats,
    agreement: agreementOf(hits, beats),
    tracked: found / anchored.length,
    slowest,
    fastest,
  };
}
