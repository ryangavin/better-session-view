import {
  barAt,
  fitOf,
  hitsOf,
  mapOf,
  riseOf,
  tempoRange,
  through,
  type Bars,
  type Beat,
  type Fit,
  type Heard,
  type Hit,
  type Marker,
} from './warp.ts';

/**
 * Following the drummer: a marker wherever the beat moved.
 *
 * `warp.ts` fits one straight line to the whole song, which is the right shape
 * for a record and the wrong one for a band. This walks the song beat by beat
 * behind that line and writes down where the beat actually fell — Live's
 * Auto-Warp, which drops a warp marker on the first beat of each bar where the
 * audio drifted and leaves a track made at a fixed tempo as one straight
 * stretch.
 *
 * **The seed does the hard half.** Which octave the pulse is in, which beat
 * starts the bar and where the first one falls are the questions a tracker
 * gets wrong, and the fit has already answered them. What is left to follow is
 * drift, and drift is small: a drummer moves a few per cent, not a hundred. So
 * each beat is predicted from the last one and the local tempo, the strongest
 * kick close to the prediction is taken, and the local tempo moves a little
 * toward what it found. Where nothing is found the walk carries on at the
 * **seed's** tempo rather than the local one. A local tempo is a reading of
 * the last few bars, and a sixteen-bar breakdown is long enough for a small
 * error in it to walk the count off the beat; the seed is a line through every
 * kick in the song and good to a hundredth of a BPM.
 *
 * **A marker on each downbeat that found a hit**, placed by the line through
 * the beats around it rather than by the hit itself. A hit is placed to a
 * millisecond or two and a hand plays to ten, and a marker on every wobble is
 * a playback rate that wobbles with it. Then any marker lying on the straight
 * line through its neighbours is dropped, so a track played to a click comes
 * back as the two markers it always was — which is what Live has done since
 * 11.3.10, and what stops a produced record growing a hundred pins.
 */

export interface Follow extends Fit {
  markers: readonly Marker[];
  /** The share of the beats walked that found a hit under them. */
  tracked: number;
  slowest: number;
  fastest: number;
}

/** How far either side of a predicted beat a hit is looked for, as a share of the beat. */
const REACH = 0.2;
/** And how far once the beat has been lost for a while, so it can be found again. */
const WIDE = 0.4;
/** Misses in a row before the search widens. */
const LOST = 8;
/** How much the local tempo moves toward each interval it measures: about eight beats of memory. */
const EASE = 0.15;
/** How far the local tempo may stray from the seed, either way. */
const STRAY = 0.1;
/** How quickly a lost beat's tempo goes back to the seed's, per missed beat. */
const RELAX = 0.3;
/** The width of the closeness weighting, as a share of the beat. */
const NEAR = 0.08;
/** The least a hit may score — its weight times its closeness — to be taken as the beat. */
const FLOOR = 0.05;
/** How many beats either side a downbeat is placed from. */
const AROUND = 4;
/**
 * How far a marker may sit from the line through its neighbours and still be
 * dropped, in seconds. About a column of the envelope, which is the resolution
 * a hit is placed to before the parabola, and under what a hand can hear.
 */
const SLACK = 0.012;
/** How much of the song a seed is fitted to when the whole of it will not hold one line. */
const OPENING = 45;

/**
 * The fit to follow behind.
 *
 * The whole song where it holds one line, and the opening where it does not:
 * a song with a real tempo change in it scores under the fit's floor as a
 * whole, and the follower is exactly the thing that exists for that song. The
 * first three quarters of a minute is enough to say which beat and which bar.
 */
export function seedOf(heard: Heard): Fit | null {
  const whole = fitOf(heard);
  if (whole) return whole;
  const opening = Math.floor(OPENING / heard.low.per);
  if (opening >= heard.low.level.length) return null;
  return fitOf({
    low: { level: heard.low.level.subarray(0, opening), per: heard.low.per },
    wide: {
      level: heard.wide.level.subarray(0, Math.floor(OPENING / heard.wide.per)),
      per: heard.wide.per,
    },
  });
}

/**
 * The markers lying within `slack` of the line through their neighbours,
 * dropped: Ramer–Douglas–Peucker, with the error measured in time at the
 * marker's bar. Time and not distance because the jitter it is absorbing is
 * column rounding and hand timing, both of which are milliseconds.
 */
