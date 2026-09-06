// @vitest-environment happy-dom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrackReview } from './TrackReview.tsx';
import { OFFERED, run } from '../algorithms.ts';
import { measure } from '../debug/waveforms/measure.ts';
import type { Mix } from '../state.ts';
import { evenBeats, type Beats } from '../warp.ts';
// `run` is the seam: the page chooses an algorithm and draws what comes back,
// and which algorithm found it is the registry's business, not this page's.
vi.mock('../algorithms.ts', async (original) => ({ ...(await original<object>()), run: vi.fn(() => null) }));
vi.mock('../debug/waveforms/measure.ts', () => ({ measure: vi.fn(() => new Promise(() => {})) }));
/** What `run` hands back when an algorithm did find a grid. */
const found = (beats: Beats, bpm: number) =>
  ({ heard: { transients: [], seconds: 0 }, fit: { bpm, offset: beats.samples[0] / beats.rate, agreement: 0.9 }, follow: null, beats }) as unknown as NonNullable<ReturnType<typeof run>>;
const playback = vi.hoisted(() => ({ play: vi.fn(async () => {}), stop: vi.fn() }));
vi.mock('./reviewPlayback.ts', () => ({ useReviewPlayback: () => ({ head: null, ...playback }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const grid: Beats = { rate: 8000, length: 20000, first: 0, samples: [160, 4200, 8160, 12300, 16200] };
function fixture() {
  const buffer = { numberOfChannels: 1, length: 20000, sampleRate: 8000, getChannelData: () => new Float32Array(20000) } as unknown as AudioBuffer;
  return { song: { id: 'review', sources: ['drums'] }, grid, beats: grid, audioOf: () => buffer, rate: 8000, seconds: 2.5, slices: [{ bar: 0, name: 'My cut' }], madeBy: null, saveReview: vi.fn(), keepStems: vi.fn() } as unknown as Mix;
}
describe('song review', () => {
  it('opens without rerunning beats, and saves exact irregular samples while preserving existing sections', () => {
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    expect(run).not.toHaveBeenCalled(); expect(measure).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Apply analysis & return' }));
    expect(mix.saveReview).toHaveBeenCalledWith(grid, undefined, null);
    expect(mix.keepStems).toHaveBeenCalledOnce();
  });
  it('exposes inspection and detection without manual timing controls', () => {
    render(createElement(TrackReview, { mix: fixture() }));
    expect(screen.queryByText('Correct the beat grid')).toBeNull();
    expect(screen.queryByRole('button', { name: '+10 ms' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Steady tempo BPM' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Run beat analysis' })).toBeTruthy();
  });
  it('a failed reset leaves the candidate intact and never writes to the library', async () => {
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    fireEvent.click(screen.getByRole('button', { name: 'Run beat analysis' }));
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(screen.getByText(/found no steady beat/)).toBeTruthy();
    expect(mix.saveReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply analysis & return' }));
    expect(mix.saveReview).toHaveBeenCalledWith(grid, undefined, null);
  });
  it('previews a successful detection against the saved grid, and discards it without applying', async () => {
    vi.mocked(run).mockReturnValueOnce(found(evenBeats(grid.rate, grid.length, 120, .12), 120));
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    fireEvent.click(screen.getByRole('button', { name: 'Run beat analysis' }));
    await screen.findByText('Beat detection preview');
    expect(screen.getByText(/Apply replaces the saved beat map/)).toBeTruthy();
    expect(document.querySelector('[data-saved-bar="1"]')).toBeTruthy();
    expect(mix.saveReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard beat preview' }));
    expect(screen.queryByText('Beat detection preview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apply analysis & return' }));
    expect(mix.saveReview).toHaveBeenCalledWith(grid, undefined, null);
  });
  it('applies the proposed map only after the explicit Apply action', async () => {
    vi.mocked(run).mockReturnValueOnce(found(evenBeats(grid.rate, grid.length, 120, .12), 120));
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    fireEvent.click(screen.getByRole('button', { name: 'Run beat analysis' }));
    await screen.findByText('Beat detection preview');
    expect(mix.saveReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply analysis & return' }));
    // applied from a preview, so it is credited to the algorithm that ran
    expect(mix.saveReview).toHaveBeenCalledWith(evenBeats(grid.rate, grid.length, 120, .12), undefined, OFFERED[0]);
  });
  it('only replaces existing sections after explicit selection, with numbered cuts', async () => {
    const mix = fixture();
    mix.grid = evenBeats(8000, 96 * 8000, 120, 0);
    mix.seconds = 96;
    const rms = Float32Array.from({ length: 960 }, () => 0.5);
    vi.mocked(measure).mockResolvedValueOnce({ seconds: 96, step: 0.1, rms, peak: rms, bands: [rms, rms, rms], stems: [{ id: 'vocals', rms: Float32Array.from({ length: 960 }, (_, i) => i >= 320 && i < 640 ? 0.3 : 0) }] });
    render(createElement(TrackReview, { mix }));
    await screen.findByRole('button', { name: 'Use these 3 sections when applying' });
    expect(mix.saveReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use these 3 sections when applying' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply analysis & return' }));
    expect(mix.saveReview).toHaveBeenCalledWith(mix.grid, [{ bar: 0, name: 'Section 1' }, { bar: 16, name: 'Section 2' }, { bar: 32, name: 'Section 3' }], null);
  });

  it('shows the exact cursor time and starts playback there without changing the grid', () => {
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    const wave = screen.getByRole('slider', { name: 'Listening position in song timeline' });
    fireEvent.keyDown(wave, { key: 'ArrowRight' });
    expect(screen.getByText('0:00.030')).toBeTruthy();
    expect(wave.getAttribute('aria-valuenow')).toBe('0.03');
    fireEvent.click(screen.getByRole('button', { name: '▶ Listen for 4 bars' }));
    expect(playback.play).toHaveBeenCalledWith(expect.any(Array), grid, 0.03, 2.5, true);
    expect(mix.saveReview).not.toHaveBeenCalled();
  });
  it('keeps Save beside Back, with source details on the same page and no bottom action bar', () => {
    const mix = fixture();
    const { container } = render(createElement(TrackReview, { mix, details: createElement('h3', {}, 'Track details and separation') }));
    expect(screen.getByRole('heading', { name: 'Track details and separation' })).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Apply analysis & return' });
    expect(save.closest('header')).toBe(screen.getByRole('button', { name: 'Back to mix' }).closest('header'));
    expect(container.querySelector('footer')).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Position in detail waveform' })).toBeNull();
  });

  it('zooms the same timeline from the whole song to a downbeat while retaining every stem', () => {
    const mix = fixture(); mix.seconds = 96; mix.grid = evenBeats(8000, 96 * 8000, 120, 1);
    mix.song!.sources = ['drums', 'bass', 'other', 'vocals'];
    render(createElement(TrackReview, { mix }));
    const wave = screen.getByRole('slider', { name: 'Listening position in song timeline' });
    expect(wave.getAttribute('aria-valuemax')).toBe('96');
    fireEvent.click(screen.getByRole('button', { name: /First downbeat ·/ }));
    expect(wave.getAttribute('aria-valuemax')).toBe('4');
    expect(screen.getByText('VOCALS · samples')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Whole song' }));
    expect(wave.getAttribute('aria-valuemax')).toBe('96');
    expect(screen.getAllByRole('slider', { name: 'Listening position in song timeline' })).toHaveLength(1);
    expect(mix.saveReview).not.toHaveBeenCalled();
  });
  it('choosing an algorithm does not analyze or alter the saved grid until explicitly run', async () => {
    const mix = fixture(); render(createElement(TrackReview, { mix }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Beat analysis algorithm' }));
    fireEvent.click(document.querySelectorAll('[role="option"]')[1] as Element);
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Run beat analysis' }));
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
    // and it ran the one that was chosen, not the default
    expect(vi.mocked(run).mock.calls[0][0]).toBe(OFFERED[1]);
    expect(mix.saveReview).not.toHaveBeenCalled();
  });

  it('reviews and dismisses a graph marker without replacing saved sections', async () => {
    const mix = fixture(); mix.grid = evenBeats(8000, 96 * 8000, 120, 0); mix.seconds = 96;
    const rms = Float32Array.from({ length: 960 }, () => 0.5);
    vi.mocked(measure).mockResolvedValueOnce({ seconds: 96, step: 0.1, rms, peak: rms, bands: [rms, rms, rms], stems: [{ id: 'vocals', rms: Float32Array.from({ length: 960 }, (_, i) => i >= 320 && i < 640 ? 0.3 : 0) }] });
    render(createElement(TrackReview, { mix }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review vocals enter at bar 17' }));
    expect(playback.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to change' }));
    expect(playback.play).toHaveBeenCalledWith(expect.any(Array), mix.grid, 31, 39, true);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss change' }));
    expect(screen.queryByRole('button', { name: 'Review vocals enter at bar 17' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apply analysis & return' }));
    expect(mix.saveReview).toHaveBeenCalledWith(mix.grid, undefined, null);
  });

});
