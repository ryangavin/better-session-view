import { useCallback, useEffect, useRef, useState } from 'react';
import type { MixerCommands, MixerDeck, MixerFrame } from '@openflow/widgets/mixer/model.ts';
import type { Track } from '../openflow.ts';
import { DECK_IDS, emptyDeck, initialMixer, loadedDeck, loadDeckAsset, params } from './decks.ts';

const SILENT: MixerFrame = { decks: {}, masterLevel: 0 };
const readFrame = () => SILENT;
/** App-owned UI state. An audio controller can replace command handling and frame readings. */
export function useMixerViewModel(tracks: readonly Track[], root: string | null, loader = loadDeckAsset) {
  const [state, setState] = useState(initialMixer);
  const requests = useRef(new Map<string, AbortController>());
  const updateDeck = useCallback((id: string, fn: (deck: MixerDeck) => MixerDeck) => setState(s => ({...s, decks: s.decks.map(d => d.id === id ? fn(d) : d)})), []);
  useEffect(() => {
    setState(initialMixer());
    return () => { for (const request of requests.current.values()) request.abort(); requests.current.clear(); };
  }, [root]);
  const load = useCallback(async (deckId: string, trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!root || !track || !DECK_IDS.includes(deckId)) return;
    requests.current.get(deckId)?.abort();
    const request = new AbortController();
    requests.current.set(deckId, request);
    const fresh = emptyDeck(deckId, DECK_IDS.indexOf(deckId));
    const metadata = {id: track.id, title: track.title, artist: track.artist ?? '', bpm: track.bpm, key: track.key ?? '—'};
    updateDeck(deckId, () => ({...fresh, track: metadata, status:'loading', message:'Loading track…'}));
    try {
      const asset = await loader(track, request.signal);
      if (!request.signal.aborted) updateDeck(deckId, d => loadedDeck(d, track, asset));
    } catch (error) {
      if (!request.signal.aborted) updateDeck(deckId, d => ({...d, status:'unavailable', message: error instanceof Error ? error.message : 'Could not load track'}));
    } finally { if (requests.current.get(deckId) === request) requests.current.delete(deckId); }
  }, [tracks, root, loader, updateDeck]);
  const commands: MixerCommands = {
    setRunning: () => {}, loopIn: () => {}, loopOut: () => {}, setLoopEnabled: () => {},
    setQuantized: value => setState(s => ({...s, quantized:value})),
    stopAll: () => setState(s => ({...s, decks:s.decks.map(d => ({...d, fullSection:null, fullQueued:undefined, stems:d.stems.map(stem => ({...stem,selected:null,queued:undefined}))}))})),
    setEffect: (slot,id) => setState(s => ({...s, [slot === 'A' ? 'fxA' : 'fxB']:id})),
    setMaster: (control,value) => setState(s => ({...s,[control]:value})),
    setMasterEq: (band,value) => setState(s => ({...s,masterEq:s.masterEq.map((v,i) => i === band ? value : v)})),
    setDeck: (id,control,value) => updateDeck(id,d => ({...d,[control]:value})),
    setDeckEq: (id,band,value) => updateDeck(id,d => ({...d,eq:d.eq.map((v,i) => i === band ? value : v)})),
    setStemLevel: (id,stemId,value) => updateDeck(id,d => ({...d,stems:d.stems.map(stem => stem.id === stemId ? {...stem,level:value} : stem)})),
    launch: (id,section,stemId) => updateDeck(id,d => d.status !== 'ready' || section !== null && !d.sections.some(s => s.id === section) ? d : d.full
      ? {...d, fullSection:section}
      : {...d, stems:d.stems.map(stem => stem.available && (!stemId || stem.id === stemId) ? {...stem,selected:section,queued:undefined} : stem)}),
  };
  return { state, commands, readFrame, params, load };
}
