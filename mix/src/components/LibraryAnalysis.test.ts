// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryAnalysis, LibraryStems } from './LibraryAnalysis.tsx';
import type { Track } from '../openflow.ts';

const { scans, onScansChanged } = vi.hoisted(() => ({ scans: vi.fn(), onScansChanged: vi.fn() }));
vi.mock('../openflow.ts', () => ({ openflow: () => ({ analysis: { scans, onScansChanged } }) }));
const listeners = new Set<(change: { root: string; trackId: string }) => void>();
beforeEach(() => onScansChanged.mockImplementation((hear: (change: { root: string; trackId: string }) => void) => {
  listeners.add(hear); return () => listeners.delete(hear);
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); scans.mockReset(); onScansChanged.mockReset(); listeners.clear(); });
const saved = { sources: { full: { bins: 1, values: new Float32Array([-.5, .5, 1, 0, 0]) } } };
const changed = (trackId: string, root = 'library') => act(() => listeners.forEach(hear => hear({ root, trackId })));

it('updates an already-mounted row after its deck scan is saved, without rereading other tracks', async () => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() {}
  });
  scans.mockResolvedValue(null);
  const one = render(h(LibraryAnalysis, { song: { id: 'one', stems: '' } as Track, root: 'library' }));
  const two = render(h(LibraryAnalysis, { song: { id: 'two', stems: '' } as Track, root: 'library' }));
  const node = one.container.firstChild;
  await waitFor(() => expect(scans).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(one.container.textContent).toBe('—'));
  expect(onScansChanged).toHaveBeenCalledTimes(1);
  changed('one', 'different-library');
  expect(scans).toHaveBeenCalledTimes(2);
  scans.mockResolvedValue(saved);
  changed('one');
  await waitFor(() => expect(one.container.querySelector('svg path')).not.toBeNull());
  expect(one.container.firstChild).toBe(node);
  expect(two.container.querySelector('svg')).toBeNull();
  expect(scans.mock.calls.filter(([id]) => id === 'two')).toHaveLength(1);
});

it('defers an offscreen completion until visible and does not lose a completion during a pending read', async () => {
  let visible: (value: boolean) => void = () => {};
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { visible = value => callback([{ isIntersecting: value }]); }
    observe() {}
    disconnect() {}
  });
  let release: (value: null) => void = () => {};
  scans.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(saved);
  const view = render(h(LibraryAnalysis, { song: { id: 'one', stems: '' } as Track, root: 'library' }));
  changed('one');
  expect(scans).not.toHaveBeenCalled();
  act(() => visible(true));
  await waitFor(() => expect(view.getByRole('img').getAttribute('aria-label')).toBe('Loading saved waveform'));
  changed('one');
  changed('one');
  expect(scans).toHaveBeenCalledTimes(1);
  await act(async () => release(null));
  await waitFor(() => expect(view.container.querySelector('svg path')).not.toBeNull());
  expect(scans).toHaveBeenCalledTimes(2);
});

it('exposes a failed cache read and recovers on the next saved scan', async () => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() {}
  });
  scans.mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(saved);
  const view = render(h(LibraryAnalysis, { song: { id: 'one', stems: '' } as Track, root: 'library' }));
  await waitFor(() => expect(view.getByRole('img').getAttribute('aria-label')).toBe('Could not read saved waveform'));
  changed('one');
  await waitFor(() => expect(view.getByRole('img').getAttribute('aria-label')).toBe('Saved whole-song waveform'));
});

