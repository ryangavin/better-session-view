import { useEffect, useRef, useState, useCallback } from 'react';
import type { Param } from '../src/param/param.ts';
import type { MixerState, MixerCommands, MixerFrame, MixerParams } from '../src/mixer/model.ts';

const STEMS = ['Drums', 'Bass', 'Other', 'Vocals'];


const SECTIONS = ['Intro', 'Verse', 'Build', 'Drop', 'Break', 'Outro'];
const SONGS = [
  { title: 'After the rain', artist: 'North Arcade', bpm: 124, key: '8A' },
  { title: 'Soft machinery', artist: 'Parallel State', bpm: 126, key: '8A' },
  { title: 'Night swimming', artist: 'Low Season', bpm: 122, key: '9A' },
  { title: 'Only the echo', artist: 'Mira Sol', bpm: 124, key: '8B' },
];
const LEVEL: Param = { kind: 'float', min: 0, max: 100, defaultValue: 80, unit: 'percent' };
const TRIM: Param = { kind: 'float', min: -12, max: 12, defaultValue: 0, unit: 'decibel' };
const SEND: Param = { ...LEVEL, defaultValue: 0 };
const EQ: Param = { kind: 'float', min: -24, max: 12, defaultValue: 0, unit: 'decibel' };
const FILTER: Param = { kind: 'float', min: -100, max: 100, defaultValue: 0, unit: 'int' };
const TEMPO: Param = { kind: 'float', min: 80, max: 160, defaultValue: 124, unit: 'float' };
const CROSS: Param = { kind: 'float', min: -100, max: 100, defaultValue: 0, unit: 'int' };
const EFFECTS = ['Delay', 'Reverb', 'Echo', 'Chorus', 'Flanger'];
// Stable, deterministic fixture silhouettes; these are deliberately not audio data.
const PEAKS = SONGS.map((_, deck) => STEMS.map((__, stem) => Array.from({ length: 384 }, (_, i) => {
  const envelope = (0.3 + 0.7 * Math.abs(Math.sin(i * 0.031 + deck))) *
    (0.2 + 0.8 * Math.abs(Math.sin(i * (0.61 + stem * 0.19) + deck * 2)));
  return { min: -envelope * 0.8, max: envelope };
})));
interface DeckState { loop: { start: number | null; end: number | null; enabled: boolean }; positionOffset: number; full: boolean; fullSection: number; fullQueued: number | null; active: number[]; queued: (number | null)[]; levels: number[]; gain: number; trim: number; sendA: number; sendB: number; eq: number[]; filter: number; route: number; cue: boolean }
const initialDecks = (): DeckState[] => SONGS.map((_, i) => ({
  loop: { start: null, end: null, enabled: false }, positionOffset: 0, full: false, fullSection: 3, fullQueued: null, active: [3, 3, 3, 3], queued: [null, null, null, null], levels: [85, 78, 66, 82],
  gain: i < 2 ? 80 : 0, trim: 0, sendA: 0, sendB: 0, eq: [0, 0, 0], filter: 0, route: i % 2 ? 2 : 0, cue: false,
}));


