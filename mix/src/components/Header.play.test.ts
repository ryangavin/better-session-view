// @vitest-environment happy-dom
import { createElement } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
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
  expect(view.queryByRole('slider', { name: 'Tempo' })).toBeNull();
  expect(view.getByLabelText('Leader tempo').textContent).toBe('—');
  expect((view.getByRole('button',{name:'Normal speed'}) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(createElement(Header,{mix:{...mix,linkAudio:{...mix.linkAudio,enabled:true}},ready:null,playView:true}));
  expect(view.getByRole('slider',{name:'Tempo'})).toBeTruthy();
  expect(view.queryByRole('group', { name: 'Analysis' })).toBeNull();
  expect(view.queryByRole('group', { name: 'Snap' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Export' })).toBeNull();
});

it('exposes an editable tempo when a local leader is playing', () => {
  const setMaster=vi.fn(), normalSpeed=vi.fn();
  const mixer={normalSpeedBpm:96,normalSpeed,snapshot:()=>({running:true,bpm:128,beat:0,loop:{enabled:false},decks:[{status:'ready',syncLeader:true}]}),
    position:0,linkAudio:{enabled:false,outputs:[],dropped:0},monitoring:true,
    commands:{setMaster},setLinkAudio:vi.fn(),setMonitoring:vi.fn()} as unknown as MixerEngine;
  const mix={phase:'idle',song:null} as unknown as Mix;
  const view=render(createElement(Header,{mix,mixer,ready:null,playView:true}));
  const tempo=view.getByRole('slider',{name:'Tempo'});
  fireEvent.keyDown(tempo,{key:'Enter'});
  const input=view.getByRole('textbox',{name:'Tempo'});fireEvent.change(input,{target:{value:'135'}});fireEvent.keyDown(input,{key:'Enter'});
  expect(setMaster).toHaveBeenCalled();
  expect(setMaster).toHaveBeenCalledWith('bpm',135);
  fireEvent.click(view.getByRole('button',{name:'Normal speed'}));
  expect(normalSpeed).toHaveBeenCalledOnce();
  expect(view.getByRole('button',{name:'Normal speed'}).title).toContain('96');
});
