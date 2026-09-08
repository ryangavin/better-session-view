import type { SpectralEnergy } from '@openflow/widgets/theme/spectral.ts';
import { EFFECTS } from './effects.ts';
import type { MixerDeck, MixerParams, MixerState } from '@openflow/widgets/mixer/model.ts';
import { decode, fileUrl, stemUrl, type Peak } from '../audio.ts';
import { openflow, type Track, type Analysis } from '../openflow.ts';
import { evenBeats, tempoOf, type Beats } from '../warp.ts';

import { measureOverview, type Overview } from './overview.ts';

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
    bpm: 124, launchBeats: 4, quantize: 0, loopBeats: 8, cross: 0, master: 100, masterTrim: 0, masterFilter: 0, masterSendA: 0, masterSendB: 0, masterEq: [0,0,0],
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
/** Decode the original and available stems into the engine's shared context. */
export async function loadDeckAsset(track: Track, signal: AbortSignal, context?: BaseAudioContext): Promise<DeckAsset> {
  const bridge = openflow();
  if (!bridge) throw new Error('Library connection unavailable');
  const [base, analysis] = await Promise.all([bridge.library.base(), bridge.analysis.read(track.id)]);
  signal.throwIfAborted();
  const ctx = context ?? new OfflineAudioContext(2, 1, 48000);
  const read = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Could not load audio (${response.status})`);
    const buffer = await decode(ctx, await response.arrayBuffer()); signal.throwIfAborted(); return buffer;
  };
  const original = await read(fileUrl(base, track.file));
  const buffers: Record<string, AudioBuffer> = { full: original };
  if (track.stems) for (const id of track.sources) buffers[id] = await read(stemUrl(base, track.stems, id));
  const map = analysis?.grid ? analysis.grid.beats ?? evenBeats(original.sampleRate, original.length, analysis.grid.bpm, analysis.grid.offset) : null;
  const displayMap = map ?? evenBeats(original.sampleRate, original.length, track.bpm ?? 120, 0);
  const overview = await measureOverview(original, displayMap, signal);
  const sourceOverviews: Record<string, Overview> = {full: overview};
  for (const [id, buffer] of Object.entries(buffers)) if (id !== 'full') sourceOverviews[id] = await measureOverview(buffer, displayMap, signal);
  return {analysis, peaks: overview.peaks.slice(0, 1024), audio: { buffers, map, duration: original.duration,
    sourceOverviews, overview: overview.peaks, overviewStart: overview.start, overviewSpectrum: overview.spectrum }};
}
export function loadedDeck(deck: MixerDeck, track: Track, asset: DeckAsset): MixerDeck {
  const grid = asset.analysis?.grid;
  const sources = track.stems ? [...STANDARD, ...track.sources.filter(id => !STANDARD.includes(id))] : STANDARD;
  const cuts = asset.analysis?.slices;
  return { ...deck, status: 'ready', track: { id: track.id, title: track.title, artist: track.artist ?? '', bpm: grid?.beats ? tempoOf(grid.beats) : grid?.bpm ?? track.bpm, key: track.key ?? '—' },
    focus: track.sources.includes('drums') ? 'drums' : track.sources[0] ?? 'full', moveTogether: true, independentStems: false, zoom: 32, gridAvailable: !!grid,
    peaks: asset.peaks, full: true, fullSection: null, fullQueued: undefined,
    message: !grid ? 'No saved beat grid — Sync unavailable' : !cuts?.length ? 'No saved sections — full track available' : undefined,
    sections: cuts?.length ? cuts.map((cut, i) => ({id: `section-${i}-${cut.bar}`, name: cut.name})) : [{id:'full-track', name:'Track'}],
    stems: sources.map(id => ({id, name: id[0].toUpperCase()+id.slice(1), level:100, available: !!track.stems && track.sources.includes(id), selected:null, queued:undefined})),
  };
}
/** Plain Tab switches views; editable controls and modal/menu focus keep native navigation. */
export function isViewShortcut(event: KeyboardEvent): boolean {
  const el = event.target instanceof Element ? event.target : null;
  return event.key === 'Tab' && !event.repeat && !event.defaultPrevented && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="combobox"], [role="dialog"], dialog, [role="listbox"]');
}