it('reads only saved scans when visible and renders a colored waveform without stems', async () => {
  let visible: () => void = () => {};
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      visible = () => callback([{ isIntersecting: true }]);
    }
    observe() {}
    disconnect() {}
  });
  scans.mockResolvedValue({ sources: { full: { bins: 1, values: new Float32Array([-.5, .5, 1, 0, 0]) } } });
  const song = { id: 'song-1', stems: 'stems/song-1/model', sources: ['drums', 'bass'] } as Track;
  const view = render(h(LibraryAnalysis, { song, root: 'library' }));
  expect(scans).not.toHaveBeenCalled();
  expect(view.container.querySelector('[data-stem]')).toBeNull();
  visible();
  await waitFor(() => expect(view.container.querySelector('svg path')).not.toBeNull());
  expect(view.container.querySelector('svg path')?.getAttribute('stroke')).toMatch(/^rgb\(/);
  expect(scans).toHaveBeenCalledExactlyOnceWith('song-1', 'stems/song-1/model');
  expect(view.getByRole('img').getAttribute('aria-label')).toContain('Saved whole-song waveform');
});

it.each([
  [['vocals', 'drums', 'bass', 'other'], 2],
  [['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'], 3],
  [['bass'], 1], [['drums', 'bass', 'other'], 2],
  [['vocals', 'drums', 'bass', 'guitar', 'other'], 3],
] as const)('renders only available stem tiles in fixed source order: %j', (sources, columns) => {
  const view = render(h(LibraryStems, { sources: [...sources].reverse() }));
  const tiles = view.container.querySelectorAll('[data-stem]');
  expect([...tiles].map(tile => tile.getAttribute('data-stem'))).toEqual([...sources]);
  expect(view.container.querySelector<HTMLElement>('.mf-library-stem-tiles')?.style.gridTemplateColumns).toBe(`repeat(${columns}, 6px)`);
});

it('shows no tile grid when stems are absent', () => {
  const view = render(h(LibraryStems, { sources: [] }));
  expect(view.getByRole('img').getAttribute('aria-label')).toBe('No separated stems');
  expect(view.container.querySelector('[data-stem]')).toBeNull();
});

it('recolors a mounted preview for theme changes and pending reads without rereading analysis', async () => {
  const { ThemeRoot } = await import('@openflow/widgets/theme/ThemeRoot.tsx');
  const { DEFAULT_THEME } = await import('@openflow/widgets/theme/theme.ts');
  const { PRISM_SPECTRAL, SPECTRAL_PRESETS } = await import('@openflow/widgets/theme/spectral.ts');
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() {}
  });
  let release: (value: typeof saved) => void = () => {};
  scans.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const song = { id:'theme-song',stems:'' } as Track;
  const child = h(LibraryAnalysis,{song,root:'library'});
  const themed = (spectral = PRISM_SPECTRAL) => h(ThemeRoot,{theme:{...DEFAULT_THEME,spectral}},child);
  const view = render(themed(SPECTRAL_PRESETS[0].style));
  await waitFor(() => expect(scans).toHaveBeenCalledTimes(1));
  view.rerender(themed());
  await act(async () => release(saved));
  const path = view.container.querySelector('svg path')!;
  expect(path.getAttribute('stroke')).toBe('rgb(255, 0, 0)');
  view.rerender(themed(SPECTRAL_PRESETS.find(p => p.name === 'Warm')!.style));
  expect(path.getAttribute('stroke')).not.toBe('rgb(255, 0, 0)');
  for (const name of ['Aurora','Ember']) {
    view.rerender(themed(SPECTRAL_PRESETS.find(p => p.name === name)!.style));
    expect(path.getAttribute('stroke')).not.toBe('rgb(255, 0, 0)');
    expect(path.getAttribute('opacity')).toBe('0.88');
    expect(view.container.querySelector('svg')!.style.background).toBe('#090913');
  }
  view.rerender(themed({...PRISM_SPECTRAL,mode:'deck'}));
  expect(path.getAttribute('stroke')).toMatch(/^#/);
  view.rerender(themed());
  expect(view.container.querySelector('svg path')).toBe(path);
  expect(path.getAttribute('stroke')).toBe('rgb(255, 0, 0)');
  expect(scans).toHaveBeenCalledTimes(1);
});
