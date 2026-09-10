import type { SpectralEnergy } from '@openflow/widgets/theme/spectral.ts';
import { EFFECTS } from './effects.ts';
import type { MixerDeck, MixerParams, MixerState } from '@openflow/widgets/mixer/model.ts';
import { decode, fileUrl, stemUrl, type Peak } from '../audio.ts';
import { openflow, type Track, type Analysis } from '../openflow.ts';
import { FIRST_CHOICE } from '../algorithms.ts';
import { findGrid, gridOf } from './fit.ts';
import { evenBeats, tempoOf, type Beats } from '../warp.ts';

import { measureScan, overviewOf, type Overview } from './overview.ts';
import { binsOf, SCAN_RATE, SCAN_VALUES, type Scan } from './scan.ts';

/** What a track nothing has been decided about starts from, for a fit to fill in. */
const emptyAnalysis = (track: string): Analysis => ({ openflow: 'mix-analysis', version: 1, track, grid: null, fit: null, slices: null, produced: '' });
export const TRACK_DRAG = 'application/x-openflow-library-track';
export const DECK_IDS = ['deck-a', 'deck-b', 'deck-c', 'deck-d'];
const STANDARD = ['drums', 'bass', 'other', 'vocals'];
export function emptyDeck(id: string, i: number): MixerDeck {
  return { id, letter: 'ABCD'[i], track: null, status: 'empty', message: 'Drop a library track here', peaks: [], sections: [],
    stems: STANDARD.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), available: false, level: 100, selected: null, queued: undefined })),
    full: false, fullSection: null, fullQueued: undefined, gain: 100, trim: 0, sendA: 0, sendB: 0, filter: 0, eq: [0,0,0], route: i % 2 ? 2 : 0, cue: false };
}
export function initialMixer(): MixerState {
  return { decks: DECK_IDS.map(emptyDeck), running: false, beat: 0, loop: { start: null, end: null, enabled: false }, canLoopOut: false,
    bpm: 120, launchBeats: 4, quantize: 0, loopBeats: 8, cross: 0, master: 100, masterTrim: 0, masterFilter: 0, masterSendA: 0, masterSendB: 0, masterEq: [0,0,0],
    effectsEnabled:true,effectEnabled:{A:true,B:true},effectTailing:false,phonesLevel:100,phonesMix:0,
    effects: EFFECTS, fxA: 'delay', fxB: 'reverb', playbackAvailable: false };
}
export const params: MixerParams = {
  stemLevel: {kind:'float', min:0, max:100, defaultValue:100, unit:'percent'},
  level: {kind:'float', min:0, max:100, defaultValue:100, unit:'percent'},
  trim: {kind:'float', min:-12, max:12, defaultValue:0, unit:'decibel'},
  send: {kind:'float', min:0, max:100, defaultValue:0, unit:'percent'},
  eq: {kind:'float', min:-24, max:12, defaultValue:0, unit:'decibel'},
  filter: {kind:'float', min:-100, max:100, defaultValue:0, unit:'int'},
  tempo: {kind:'float', min:20, max:300, defaultValue:124, unit:'float'},
  cross: {kind:'float', min:-100, max:100, defaultValue:0, unit:'int'},
};
export interface DeckAudio { buffers: Record<string, AudioBuffer>; map: Beats | null; duration: number; overview: Peak[]; overviewStart?: number; overviewSpectrum?: SpectralEnergy[]; sourceOverviews?: Record<string, Overview> }
export interface DeckAsset { analysis: Analysis | null; peaks: Peak[]; audio?: DeckAudio }
/**
 * Decode the original and available stems into the engine's shared context.
 *
 * Everything is read at once. `decodeAudioData` does its work off the main
 * thread, so five files decoded one after another spent most of the load
 * waiting for a core that was idle; asked for together they overlap, which is
 * the difference between five seconds and two.
 *
 * The samples are walked only where nothing was kept. A scan beside the track
 * is what makes the second load of a song immediate, and the first load is
 * what writes it — including for a track that was never separated, which has
 * only its original to keep.
 *
 * A track with no grid gets one here rather than being handed to a deck
 * ungridded. It runs in a worker while this thread walks the scans, so the two
 * seconds it takes are two seconds the window spends doing something else, and
 * the drawing does not wait on it either: a scan is measured against time, so
 * the columns are gathered once the grid is known and are right whichever grid
 * that is.
 */
