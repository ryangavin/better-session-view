// @vitest-environment happy-dom
import { createElement } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Header } from './Header.tsx';
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
  expect(view.getByRole('slider', { name: 'Tempo' })).toBeTruthy();
  expect(view.queryByRole('group', { name: 'Analysis' })).toBeNull();
  expect(view.queryByRole('group', { name: 'Snap' })).toBeNull();
  expect(view.queryByRole('button', { name: 'Export' })).toBeNull();
});
