/**
 * The predicted beats against the true ones, over the region the truth
 * covers: which were hit, which were missed, which were invented, and whether
 * the misses have a shape — the whole map at half or double tempo, or on the
 * wrong beat of the bar — that names the decision upstream that made them.
 *
 * Pure, so the page and the command line score the same way.
 */
import type { Transient } from '../src/transients.ts';
import type { Report, Truth } from './types.ts';

/** How far from a true beat a predicted one still counts as it, in seconds. The usual figure in beat-tracking evaluation. */
export const WINDOW = 0.07;
/** Within this, a hit is on time rather than merely counted. */
export const TIGHT = 0.01;
/** How far from a true beat a transient is still "under" it. */
export const UNDER = 0.03;

export type Verdict = 'on' | 'shifted' | 'missed';

/** One true beat, and what the machine did about it. */
export interface Row {
  /** Index into the truth's samples. */
  index: number;
  bar: number;
  /** 1 to 4. */
  beat: number;
  sample: number;
  at: number;
  /** The predicted beat it matched, as an index into the map's samples, or nothing. */
  predicted: number | null;
  /** Predicted minus true, in milliseconds. Positive is late. */
  offsetMs: number | null;
  verdict: Verdict;
  /** Whether the predicted beat was anchored to a transient or placed between anchors. */
  anchored: boolean | null;
  /** The kick or snare under the true beat, if one was heard. */
  under: Transient | null;
  /** What the follower held the tempo to be here. */
  localBpm: number | null;
}

export interface Score {
  region: { from: number; to: number };
  truthCount: number;
  predictedCount: number;
  counts: { on: number; shifted: number; missed: number; spurious: number };
  /** 2 · precision · recall / (precision + recall), within the window. */
  fMeasure: number;
  /** The longest run of consecutive true beats hit, as a share of all of them. */
  continuity: number;
  /** Mean and standard deviation of the offsets of the hits, in milliseconds. */
  offsetMs: { mean: number; sd: number };
  /** Offsets of the hits in 5 ms bins from -70 to 70. */
  histogram: { fromMs: number; count: number }[];
  /** The map runs at a multiple of the true tempo. */
  octave: 'half' | 'double' | null;
  /** The map's beats fall between the true ones. */
  offBeat: boolean;
  /** The map's downbeats are this many beats after the true ones, 0 if they agree. */
  phase: number;
  /** Spurious predicted beats, as indices into the map's samples. */
  spurious: number[];
  rows: Row[];
  /** Bars with at least one beat not on time, and what went wrong in them. */
  troubled: { bar: number; verdicts: Verdict[] }[];
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : NaN;
};

/** One-to-one matching, closest pairs first, within the window. Returns predicted index per true beat. */
function matched(truth: readonly number[], predicted: readonly number[], window: number): (number | null)[] {
  const pairs: { i: number; j: number; off: number }[] = [];
  let j = 0;
  for (let i = 0; i < truth.length; i++) {
    while (j < predicted.length && predicted[j] < truth[i] - window) j++;
    for (let k = j; k < predicted.length && predicted[k] <= truth[i] + window; k++) {
      pairs.push({ i, j: k, off: Math.abs(predicted[k] - truth[i]) });
    }
  }
  pairs.sort((a, b) => a.off - b.off);
  const out: (number | null)[] = new Array(truth.length).fill(null);
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (out[pair.i] !== null || taken.has(pair.j)) continue;
    out[pair.i] = pair.j;
    taken.add(pair.j);
  }
  return out;
}

const fMeasureOf = (hits: number, truth: number, predicted: number): number => {
  if (truth === 0 || predicted === 0) return 0;
  const recall = hits / truth;
  const precision = hits / predicted;
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
};

/** The kick or snare nearest a moment within reach, strongest wins on a tie of distance. */
function underneath(hits: readonly Transient[], at: number): Transient | null {
  let best: Transient | null = null;
  let score = -1;
  for (const hit of hits) {
    if (hit.band === 'high') continue;
    const away = Math.abs(hit.at - at);
    if (away > UNDER) continue;
    const s = hit.strength * (1 - away / UNDER / 2);
    if (s > score) {
      score = s;
      best = hit;
    }
  }
  return best;
}

