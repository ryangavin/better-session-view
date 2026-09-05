// @vitest-environment happy-dom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Analysis } from './Analysis.tsx';
import { run } from './arms.ts';
import type { Mix } from '../state.ts';
import type { Beats } from '../warp.ts';

vi.mock('./arms.ts', async (original) => ({ ...await original<object>(), run: vi.fn(() => null) }));
vi.mock('../transients.ts', async (original) => ({ ...await original<object>(), heardIn: () => ({ rate: 8000, transients: [] }) }));
vi.mock('@openflow/widgets/debug/Scope.tsx', () => ({ Scope: () => null, ScopeRow: () => null }));
vi.mock('@openflow/widgets/debug/Plot.tsx', () => ({ Plot: () => null }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const grid: Beats = { rate: 8000, length: 20000, first: 0, samples: [160, 4200, 8160, 12300, 16200] };
function fixture() {
  const take = vi.fn();
  const buffer = { numberOfChannels: 1, length: 20000, sampleRate: 8000, getChannelData: () => new Float32Array(20000) } as unknown as AudioBuffer;
  const song = { id: 'edited', title: 'Edited rhythm', sources: ['drums'], stems: 'stems' };
  const mix = { song, songs: [song], decoding: false, audioOf: () => buffer, rate: 8000, seconds: 2.5,
    grid, beats: grid, detected: null, peaks: {}, targetBpm: 120, offset: 0.02, stop: vi.fn(), take } as unknown as Mix;
  return { mix, take };
}

describe('the track beat-grid editor', () => {
  it('opens the saved irregular grid without running an algorithm and applies those exact samples', async () => {
    const { mix, take } = fixture();
    render(createElement(Analysis, { mix, editing: true }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply grid' }));
    expect(take).toHaveBeenCalledWith(expect.any(Object), grid);
    expect(grid.samples).toEqual([160, 4200, 8160, 12300, 16200]);
  });
  it('runs only on request and a refused analysis keeps the saved candidate', async () => {
    const { mix, take } = fixture();
    render(createElement(Analysis, { mix, editing: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Find beats' }));
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(take).not.toHaveBeenCalled();
    expect(screen.getByText(/heard nothing to work with/)).toBeTruthy();
    // Restoring the saved map is possible after a failed run; no persisted data was changed.
    fireEvent.click(screen.getByRole('button', { name: 'Use saved grid' }));
    expect(screen.getByText(/Showing the saved grid again/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply grid' }));
    expect(take).toHaveBeenCalledWith(expect.any(Object), grid);
  });
});