export async function loadDeckAsset(track: Track, signal: AbortSignal, context?: BaseAudioContext, stage?: (message: string) => void): Promise<DeckAsset> {
  const bridge = openflow();
  if (!bridge) throw new Error('Library connection unavailable');
  const [base, analysis, kept] = await Promise.all([
    bridge.library.base(),
    bridge.analysis.read(track.id),
    bridge.analysis.scans(track.id, track.stems ?? '').catch(() => null),
  ]);
  signal.throwIfAborted();
  const ctx = context ?? new OfflineAudioContext(2, 1, 48000);
  const read = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Could not load audio (${response.status})`);
    const buffer = await decode(ctx, await response.arrayBuffer()); signal.throwIfAborted(); return buffer;
  };
  const sources: [string, string][] = [['full', fileUrl(base, track.file)],
    ...(track.stems ? track.sources.map((id): [string, string] => [id, stemUrl(base, track.stems!, id)]) : [])];
  const decoded = await Promise.all(sources.map(async ([id, url]) => [id, await read(url)] as const));
  const buffers: Record<string, AudioBuffer> = Object.fromEntries(decoded);
  const original = buffers.full;
  // A refusal is kept as well as a grid: a track with nothing steady in it is
  // not asked again every time it is dropped.
  const finding = analysis?.grid || analysis?.fitFailed ? null : findGrid(original, signal);
  if (finding) stage?.('Finding the beat…');
  const scans: Record<string, Scan> = {};
  let walked = false;
  for (const [id, buffer] of decoded) {
    const held = kept?.rate === SCAN_RATE ? kept.sources[id] : undefined;
    // A kept scan has to be of this audio: a bin count that disagrees with what
    // decoded belongs to a file that has been replaced under the same name.
    if (held && held.bins === binsOf(buffer.duration) && held.values.length === held.bins * SCAN_VALUES) {
      scans[id] = { rate: SCAN_RATE, bins: held.bins, values: held.values };
    } else {
      scans[id] = await measureScan(buffer, signal);
      walked = true;
    }
  }
  const found = finding ? await finding : null;
  signal.throwIfAborted();
  const measured = found ? {...gridOf(found), fitFailed: !found.found} : null;
  if (measured) {
    void bridge.analysis.write(track.id, measured.grid, measured.fit, analysis?.slices ?? null, measured.fitFailed, measured.grid ? FIRST_CHOICE : null).catch(() => undefined);
  }
  const held = measured ? {...(analysis ?? emptyAnalysis(track.id)), ...measured} : analysis;
  const grid = held?.grid ?? null;
  const map = grid ? grid.beats ?? evenBeats(original.sampleRate, original.length, grid.bpm, grid.offset) : null;
  const displayMap = map ?? evenBeats(original.sampleRate, original.length, track.bpm ?? 120, 0);
  const sourceOverviews: Record<string, Overview> = Object.fromEntries(
    Object.entries(scans).map(([id, scan]) => [id, overviewOf(scan, displayMap, buffers[id].duration)]));
  // Kept before the deck is playable, and on purpose: a walk thrown away
  // because the next track was dropped first is a walk paid for again.
  if (walked) void bridge.analysis.keepScans(track.id, track.stems ?? '', SCAN_RATE,
    Object.fromEntries(Object.entries(scans).map(([id, scan]) => [id, {bins: scan.bins, values: scan.values}]))).catch(() => undefined);
  const overview = sourceOverviews.full;
  return {analysis: held, peaks: overview.peaks.slice(0, 1024), audio: { buffers, map, duration: original.duration,
    sourceOverviews, overview: overview.peaks, overviewStart: overview.start, overviewSpectrum: overview.spectrum }};
}
export function loadedDeck(deck: MixerDeck, track: Track, asset: DeckAsset): MixerDeck {
  const grid = asset.analysis?.grid;
  const sources = track.stems ? [...STANDARD, ...track.sources.filter(id => !STANDARD.includes(id))] : STANDARD;
  const cuts = asset.analysis?.slices;
  return { ...deck, status: 'ready', track: { id: track.id, title: track.title, artist: track.artist ?? '', bpm: grid?.beats ? tempoOf(grid.beats) : grid?.bpm ?? track.bpm, key: track.key ?? '—' },
    focus: track.sources.includes('drums') ? 'drums' : track.sources[0] ?? 'full', moveTogether: true, independentStems: false, zoom: 32, gridAvailable: !!grid,
    peaks: asset.peaks, full: true, fullSection: null, fullQueued: undefined,
    message: !grid ? 'No steady tempo found — Sync unavailable' : undefined,
    sections: cuts?.length ? cuts.map((cut, i) => ({id: `section-${i}-${cut.bar}`, name: cut.name})) : [{id:'full-track', name:'Track'}],
    stems: sources.map(id => ({id, name: id[0].toUpperCase()+id.slice(1), level:100, available: asset.audio ? (asset.audio.buffers[id]?.duration ?? 0) > 0 : !!track.stems && track.sources.includes(id), selected:null, queued:undefined})),
  };
}
/** Plain Tab switches views; editable controls and modal/menu focus keep native navigation. */
export function isViewShortcut(event: KeyboardEvent): boolean {
  const el = event.target instanceof Element ? event.target : null;
  return event.key === 'Tab' && !event.repeat && !event.defaultPrevented && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="combobox"], [role="dialog"], dialog, [role="listbox"]');
}