export const previewParams: MixerParams = { level: LEVEL, trim: TRIM, send: SEND, eq: EQ, filter: FILTER, tempo: TEMPO, cross: CROSS };
const deckIds = ['deck-a', 'deck-b', 'deck-c', 'deck-d'];
const stemIds = ['drums', 'bass', 'other', 'vocals'];
const sectionIds = ['intro', 'verse', 'build', 'drop', 'break', 'outro'];
const sectionId = (index: number) => sectionIds[index] ?? null;
const queuedId = (index: number | null) => index === null ? undefined : sectionId(index);
export function usePreviewMixer() {
  const [decks, setDecks] = useState(initialDecks);
  const [running, setRunning] = useState(false);
  const [clock, setClock] = useState({ beat: 0, tick: 0 });
  const beat = clock.beat;
  const phase = useRef({ beat: 0, tick: 0 });
  const [loop, setLoop] = useState<{ start: number | null; end: number | null; enabled: boolean }>({ start: null, end: null, enabled: false });
  const [fxA, setFxA] = useState(0);
  const [fxB, setFxB] = useState(1);
  const [bpm, setBpm] = useState(124);
  const [cross, setCross] = useState(0);
  const [master, setMaster] = useState(80);
  const [masterTrim, setMasterTrim] = useState(0);
  const [masterFilter, setMasterFilter] = useState(0);
  const [masterSendA, setMasterSendA] = useState(0);
  const [masterSendB, setMasterSendB] = useState(0);
  const [masterEq, setMasterEq] = useState([0, 0, 0]);
  const [quantized, setQuantized] = useState(true);
  const [loopBeats, setLoopBeats] = useState(8);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = performance.now();
    const advance = (now: number) => {
      const elapsed = Math.min(100, now - previous) * bpm / 60000;
      previous = now;
      phase.current.tick += elapsed;
      phase.current.beat += elapsed;
      if (loop.enabled && loop.start !== null && loop.end !== null && phase.current.beat >= loop.end) {
        phase.current.beat = loop.start + (phase.current.beat - loop.start) % (loop.end - loop.start);
      }
      const next = { tick: Math.floor(phase.current.tick), beat: Math.floor(phase.current.beat) };
      setClock(c => c.tick === next.tick && c.beat === next.beat ? c : next);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [running, bpm, loop]);
  useEffect(() => {
    if (clock.tick % 4 !== 0) return;
    setDecks(all => all.map(d => ({ ...d, fullSection: d.fullQueued ?? d.fullSection, fullQueued: null, active: d.active.map((a, i) => d.queued[i] ?? a), queued: [null, null, null, null] })));
  }, [clock.tick]);
  const deckBeat = (d: Pick<DeckState, 'loop' | 'positionOffset'>) => {
    const at = phase.current.beat + d.positionOffset;
    return d.loop.enabled && d.loop.start !== null && d.loop.end !== null ? d.loop.start + ((at-d.loop.start) % (d.loop.end-d.loop.start) + d.loop.end-d.loop.start) % (d.loop.end-d.loop.start) : at;
  };
  const update = (deck: number, patch: Partial<DeckState>) => setDecks(all => all.map((d, i) => i === deck ? { ...d, ...patch } : d));
  const launch = (deck: number, section: number, stem?: number) => setDecks(all => all.map((d, i) => {
    if (i !== deck) return d;
    const waiting = running && quantized;
    if (section >= 0) d = { ...d, positionOffset: section * 16 - phase.current.beat,
      loop: stem === undefined ? {start:null,end:null,enabled:false} : {start:section*16,end:(section+1)*16,enabled:true} };
    if (d.full) return { ...d, fullSection: waiting ? d.fullSection : section, fullQueued: waiting ? section : null };
    return { ...d,
      active: d.active.map((a, s) => !waiting && (stem === undefined || s === stem) ? section : a),
      queued: d.queued.map((q, s) => stem === undefined || s === stem ? (waiting ? section : null) : q),
    };
  }));
  const stopAll = () => { setRunning(false); phase.current = { beat: 0, tick: 0 }; setClock({ beat: 0, tick: 0 }); setLoop({ start: null, end: null, enabled: false }); setDecks(all => all.map(d => ({ ...d, positionOffset:0, loop:{start:null,end:null,enabled:false}, fullSection: -1, fullQueued: null, active: [-1, -1, -1, -1], queued: [null, null, null, null] }))); };
  const deckLevel = (d: DeckState) => {
    const weight = d.route === 1 ? 1 : d.route === 0 ? Math.min(1, (100 - cross) / 100) : Math.min(1, (100 + cross) / 100);
    return running ? (d.full ? (d.fullSection < 0 ? 0 : 0.8) : d.levels.reduce((sum, v, s) => sum + (d.active[s] < 0 ? 0 : v / 400), 0)) * 10 ** (d.trim / 20) * d.gain / 100 * weight * (0.68 + 0.2 * Math.exp(-5 * (phase.current.beat % 1)) + 0.05 * Math.sin(phase.current.beat * 7.3)) : 0;
  };

  const state: MixerState = {
    decks: decks.map(({ active, queued, levels, ...d }, index) => ({ ...d, playing:running, canLoopOut:d.loop.start !== null && d.loop.end === null && deckBeat(d)>d.loop.start, id: deckIds[index], letter: 'ABCD'[index],
      track: { ...SONGS[index], id: `track-${index}` }, status: 'ready', peaks: PEAKS[index][0],
      sections: SECTIONS.map((name, i) => ({ id: sectionIds[i], name })),
      stems: STEMS.map((name, i) => ({ id: stemIds[i], name, available: true, level: levels[i], selected: sectionId(active[i]), queued: queuedId(queued[i]) })),
      fullSection: sectionId(d.fullSection), fullQueued: queuedId(d.fullQueued),
    })),
    running, beat, loop, canLoopOut: loop.start !== null && beat > loop.start,
    bpm, quantized, loopBeats, cross, master, masterTrim, masterFilter, masterSendA, masterSendB, masterEq,
    effects: EFFECTS.map(name => ({ id: name.toLowerCase(), name })),
    fxA: EFFECTS[fxA].toLowerCase(), fxB: EFFECTS[fxB].toLowerCase(),
  };
  const commands: MixerCommands = {
    setRunning, stopAll,
    deckLoopIn: id => { const i=deckIds.indexOf(id); if(i>=0) { const at=deckBeat(decks[i]); update(i,{positionOffset:at-phase.current.beat,loop:{start:at,end:null,enabled:false}}); } },
    deckLoopOut: id => { const i=deckIds.indexOf(id); if(i>=0 && decks[i].loop.start!==null && deckBeat(decks[i])>decks[i].loop.start!) update(i,{loop:{...decks[i].loop,end:deckBeat(decks[i]),enabled:true}}); },
    setDeckLoopEnabled: (id,enabled) => { const i=deckIds.indexOf(id); if(i>=0) update(i,{positionOffset:(enabled?decks[i].loop.start ?? deckBeat(decks[i]):deckBeat(decks[i]))-phase.current.beat,loop:{...decks[i].loop,enabled}}); },
    setLoopBeats,
    setQuantized: value => { setQuantized(value); if (!value) setDecks(all => all.map(d => ({ ...d, fullSection: d.fullQueued ?? d.fullSection, fullQueued: null, active: d.active.map((a, i) => d.queued[i] ?? a), queued: [null, null, null, null] }))); },
    loopIn: () => setLoop({ start: beat, end: null, enabled: false }),
    loopOut: () => { if (loop.start !== null && beat > loop.start) setLoop(l => ({ ...l, end: beat, enabled: true })); },
    setLoopEnabled: enabled => { setLoop(l => ({ ...l, enabled })); if (enabled && loop.start !== null) { phase.current.beat = loop.start; setClock(c => ({ ...c, beat: loop.start! })); } },
    setEffect: (slot, id) => { const i = EFFECTS.findIndex(name => name.toLowerCase() === id); if (i >= 0) (slot === 'A' ? setFxA : setFxB)(i); },
    setMaster: (control, value) => ({ bpm: setBpm, cross: setCross, master: setMaster, masterTrim: setMasterTrim, masterFilter: setMasterFilter, masterSendA: setMasterSendA, masterSendB: setMasterSendB })[control](value),
    setMasterEq: (band, value) => setMasterEq(all => all.map((v, i) => i === band ? value : v)),
    setDeck: (id, control, value) => {
      const index = deckIds.indexOf(id); if (index < 0) return;
      const d = decks[index];
      if (control === 'full') update(index, { full: !!value, ...(value ? { fullSection: d.active.find(section => section >= 0) ?? -1, fullQueued: null } : {}) });
      else update(index, { [control]: value });
    },
    setDeckEq: (id, band, value) => { const i = deckIds.indexOf(id); if (i >= 0) update(i, { eq: decks[i].eq.map((v, e) => e === band ? value : v) }); },
    setStemLevel: (id, stem, value) => { const i = deckIds.indexOf(id), s = stemIds.indexOf(stem); if (i >= 0 && s >= 0) update(i, { levels: decks[i].levels.map((v, e) => e === s ? value : v) }); },
    launch: (id, section, stem) => { const i = deckIds.indexOf(id), s = stem === undefined ? undefined : stemIds.indexOf(stem); if (i >= 0 && (s === undefined || s >= 0) && (section === null || sectionIds.includes(section))) launch(i, section === null ? -1 : sectionIds.indexOf(section), s); },
  };
  // Stable frame reader; render-frequency controls and the fractional clock stay behind it.
  const sample = useRef<() => MixerFrame>(() => ({ decks: {}, masterLevel: 0 }));
  sample.current = () => ({
    decks: Object.fromEntries(decks.map((d, i) => [deckIds[i], { beat: deckBeat(d), level: deckLevel(d) }])),
    masterLevel: Math.min(1, decks.reduce((sum, d) => sum + deckLevel(d), 0) * 10 ** (masterTrim / 20) * master / 100),
  });
  const readFrame = useCallback(() => sample.current(), []);
  return { state, commands, readFrame, params: previewParams };
}
