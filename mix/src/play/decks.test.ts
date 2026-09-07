// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { emptyDeck, loadedDeck, isViewShortcut, type DeckAsset } from './decks.ts';
import { useMixerViewModel } from './useMixerViewModel.ts';
import type { Track } from '../openflow.ts';

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
it('reserves plain Tab for view switching, but leaves editing and reverse navigation alone', () => {
  const event=(target:Element,options:KeyboardEventInit={})=>{const e=new KeyboardEvent('keydown',{key:'Tab',...options});Object.defineProperty(e,'target',{value:target});return e;};
  expect(isViewShortcut(event(document.body))).toBe(true);
  expect(isViewShortcut(event(document.body,{shiftKey:true}))).toBe(false);
  expect(isViewShortcut(event(document.body,{repeat:true}))).toBe(false);
  for(const tag of ['input','textarea','select','dialog']) expect(isViewShortcut(event(document.createElement(tag)))).toBe(false);
  const slider=document.createElement('div');slider.setAttribute('role','slider');
  expect(isViewShortcut(event(slider))).toBe(false);
});
