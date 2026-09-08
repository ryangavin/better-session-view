// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { emptyDeck, loadDeckAsset, loadedDeck, isViewShortcut, type DeckAsset } from './decks.ts';
import { useMixerViewModel } from './useMixerViewModel.ts';
import { SCAN_RATE, SCAN_VALUES } from './scan.ts';
import { openflow, type Track } from '../openflow.ts';

vi.mock('../openflow.ts', async (original) => ({ ...(await original<object>()), openflow: vi.fn() }));
vi.mock('../audio.ts', async (original) => ({ ...(await original<object>()), decode: vi.fn(async () => sound()) }));
const SECONDS = 2, RATE = 44100;
function sound(readable = false): AudioBuffer {
  const channel = new Float32Array(SECONDS*RATE);
  return { duration: SECONDS, sampleRate: RATE, length: SECONDS*RATE, numberOfChannels: 1,
    getChannelData: () => { if (!readable) throw new Error('walked audio that was already kept'); return channel; } } as unknown as AudioBuffer;
}

const track = (id: string): Track => ({id,title:id,artist:'Artist',file:`tracks/${id}.wav`,album:null,art:null,bpm:null,key:null,seconds:60,added:'',model:'six',stems:`stems/${id}`,sources:['drums','bass','other','vocals','guitar','piano']});
const tracks = [track('one'),track('two')];
const asset: DeckAsset = { peaks:[{min:-.5,max:.7}], analysis:{openflow:'mix-analysis',version:1,track:'one',grid:null,fit:null,slices:[{bar:0,name:'Verse'},{bar:8,name:'Verse'}],produced:''} };
afterEach(cleanup);
describe('deck loading and UI ownership', () => {
  it('keeps six source identities and unique section IDs without inventing tempo', () => {
    const d = loadedDeck(emptyDeck('deck-a',0), tracks[0],asset);
    expect(d.stems).toHaveLength(6);
    expect(d.stems.every(s => s.available)).toBe(true);
    expect(d.sections.map(s => s.name)).toEqual(['Verse','Verse']);
    expect(d.sections[0].id).not.toBe(d.sections[1].id);
    expect(d.track?.bpm).toBe(null);
  });
  it('does not invent stems or sections for an unseparated track', () => {
    const d=loadedDeck(emptyDeck('deck-a',0),{...tracks[0],stems:null,sources:[]},{analysis:null,peaks:[]});
    expect(d.full).toBe(true);
    expect(d.stems.every(s => !s.available)).toBe(true);
    expect(d.sections).toEqual([{id:'full-track',name:'Track'}]);
  });
  it('retains effect settings independently across slots and effect changes', () => {
    const { result } = renderHook(() => useMixerViewModel(tracks, 'library'));
    act(() => result.current.commands.setEffectParam!('A', 'delay', 'feedback', 71));
    act(() => result.current.commands.setEffect('A', 'reverb'));
    act(() => result.current.commands.setEffectParam!('A', 'reverb', 'decay', 4));
    act(() => result.current.commands.setEffectParam!('B', 'delay', 'feedback', 22));
    act(() => result.current.commands.setEffect('A', 'delay'));
    expect(result.current.state.effectValues).toEqual({ A: { delay: { feedback: 71 }, reverb: { decay: 4 } }, B: { delay: { feedback: 22 } } });
    expect(result.current.readFrame().masterLevel).toBe(0);
  });
  it('a newer drop wins even when an older load finishes last', async () => {
    const pending: {signal:AbortSignal; resolve(value:DeckAsset):void}[]=[];
    const loader=vi.fn((_track:Track,signal:AbortSignal) => new Promise<DeckAsset>(resolve => pending.push({signal,resolve})));
    const {result}=renderHook(() => useMixerViewModel(tracks,'library',loader));
    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first=result.current.load('deck-a','one'); });
    act(() => { second=result.current.load('deck-a','two'); });
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => {pending[1].resolve(asset); await second;});
    await act(async () => {pending[0].resolve(asset); await first;});
    expect(result.current.state.decks[0].track?.id).toBe('two');
    expect(result.current.state.decks[1].status).toBe('empty');
    expect(result.current.readFrame().masterLevel).toBe(0);
    act(() => result.current.commands.setRunning(true));
    expect(result.current.state.running).toBe(false);
  });
  it('rejects foreign drag IDs and resets/aborts when the library changes', async () => {
    let signal!: AbortSignal, finish!: (value:DeckAsset)=>void;
    const loader=vi.fn((_track:Track,s:AbortSignal) => {signal=s; return new Promise<DeckAsset>(resolve => {finish=resolve;});});
    const {result,rerender}=renderHook(({root})=>useMixerViewModel(tracks,root,loader),{initialProps:{root:'first'}});
    await act(async()=>{await result.current.load('deck-a','foreign');});
    expect(loader).not.toHaveBeenCalled();
    let task!:Promise<void>;
    act(()=>{task=result.current.load('deck-a','one');});
    rerender({root:'second'});
    expect(signal.aborted).toBe(true);
    await act(async()=>{finish(asset); await task;});
    expect(result.current.state.decks[0].status).toBe('empty');
  });
  it('reports failures and allows a later drop to recover', async () => {
    const loader=vi.fn().mockRejectedValueOnce(new Error('Missing file')).mockResolvedValue(asset);
    const {result}=renderHook(()=>useMixerViewModel(tracks,'library',loader));
    await act(async()=>{await result.current.load('deck-b','one');});
    expect(result.current.state.decks[1].message).toBe('Missing file');
    await act(async()=>{await result.current.load('deck-b','two');});
    expect(result.current.state.decks[1].status).toBe('ready');
  });
});
describe('what a deck reads before it can play', () => {
  type Kept = Record<string, { bins: number; values: Float32Array }>;
  const keepScans = vi.fn(async (_id: string, _stems: string, _rate: number, _sources: Kept) => {});
  const scans = vi.fn();
  let opened: string[] = [];
  beforeEach(async () => {
    opened = []; keepScans.mockClear();
    scans.mockReset(); scans.mockResolvedValue(null);
    // Kept audio is unreadable on purpose: a walk of it fails the test loudly.
    vi.mocked(await import('../audio.ts')).decode.mockImplementation(async () => sound());
    vi.mocked(openflow).mockReturnValue({ library: { base: async () => 'lib' },
      analysis: { read: async () => null, scans, keepScans } } as unknown as ReturnType<typeof openflow>);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { opened.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const bins = Math.round(SECONDS*SCAN_RATE);
  const held = (name: string) => [name, { bins, values: new Float32Array(bins*SCAN_VALUES).fill(.25) }] as const;

  it('reads every source at once rather than one after another', async () => {
    vi.mocked(await import('../audio.ts')).decode.mockImplementation(async () => sound(true));
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { opened.push(url); await waiting; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; }));
    const loading = loadDeckAsset(tracks[0], new AbortController().signal, {} as BaseAudioContext);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(opened).toHaveLength(7);
    release();
    await loading;
  });

  it('draws a kept scan without walking the samples again', async () => {
    scans.mockResolvedValue({ stems: tracks[0].stems, key: '', rate: SCAN_RATE,
      sources: Object.fromEntries(['full', ...tracks[0].sources].map(held)) });
    const asset = await loadDeckAsset(tracks[0], new AbortController().signal, {} as BaseAudioContext);
    expect(scans).toHaveBeenCalledWith('one', 'stems/one');
    expect(keepScans).not.toHaveBeenCalled();
    expect(asset.audio!.sourceOverviews!.drums.peaks.every(p => p.max === .25)).toBe(true);
  });

  it('walks and keeps what was never kept, including a track with no stems', async () => {
    vi.mocked(await import('../audio.ts')).decode.mockImplementation(async () => sound(true));
    await loadDeckAsset({ ...tracks[0], stems: null, sources: [] }, new AbortController().signal, {} as BaseAudioContext);
    expect(opened).toHaveLength(1);
    const [trackId, stems, rate, kept] = keepScans.mock.calls[0];
    expect([trackId, stems, rate]).toEqual(['one', '', SCAN_RATE]);
    expect(Object.keys(kept)).toEqual(['full']);
    expect(kept.full.bins).toBe(bins);
  });

  it('walks again where a kept scan is of audio that has since been replaced', async () => {
    vi.mocked(await import('../audio.ts')).decode.mockImplementation(async () => sound(true));
    scans.mockResolvedValue({ stems: tracks[0].stems, key: '', rate: SCAN_RATE,
      sources: { full: { bins: bins + 40, values: new Float32Array((bins + 40)*SCAN_VALUES) } } });
    await loadDeckAsset(tracks[0], new AbortController().signal, {} as BaseAudioContext);
    expect(Object.keys(keepScans.mock.calls[0][3])).toHaveLength(7);
  });
});

it('reserves plain Tab for view switching, but leaves editing and reverse navigation alone', () => {
  const event=(target:Element,options:KeyboardEventInit={})=>{const e=new KeyboardEvent('keydown',{key:'Tab',...options});Object.defineProperty(e,'target',{value:target});return e;};
  expect(isViewShortcut(event(document.body))).toBe(true);
  expect(isViewShortcut(event(document.body,{shiftKey:true}))).toBe(false);
  expect(isViewShortcut(event(document.body,{repeat:true}))).toBe(false);
  for(const tag of ['input','textarea','select','dialog']) expect(isViewShortcut(event(document.createElement(tag)))).toBe(false);
  const slider=document.createElement('div');slider.setAttribute('role','slider');
  expect(isViewShortcut(event(slider))).toBe(false);
});