export function score(report: Report, truth: Truth): Score {
  const rate = truth.beats.rate;
  const { from, to } = truth.region;
  const trueAt = truth.beats.samples.map((s) => s / rate);
  const downbeats = new Set(truth.beats.downbeat);

  const map = report.beats;
  const predictedAll = map ? map.samples.map((s) => s / rate) : [];
  // Predicted beats within the region, remembering their index in the map.
  const within: number[] = [];
  predictedAll.forEach((at, j) => {
    if (at >= from - WINDOW && at <= to + WINDOW) within.push(j);
  });
  const predictedAt = within.map((j) => predictedAll[j]);

  const pairs = matched(trueAt, predictedAt, WINDOW);
  const hitTrace = report.trace.follow?.beats ?? [];
  const followTempo = report.trace.follow?.tempo ?? null;
  const frame = report.trace.follow?.frame ?? 0.004;

  // Bar numbers from the truth's own downbeats: the first downbeat in the region is bar 1 of the region.
  let bar = 0;
  let beatInBar = 0;
  const rows: Row[] = trueAt.map((at, i) => {
    if (downbeats.has(i)) {
      bar++;
      beatInBar = 1;
    } else {
      beatInBar = bar === 0 ? 0 : beatInBar + 1;
    }
    const local = pairs[i];
    const j = local === null ? null : within[local];
    const offsetMs = j === null ? null : (predictedAll[j] - at) * 1000;
    const verdict: Verdict = j === null ? 'missed' : Math.abs(offsetMs!) <= TIGHT * 1000 ? 'on' : 'shifted';
    return {
      index: i,
      bar,
      beat: beatInBar,
      sample: truth.beats.samples[i],
      at,
      predicted: j,
      offsetMs,
      verdict,
      anchored: j === null ? null : hitTrace[j] ? hitTrace[j].hit !== null : null,
      under: underneath(report.heard.transients, at),
      localBpm: followTempo ? followTempo[Math.min(followTempo.length - 1, Math.floor(at / frame))] ?? null : null,
    };
  });

  const hits = rows.filter((r) => r.verdict !== 'missed');
  const takenLocal = new Set(pairs.filter((p): p is number => p !== null));
  const spurious = within.filter((_, local) => !takenLocal.has(local));

  const offsets = hits.map((r) => r.offsetMs!);
  const mean = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;
  const sd = offsets.length ? Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length) : 0;
  const histogram: Score['histogram'] = [];
  for (let fromMs = -70; fromMs < 70; fromMs += 5) {
    histogram.push({ fromMs, count: offsets.filter((o) => o >= fromMs && o < fromMs + 5).length });
  }

  let run = 0;
  let longest = 0;
  for (const row of rows) {
    run = row.verdict === 'missed' ? 0 : run + 1;
    if (run > longest) longest = run;
  }

  // Shape of the errors. The spacing says octave; a half-spacing shift that
  // matches far better says off-beat; the bar position of the hits says phase.
  const spacingOf = (xs: number[]) => median(xs.slice(1).map((x, i) => x - xs[i]));
  const trueSpacing = spacingOf(trueAt);
  const predictedSpacing = spacingOf(predictedAt);
  const ratio = predictedSpacing / trueSpacing;
  const octave: Score['octave'] = ratio > 1.8 && ratio < 2.2 ? 'half' : ratio > 0.45 && ratio < 0.55 ? 'double' : null;

  const asIs = fMeasureOf(hits.length, trueAt.length, predictedAt.length);
  const shifted = matched(trueAt, predictedAt.map((at) => at + predictedSpacing / 2), WINDOW).filter((p) => p !== null).length;
  const offBeat = !octave && asIs < 0.5 && fMeasureOf(shifted, trueAt.length, predictedAt.length) > asIs * 2;

  const votes = [0, 0, 0, 0];
  if (map) {
    for (const row of rows) {
      if (row.predicted === null || !downbeats.has(row.index)) continue;
      votes[(((map.first + row.predicted) % 4) + 4) % 4]++;
    }
  }
  let phase = 0;
  for (let k = 1; k < 4; k++) if (votes[k] > votes[phase]) phase = k;
  // The map's downbeat is at position 0; a true downbeat landing on position k means the map's bar starts k beats late.
  phase = (4 - phase) % 4;

  const byBar = new Map<number, Verdict[]>();
  for (const row of rows) {
    if (row.verdict === 'on') continue;
    byBar.set(row.bar, [...(byBar.get(row.bar) ?? []), row.verdict]);
  }

  return {
    region: { from, to },
    truthCount: trueAt.length,
    predictedCount: predictedAt.length,
    counts: {
      on: rows.filter((r) => r.verdict === 'on').length,
      shifted: rows.filter((r) => r.verdict === 'shifted').length,
      missed: rows.filter((r) => r.verdict === 'missed').length,
      spurious: spurious.length,
    },
    fMeasure: asIs,
    continuity: trueAt.length ? longest / trueAt.length : 0,
    offsetMs: { mean, sd },
    histogram,
    octave,
    offBeat,
    phase,
    spurious,
    rows,
    troubled: [...byBar.entries()].sort((a, b) => a[0] - b[0]).map(([bar, verdicts]) => ({ bar, verdicts })),
  };
}

