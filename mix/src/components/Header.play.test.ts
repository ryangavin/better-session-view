// @vitest-environment happy-dom
import { createElement } from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Header } from './Header.tsx';
import type { MixerEngine } from '../play/engine.ts';
import type { Mix } from '../state.ts';
afterEach(cleanup);
it('keeps the existing playback and Link commands in Play without preparation tools', () => {
  const mix = { phase: 'idle', song: null, playable: true, playing: false, loop: false,
    linkAudio: { enabled: false, outputs: [], dropped: 0 }, monitoring: true,
    targetBpm: 128, bar: 0, bars: 32, position: 0,
    setPlaying: vi.fn(), stop: vi.fn(), setLoop: vi.fn(), setLinkAudio: vi.fn(), setMonitoring: vi.fn(),
  } as unknown as Mix;
  const view = render(createElement(Header, { mix, ready: null, playView: true }));
  fireEvent.click(view.getByRole('button', { name: 'Play' }));
  expect(mix.setPlaying).toHaveBeenCalledWith(true);
  fireEvent.click(view.getByRole('button', { name: 'Stop' }));
  expect(mix.stop).toHaveBeenCalledOnce();
  fireEvent.click(view.getByRole('button', { name: 'Link Audio' }));
  expect(mix.setLinkAudio).toHaveBeenCalledWith(true);
  expect(view.queryByRole('slider', { name: 'Playback tempo' })).toBeNull();
  expect(view.getByLabelText('Playback tempo').textContent).toBe('128');
  expect((view.getByRole('button',{name:'Normal speed'}) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(createElement(Header,{mix:{...mix,linkAudio:{...mix.linkAudio,enabled:true}},ready:null,playView:true}));
  expect(view.getByRole('slider',{name:'Playback tempo'})).toBeTruthy();
  expect(view.queryByRole('group', { name: 'Analysis' })).toBeNull();
  expect(view.queryByRole('group', { name: 'Snap' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Export' })).toBeNull();
});

it('exposes an editable tempo when a local leader is playing', () => {
  const setMaster=vi.fn(), normalSpeed=vi.fn();
  const state={running:true,bpm:128,beat:0,loop:{enabled:false},decks:[{status:'ready',syncLeader:true}]};
  const mixer={normalSpeedBpm:96,normalSpeed,snapshot:()=>state,subscribe:()=>()=>{},
    position:0,linkAudio:{enabled:false,outputs:[],dropped:0},monitoring:true,
    commands:{setMaster},setLinkAudio:vi.fn(),setMonitoring:vi.fn()} as unknown as MixerEngine;
  const mix={phase:'idle',song:null} as unknown as Mix;
  const view=render(createElement(Header,{mix,mixer,ready:null,playView:true}));
  const tempo=view.getByRole('slider',{name:'Playback tempo'});
  fireEvent.keyDown(tempo,{key:'Enter'});
  const input=view.getByRole('textbox',{name:'Playback tempo'});fireEvent.change(input,{target:{value:'135'}});fireEvent.keyDown(input,{key:'Enter'});
  expect(setMaster).toHaveBeenCalled();
  expect(setMaster).toHaveBeenCalledWith('bpm',135);
  fireEvent.click(view.getByRole('button',{name:'Normal speed'}));
  expect(normalSpeed).toHaveBeenCalledOnce();
  expect(view.getByRole('button',{name:'Normal speed'}).title).toContain('96');
});


it('shows the engine tempo throughout idle, local playback, and stopped Link states',()=>{
  let state={running:false,bpm:120,beat:0,loop:{enabled:false},decks:[{status:'ready',syncLeader:false}]};
  let link={enabled:false,peers:0,outputs:[],dropped:0};
  const listeners=new Set<()=>void>();
  const emit=()=>act(()=>listeners.forEach(fn=>fn()));
  const mixer={snapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},get linkAudio(){return link},normalSpeedBpm:null,position:0,monitoring:true,commands:{}} as unknown as MixerEngine;
  const props={mix:{phase:'idle',song:null} as Mix,mixer,ready:null,playView:true};
  const view=render(createElement(Header,props));
  expect(view.getByLabelText('Playback tempo').textContent).toBe('120');
  state={...state,running:true,bpm:135,decks:[{status:'ready',syncLeader:true}]};emit();
  expect(view.getByRole('slider',{name:'Playback tempo'}).getAttribute('aria-valuenow')).toBe('135');
  state={...state,running:false,decks:[{status:'ready',syncLeader:false}]};emit();
  expect(view.getByLabelText('Playback tempo').textContent).toBe('135');
  link={...link,enabled:true};state={...state,bpm:137};emit();
  expect(view.getByRole('slider',{name:'Playback tempo'}).getAttribute('aria-valuenow')).toBe('137');
});
