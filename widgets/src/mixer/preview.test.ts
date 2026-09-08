// @vitest-environment happy-dom
import { renderHook, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { usePreviewMixer } from '../../bench/usePreviewMixer.ts';
let nextFrame: FrameRequestCallback | undefined;
let now: number;
beforeEach(() => {
  now = 0; nextFrame = undefined;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { nextFrame = cb; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => { nextFrame = undefined; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function advance(frames: number) { for (let i = 0; i < frames; i++) act(() => { now += 100; nextFrame?.(now); }); }
it('the fixture adapter owns quantized launch, pause, and immediate-mode policy', () => {
  const { result } = renderHook(usePreviewMixer);
  act(() => result.current.commands.setRunning(true));
  act(() => result.current.commands.launch('deck-a', 'verse', 'vocals'));
  expect(result.current.state.decks[0].stems[3].selected).toBe('drop');
  expect(result.current.state.decks[0].stems[3].queued).toBe('verse');
  advance(21);
  expect(result.current.state.decks[0].stems[3].selected).toBe('verse');
  expect(result.current.state.decks[0].stems[3].queued).toBeUndefined();
  act(() => result.current.commands.launch('deck-a', null, 'vocals'));
  act(() => result.current.commands.setRunning(false));
  expect(result.current.state.decks[0].stems[3].queued).toBeNull();
  act(() => result.current.commands.setLaunchBeats!(0));
  expect(result.current.state.decks[0].stems[3].selected).toBeNull();
});
it('the fixture owns source initialization, looping, and Stop reset', () => {
  const { result } = renderHook(usePreviewMixer);
  act(() => result.current.commands.launch('deck-a', 'verse', 'drums'));
  act(() => result.current.commands.setDeck('deck-a', 'full', true));
  expect(result.current.state.decks[0].fullSection).toBe('verse');
  act(() => result.current.commands.deckLoopIn!('deck-a'));
  act(() => result.current.commands.setRunning(true));
  advance(10);
  act(() => result.current.commands.deckLoopOut!('deck-a'));
  const end = result.current.state.decks[0].loop!.end!;
  advance(30);
  expect(result.current.readFrame().decks['deck-a'].beat).toBeLessThan(end);
  expect(result.current.readFrame().masterLevel).toBeGreaterThan(0);
  act(() => result.current.commands.stopAll());
  expect(result.current.state.loop.enabled).toBe(false);
  expect(result.current.state.decks[0].fullSection).toBeNull();
  expect(result.current.readFrame().masterLevel).toBe(0);
  expect(result.current.readFrame().decks['deck-a'].beat).toBe(0);
});
