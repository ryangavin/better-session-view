// @vitest-environment happy-dom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrackReview } from './TrackReview.tsx';
import { heardIn } from '../transients.ts';
import { measure } from '../debug/waveforms/measure.ts';
import type { Mix } from '../state.ts';
import { evenBeats, type Beats } from '../warp.ts';
vi.mock('../transients.ts', () => ({ heardIn: vi.fn(() => null) }));
vi.mock('../debug/waveforms/measure.ts', () => ({ measure: vi.fn(() => new Promise(() => {})) }));
vi.mock('./reviewPlayback.ts', () => ({ useReviewPlayback: () => ({ head: null, stop: vi.fn(), play: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const grid: Beats = { rate: 8000, length: 20000, first: 0, samples: [160, 4200, 8160, 12300, 16200] };
function fixture() {
  const buffer = { numberOfChannels: 1, length: 20000, sampleRate: 8000, getChannelData: () => new Float32Array(20000) } as unknown as AudioBuffer;
  return { song: { id: 'review', sources: ['drums'] }, grid, beats: grid, audioOf: () => buffer, rate: 8000, seconds: 2.5, slices: [{ bar: 0, name: 'My cut' }], saveReview: vi.fn(), keepStems: vi.fn() } as unknown as Mix;
}
describe('song review', () => {
  it('opens without rerunning beats, and saves exact irregular samples while preserving existing sections', () => {
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    expect(heardIn).not.toHaveBeenCalled(); expect(measure).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Save & return to mix' }));
    expect(mix.saveReview).toHaveBeenCalledWith(grid, undefined);
    expect(mix.keepStems).toHaveBeenCalledOnce();
  });
  it('keeps nudge edits local, and discard restores every original sample', () => {
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    fireEvent.click(screen.getByText('Beat not lining up? Adjust the grid here'));
    fireEvent.click(screen.getByRole('button', { name: '+10 ms' }));
    expect(mix.saveReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard grid changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & return to mix' }));
    expect(mix.saveReview).toHaveBeenCalledWith(grid, undefined);
  });
  it('a failed reset leaves the candidate intact and never writes to the library', async () => {
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset grid to automatic' }));
    await waitFor(() => expect(heardIn).toHaveBeenCalledOnce());
    expect(screen.getByText(/No steady beat found/)).toBeTruthy();
    expect(mix.saveReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save & return to mix' }));
    expect(mix.saveReview).toHaveBeenCalledWith(grid, undefined);
  });
  it('only replaces existing sections after explicit selection, with numbered cuts', async () => {
    const mix = fixture();
    mix.grid = evenBeats(8000, 96 * 8000, 120, 0);
    mix.seconds = 96;
    const rms = Float32Array.from({ length: 960 }, () => 0.5);
    vi.mocked(measure).mockResolvedValueOnce({ seconds: 96, step: 0.1, rms, peak: rms, bands: [rms, rms, rms], stems: [{ id: 'vocals', rms: Float32Array.from({ length: 960 }, (_, i) => i >= 320 && i < 640 ? 0.3 : 0) }] });
    render(createElement(TrackReview, { mix }));
    await screen.findByRole('checkbox', { name: 'Use these 3 sections when saving' });
    expect(mix.saveReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use these 3 sections when saving' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & return to mix' }));
    expect(mix.saveReview).toHaveBeenCalledWith(mix.grid, [{ bar: 0, name: 'Section 1' }, { bar: 16, name: 'Section 2' }, { bar: 32, name: 'Section 3' }]);
  });

});