const ms = (x: number | null) => (x === null ? '' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}`);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The score as a page of markdown, written to be read rather than parsed. */
export function toMarkdown(report: Report, truth: Truth, s: Score): string {
  const out: string[] = [];
  const t = report.track;
  out.push(`# ${t.title}`);
  out.push('');
  out.push(`Truth: ${truth.source}, ${s.truthCount} beats over ${s.region.from.toFixed(1)}–${s.region.to.toFixed(1)} s${truth.edits.length ? `, ${truth.edits.length} edits` : ''}.`);
  out.push(`Predicted: ${s.predictedCount} beats in the region; seed ${report.fit?.bpm ?? 'refused'} bpm; tracked ${report.follow ? pct(report.follow.tracked) : '—'}, agreement ${report.follow ? pct(report.follow.agreement) : '—'}.`);
  out.push('');
  out.push('## Verdict');
  out.push('');
  out.push('| on time | shifted | missed | spurious | F | continuity | offset mean | offset sd |');
  out.push('|---|---|---|---|---|---|---|---|');
  out.push(`| ${s.counts.on} | ${s.counts.shifted} | ${s.counts.missed} | ${s.counts.spurious} | ${s.fMeasure.toFixed(3)} | ${pct(s.continuity)} | ${ms(s.offsetMs.mean)} ms | ${s.offsetMs.sd.toFixed(1)} ms |`);
  out.push('');
  const shape: string[] = [];
  if (s.octave) shape.push(`**octave**: the map runs at ${s.octave} the true tempo`);
  if (s.offBeat) shape.push('**off-beat**: the map\'s beats fall between the true ones');
  if (s.phase) shape.push(`**phase**: the map's bars start ${s.phase} beat${s.phase > 1 ? 's' : ''} late`);
  out.push(shape.length ? shape.map((x) => `- ${x}`).join('\n') : 'No octave, off-beat or phase error.');
  out.push('');
  out.push('## Offsets of the hits, 5 ms bins');
  out.push('');
  const peak = Math.max(1, ...s.histogram.map((h) => h.count));
  for (const h of s.histogram) {
    if (!h.count) continue;
    out.push(`${String(h.fromMs).padStart(4)} ms ${'█'.repeat(Math.max(1, Math.round((h.count / peak) * 40)))} ${h.count}`);
  }
  out.push('');
  if (s.troubled.length) {
    out.push('## Bars with trouble');
    out.push('');
    for (const b of s.troubled) out.push(`- bar ${b.bar}: ${b.verdicts.join(', ')}`);
    out.push('');
  }
  out.push('## Every true beat');
  out.push('');
  out.push('| # | bar.beat | at s | predicted | offset ms | verdict | anchored | under | local bpm |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of s.rows) {
    const under = r.under ? `${r.under.band} s${r.under.strength.toFixed(2)} l${r.under.level.toFixed(2)}` : 'nothing';
    out.push(
      `| ${r.index} | ${r.bar}.${r.beat} | ${r.at.toFixed(3)} | ${r.predicted ?? ''} | ${ms(r.offsetMs)} | ${r.verdict} | ${r.anchored === null ? '' : r.anchored ? 'yes' : 'no'} | ${under} | ${r.localBpm?.toFixed(2) ?? ''} |`,
    );
  }
  out.push('');
  if (s.spurious.length) {
    out.push('## Spurious predicted beats');
    out.push('');
    out.push(s.spurious.map((j) => `beat ${j} at ${(report.beats!.samples[j] / report.track.rate).toFixed(3)} s`).join(', '));
    out.push('');
  }
  const tempo = report.trace.tempo;
  if (tempo?.candidates) {
    out.push('## The fit that seeded it');
    out.push('');
    out.push('| # | bpm | acf | beatness | outcome |');
    out.push('|---|---|---|---|---|');
    tempo.candidates.forEach((c, i) => {
      const outcome = c.rejected ? `rejected: ${c.rejected}` : tempo.chosen?.candidate === i ? '**chosen**' : '';
      out.push(`| ${i} | ${c.bpm.toFixed(2)} | ${c.score.toFixed(2)} | ${c.beatness?.toFixed(3) ?? ''} | ${outcome} |`);
    });
    if (tempo.chosen) {
      out.push('');
      out.push(`Fitted ${tempo.chosen.fitted.toFixed(3)}, reported ${tempo.chosen.bpm}, agreement ${pct(tempo.chosen.agreement)}. Kick votes by beat of the bar: ${tempo.chosen.votes.map((v) => v.toFixed(1)).join(' / ')}, downbeat on ${tempo.chosen.downbeat + 1}.`);
    }
    if (tempo.refused) out.push(`Refused: ${tempo.refused}`);
    out.push('');
  }
  return out.join('\n');
}
