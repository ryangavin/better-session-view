// @vitest-environment happy-dom
import { createElement as h, Profiler, useSyncExternalStore } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMixerViewModel } from './useMixerViewModel.ts';
import { Library } from '../components/Library.tsx';
import { browseLibrary, columnsFrom } from '../listing.ts';
import type { Mix } from '../state.ts';
import type { Track } from '../openflow.ts';

// Isolate the store/React path: no audio context, MIDI port or animation clock.
afterEach(cleanup);
it('keeps a sustained gain sweep out of the library render path', () => {
  const tracks: Track[] = Array.from({ length: 300 }, (_, i) => ({ id: `track-${i}`, title: `Track ${i}`, artist: 'Artist', album: null, art: null, file: 'song.wav', bpm: null, key: null, seconds: 300, added: '', model: null, sources: [], stems: null }));
  const artOf = vi.fn(() => null);
  const base = { library: { root: 'library', tracks }, libraryBrowser: browseLibrary(tracks, '', { artist: null, album: null, key: null }), rows: tracks, songs: tracks, total: tracks.length, columns: columnsFrom(undefined), order: 'artist', query: '', selected: '', notes: null, artOf, setLibraryWidth: () => {}, libraryWidth: 0 } as unknown as Mix;
  let owner!: ReturnType<typeof useMixerViewModel>, owners = 0, renders = 0;
  const costs: number[] = [];
  function Consumer({ mixer }: { mixer: ReturnType<typeof useMixerViewModel> }) {
    const state = useSyncExternalStore(mixer.engine.subscribe, mixer.engine.snapshot);
    renders++;
    return h('output', null, state.decks[0].gain);
  }
  function Shell() {
    owner = useMixerViewModel(tracks, 'library'); owners++;
    return h('main', null, h(Profiler, { id: 'library', onRender: (_id, phase, duration) => { if (phase !== 'mount') costs.push(duration); } }, h(Library, { mix: { ...base } })), h(Consumer, { mixer: owner }));
  }
  const view = render(h(Shell));
  const before = { owners, renders, rows: artOf.mock.calls.length };
  costs.length = 0;
  const start = performance.now();
  for (let i = 0; i < 60; i++) act(() => owner.commands.setDeck('deck-a', 'gain', i));
  const elapsed = performance.now() - start;
  console.log(JSON.stringify({ scenario: '60 gain publishes / 300 actual library rows', elapsedMs: elapsed, ownerRenders: owners - before.owners, rowRenders: artOf.mock.calls.length - before.rows, controlRenders: renders - before.renders, libraryRenderMs: costs.reduce((a, b) => a + b, 0), worstLibraryRenderMs: Math.max(0, ...costs) }));
  expect(view.container.querySelector('output')?.textContent).toBe('59');
  expect(renders - before.renders).toBe(60);
  expect(owners - before.owners).toBe(0);
  expect(artOf.mock.calls.length - before.rows).toBe(0);
});

it('measures the real four-deck control tree while moving gain', async () => {
  const { PlayView } = await import('./PlayView.tsx');
  const { ThemeRoot } = await import('@openflow/widgets/theme/ThemeRoot.tsx');
  const { DEFAULT_THEME } = await import('@openflow/widgets/theme/theme.ts');
  let owner!: ReturnType<typeof useMixerViewModel>;
  const costs: number[] = [];
  function Shell() { owner = useMixerViewModel([], null); return h(PlayView, { mixer: owner }); }
  render(h(ThemeRoot, { theme: DEFAULT_THEME }, h(Profiler, { id: 'mixer', onRender: (_id, phase, cost) => { if (phase !== 'mount') costs.push(cost); } }, h(Shell))));
  costs.length = 0;
  const start = performance.now();
  for (let i = 0; i < 60; i++) act(() => owner.commands.setDeck('deck-a', 'gain', i));
  const sorted = [...costs].sort((a,b) => a-b);
  console.log(JSON.stringify({ scenario: 'real four-deck control tree / 60 gain publishes / no audio', elapsedMs: performance.now()-start, commits: costs.length, renderMs: costs.reduce((a,b)=>a+b,0), p95RenderMs: sorted[Math.floor(sorted.length*.95)], worstRenderMs: Math.max(...costs) }));
  expect(owner.engine.snapshot().decks[0].gain).toBe(59);
  expect(costs).toHaveLength(60);
});
