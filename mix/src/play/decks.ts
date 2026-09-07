import { EFFECTS } from './effects.ts';
import type { MixerDeck, MixerParams, MixerState } from '@openflow/widgets/mixer/model.ts';
import { decode, fileUrl, type Peak } from '../audio.ts';
import { openflow, type Track, type Analysis } from '../openflow.ts';
import { evenBeats, sampleOf, tempoOf } from '../warp.ts';

export const TRACK_DRAG = 'application/x-openflow-library-track';
export const DECK_IDS = ['deck-a', 'deck-b', 'deck-c', 'deck-d'];
const STANDARD = ['drums', 'bass', 'other', 'vocals'];
export function emptyDeck(id: string, i: number): MixerDeck {
  return { id, letter: 'ABCD'[i], track: null, status: 'empty', message: 'Drop a library track here', peaks: [], sections: [],
    stems: STANDARD.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), available: false, level: 80, selected: null, queued: undefined })),
    full: false, fullSection: null, fullQueued: undefined, gain: 80, trim: 0, sendA: 0, sendB: 0, filter: 0, eq: [0,0,0], route: i % 2 ? 2 : 0, cue: false };
}
export function initialMixer(): MixerState {
  return { decks: DECK_IDS.map(emptyDeck), running: false, beat: 0, loop: { start: null, end: null, enabled: false }, canLoopOut: false,
    bpm: 124, quantized: false, cross: 0, master: 80, masterTrim: 0, masterFilter: 0, masterSendA: 0, masterSendB: 0, masterEq: [0,0,0],
    effects: EFFECTS, fxA: 'delay', fxB: 'reverb', playbackAvailable: false };
}
export const params: MixerParams = {
  level: {kind:'float', min:0, max:100, defaultValue:80, unit:'percent'},
  trim: {kind:'float', min:-12, max:12, defaultValue:0, unit:'decibel'},
  send: {kind:'float', min:0, max:100, defaultValue:0, unit:'percent'},
  eq: {kind:'float', min:-24, max:12, defaultValue:0, unit:'decibel'},
  filter: {kind:'float', min:-100, max:100, defaultValue:0, unit:'int'},
  tempo: {kind:'float', min:20, max:300, defaultValue:124, unit:'float'},
  cross: {kind:'float', min:-100, max:100, defaultValue:0, unit:'int'},
};
export interface DeckAsset { analysis: Analysis | null; peaks: Peak[] }
/** Preview only: decode the original offline, retain peaks, release the audio buffer. */
export async function loadDeckAsset(track: Track, signal: AbortSignal): Promise<DeckAsset> {
  const bridge = openflow();
  if (!bridge) throw new Error('Library connection unavailable');
  const [base, analysis] = await Promise.all([bridge.library.base(), bridge.analysis.read(track.id)]);
  signal.throwIfAborted();
  if (!analysis?.grid) return {analysis, peaks: []};
  const response = await fetch(fileUrl(base, track.file), {signal});
  if (!response.ok) throw new Error(`Could not load waveform (${response.status})`);
  const buffer = await decode(new OfflineAudioContext(2, 1, 22050), await response.arrayBuffer());
  signal.throwIfAborted();
  const grid = analysis.grid.beats ?? evenBeats(buffer.sampleRate, buffer.length, analysis.grid.bpm, analysis.grid.offset);
  const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i));
  const peaks = Array.from({length: 1024}, (_, i) => {
    const from = Math.max(0, Math.floor(sampleOf(grid, i / 1024 * 128) / grid.rate * buffer.sampleRate));
    const to = Math.min(buffer.length, Math.ceil(sampleOf(grid, (i + 1) / 1024 * 128) / grid.rate * buffer.sampleRate));
    let min = 0, max = 0;
    for (let n = from; n < to; n++) for (const channel of channels) { min = Math.min(min, channel[n]); max = Math.max(max, channel[n]); }
    return {min, max};
  });
  return {analysis, peaks};
}
export function loadedDeck(deck: MixerDeck, track: Track, asset: DeckAsset): MixerDeck {
  const grid = asset.analysis?.grid;
  const sources = track.stems ? [...STANDARD, ...track.sources.filter(id => !STANDARD.includes(id))] : STANDARD;
  const cuts = asset.analysis?.slices;
  return { ...deck, status: 'ready', track: { id: track.id, title: track.title, artist: track.artist ?? '', bpm: grid?.beats ? tempoOf(grid.beats) : grid?.bpm ?? track.bpm, key: track.key ?? '—' },
    peaks: asset.peaks, full: !track.stems, fullSection: null, fullQueued: undefined,
    message: !grid ? 'No saved beat grid — prepare this track first' : !cuts?.length ? 'No saved sections — full track available' : undefined,
    sections: cuts?.length ? cuts.map((cut, i) => ({id: `section-${i}-${cut.bar}`, name: cut.name})) : [{id:'full-track', name:'Track'}],
    stems: sources.map(id => ({id, name: id[0].toUpperCase()+id.slice(1), level:80, available: !!track.stems && track.sources.includes(id), selected:null, queued:undefined})),
  };
}
/** Plain Tab switches views; editable controls and modal/menu focus keep native navigation. */
export function isViewShortcut(event: KeyboardEvent): boolean {
  const el = event.target instanceof Element ? event.target : null;
  return event.key === 'Tab' && !event.repeat && !event.defaultPrevented && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="combobox"], [role="dialog"], dialog, [role="listbox"]');
}
