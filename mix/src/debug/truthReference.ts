import type { Truth, Report } from '../../harness/types.ts';
import { score } from '../../harness/score.ts';
import type { Beats } from '../warp.ts';
import type { Heard } from '../transients.ts';

export function readReference(text: string, track: string, seconds: number): Truth {
  const value = JSON.parse(text) as Truth;
  if (!value || value.track !== track) throw new Error('Reference must name the selected track ID.');
  const { region, beats } = value;
  if (!region || !Number.isFinite(region.from) || !Number.isFinite(region.to) || region.from < 0 || region.to <= region.from || region.to > seconds + 0.01) throw new Error('Reference region must lie inside this track.');
  if (!beats || !Number.isFinite(beats.rate) || beats.rate <= 0 || !Array.isArray(beats.samples) || !beats.samples.length || beats.samples.length > 100000) throw new Error('Reference needs a valid rate and beat samples.');
  if (beats.samples.some((s, i) => !Number.isFinite(s) || s / beats.rate < region.from || s / beats.rate > region.to || (i > 0 && s <= beats.samples[i - 1]))) throw new Error('Reference beats must increase and lie inside its region.');
  if (!Array.isArray(beats.downbeat) || beats.downbeat.some((i) => !Number.isInteger(i) || i < 0 || i >= beats.samples.length)) throw new Error('Downbeats must be valid indices into the reference beats.');
  if (value.source !== 'manual' && value.source !== 'known') throw new Error('Reference source must be manual or known.');
  return value;
}

/** The existing scorer assumes one sample rate; adapt a candidate without changing its times. */
export function scoreReference(beats: Beats, heard: Heard, truth: Truth) {
  const rate = truth.beats.rate;
  const report: Report = { track: { id: truth.track, title: '', seconds: heard.seconds, rate, stems: [] }, heard,
    beats: { ...beats, rate, length: beats.length / beats.rate * rate, samples: beats.samples.map((s) => s / beats.rate * rate) },
    fit: null, follow: null, trace: {}, peaks: { drums: [], per: 1 }, known: null };
  return score(report, truth);
}