function simplified(markers: readonly Marker[], slack: number): Marker[] {
  const n = markers.length;
  if (n <= 2) return [...markers];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const spans: [number, number][] = [[0, n - 1]];
  while (spans.length > 0) {
    const [a, b] = spans.pop()!;
    const from = markers[a];
    const to = markers[b];
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const on = from.at + ((markers[i].bar - from.bar) * (to.at - from.at)) / (to.bar - from.bar);
      const err = Math.abs(markers[i].at - on);
      if (err > worst) {
        worst = err;
        at = i;
      }
    }
    if (worst > slack) {
      keep[at] = 1;
      spans.push([a, at], [at, b]);
    }
  }
  return markers.filter((_, i) => keep[i] === 1);
}

/**
 * Where a downbeat is, from the beats around it.
 *
 * A weighted line through the pins within `AROUND` beats, read at this one —
 * and the pin itself where there are too few neighbours to draw a line.
 */
function placed(pins: readonly Beat[], index: number): number {
  const pin = pins[index];
  const around: Beat[] = [];
  for (let j = index; j >= 0 && pin.k - pins[j].k <= AROUND; j--) around.push(pins[j]);
  for (let j = index + 1; j < pins.length && pins[j].k - pin.k <= AROUND; j++) around.push(pins[j]);
  if (around.length < 3) return pin.at;
  const line = through(around);
  return line ? line.first + line.period * pin.k : pin.at;
}

/** The share of the hits, by weight, within an eighth of a beat of the map's beats. */
function agreementOf(hits: readonly Hit[], map: Bars, per: number): number {
  let all = 0;
  let on = 0;
  for (const hit of hits) {
    all += hit.weight;
    const beat = barAt(map, (hit.at * per) / map.seconds) * 4;
    if (Math.abs(beat - Math.round(beat)) <= 1 / 8) on += hit.weight;
  }
  return all > 0 ? on / all : 0;
}

/**
 * The beat, followed through the song from a seed, as markers.
 *
 * Walked from bar 1's downbeat — or from `from` seconds in, for warping the
 * rest of a song from a marker somebody moved — and every beat is a
 * prediction corrected by the nearest kick. Nothing is placed where nothing
 * was heard: the segment across a breakdown is one straight stretch between
 * the last downbeat before it and the first after, which is what Live does
 * with silence too.
 */
export function followOf(heard: Heard, seed: Fit, from = 0): Follow | null {
  const { low } = heard;
  const per = low.per;
  const columns = low.level.length;
  const hits = hitsOf(riseOf(low.level, per));
  if (hits.length === 0) return null;

  const period0 = 60 / (seed.bpm * per);
  const first = seed.offset / per;
  const start = Math.max(0, Math.ceil((from / per - first) / period0));

  const pins: Beat[] = [];
  let walked = 0;
  let period = period0;
  let last = first + start * period0;
  let lastPin: Beat | null = null;
  let misses = 0;
  let h = 0;

  for (let k = start; ; k++) {
    const expected = k === start ? last : last + period;
    if (expected > columns - 1) break;
    walked++;
    const reach = (misses >= LOST ? WIDE : REACH) * period;
    while (h < hits.length && hits[h].at < expected - reach) h++;
    let best: Hit | null = null;
    let score = 0;
    for (let j = h; j < hits.length && hits[j].at <= expected + reach; j++) {
      const near = (hits[j].at - expected) / (NEAR * period);
      const s = hits[j].weight * Math.exp(-0.5 * near * near);
      if (s > score) {
        score = s;
        best = hits[j];
      }
    }
    if (best && score >= FLOOR) {
      const pin: Beat = { k, at: best.at, weight: best.weight };
      if (lastPin && k - lastPin.k <= 2 * AROUND) {
        const interval = (best.at - lastPin.at) / (k - lastPin.k);
        period += EASE * (interval - period);
        period = Math.max(period0 * (1 - STRAY), Math.min(period0 * (1 + STRAY), period));
      }
      pins.push(pin);
      lastPin = pin;
      last = best.at;
      misses = 0;
    } else {
      period += RELAX * (period0 - period);
      last = expected;
      misses++;
    }
  }
  if (pins.length === 0) return null;

  const raw: Marker[] = [];
  pins.forEach((pin, i) => {
    if (pin.k % 4 !== 0) return;
    raw.push({ at: placed(pins, i) * per, bar: pin.k / 4 });
  });
  const map = mapOf(columns * per, simplified(raw, SLACK), seed.bpm);
  const { slowest, fastest } = tempoRange(map);
  return {
    bpm: seed.bpm,
    offset: seed.offset,
    agreement: agreementOf(hits, map, per),
    markers: map.markers,
    tracked: pins.length / walked,
    slowest,
    fastest,
  };
}
