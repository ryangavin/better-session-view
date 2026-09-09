// @vitest-environment happy-dom
import { createElement as h, Fragment } from 'react';
import { render, fireEvent, act, cleanup, within } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { Library } from '../components/Library.tsx';
import { PlayView } from './PlayView.tsx';
import { useMixerViewModel } from './useMixerViewModel.ts';
import { TRACK_DRAG } from './decks.ts';
import { listing } from '../listing.ts';
import type { Track } from '../openflow.ts';
import type { Mix } from '../state.ts';
vi.mock('@openflow/widgets/wave/Waveform.tsx', () => ({ Waveform: () => null }));
vi.mock('../components/DebugButton.tsx', () => ({DebugButton: () => null}));
beforeEach(() => { vi.stubGlobal('requestAnimationFrame', vi.fn(()=>1)); vi.stubGlobal('cancelAnimationFrame',vi.fn()); });
afterEach(() => {cleanup();vi.unstubAllGlobals();});
it('loads the dragged sidebar track into the target deck without selecting it in Prep', async () => {
  const track: Track={id:'track-1',title:'Real library title',artist:'Artist',album:null,art:null,file:'tracks/one.wav',bpm:null,key:null,seconds:100,added:'',model:null,stems:null,sources:[]};
  const tracks=[track];
  const select=vi.fn();
  const mix={library:{root:'library',tracks},songs:tracks,rows:listing(tracks,'artist'),order:'artist',collapsed:new Set<string>(),toggleHead:vi.fn(),artists:1,query:'',loading:false,importing:false,selected:null,artOf:()=>null,coverOf:()=>null,notes:null,total:1,note:null,noteBad:false,select} as unknown as Mix;
  const loader=vi.fn(async()=>({analysis:null,peaks:[]}));
  function Host() {const mixer=useMixerViewModel(tracks,'library',loader);return h(Fragment,null,h(Library,{mix}),h(PlayView,{mixer}));}
  const view=render(h(Host));
  const store=new Map<string,string>();
  const dataTransfer={setData:(type:string,value:string)=>store.set(type,value),getData:(type:string)=>store.get(type)??'',get types(){return [...store.keys()];},effectAllowed:'',dropEffect:''};
  const song=view.getByRole('button',{name:/Real library title/});
  fireEvent.dragStart(song,{dataTransfer});
  expect(dataTransfer.getData(TRACK_DRAG)).toBe('track-1');
  const deck=view.container.querySelectorAll<HTMLElement>('.play-deck')[2];
  fireEvent.dragOver(deck,{dataTransfer});
  expect(deck.className).toContain('mf-deck-over');
  await act(async()=>{fireEvent.drop(deck,{dataTransfer});});
  expect(within(deck).getByRole('heading').textContent).toBe('Real library title');
  expect(loader).toHaveBeenCalledWith(track,expect.any(AbortSignal));
  expect(select).not.toHaveBeenCalled();
  expect(view.container.querySelectorAll('.play-deck h3')[0].textContent).toBe('Empty deck');
  expect(view.queryByRole('combobox',{name:/Load track into deck/})).toBeNull();
});
