// @vitest-environment happy-dom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PitchLab } from './PitchLab.tsx';
import type { Mix } from '../../state.ts';

vi.mock('@openflow/widgets/debug/Scope.tsx', () => ({ Scope: () => null, ScopeRow: () => null }));
const audio = vi.hoisted(() => ({ dispose: vi.fn(), stop: vi.fn(), start: vi.fn(), position: () => null }));
vi.mock('./player.ts', () => ({ BrowserMidiPort: class {}, PitchPlayer: class { dispose = audio.dispose; stop = audio.stop; start = audio.start; position = audio.position; levels() {} output() {} seek() {} setLoop() {} } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('reads caches without inference, requests map upgrade explicitly, and releases audition', async () => {
  const pitchMap = vi.fn().mockResolvedValue(null);
  const run = vi.fn().mockResolvedValue({ ok: false, says: 'No pitch model available', cancelled: false });
  vi.stubGlobal('openflow', { transcribe: { pitchMap, run, onProgress: () => () => {}, cancel: vi.fn() } });
  const buffer = { duration: 1, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100) } as unknown as AudioBuffer;
  const song = { id: 'track', title: 'Bass recording', stems: 'stems', sources: ['bass'] };
  const mix = { song, songs: [song], audioOf: () => buffer, stop: vi.fn() } as unknown as Mix;
  const mounted = render(createElement(PitchLab, { mix }));
  await waitFor(() => expect(screen.getByText(/No continuous map/)).toBeTruthy());
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze bass' }));
  await waitFor(() => expect(screen.getByText(/No pitch model available/)).toBeTruthy());
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ trackId: 'track', requirePitchMap: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Play comparison' }));
  expect(audio.start).toHaveBeenCalledWith(expect.objectContaining({ source: buffer, notes: [], span: { from: 0, to: 1 }, loop: false }));
  mounted.unmount();
  expect(audio.stop).toHaveBeenCalled();
});
