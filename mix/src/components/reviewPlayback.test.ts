// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReviewPlayback } from './reviewPlayback.ts';
import { evenBeats } from '../warp.ts';
const grid = evenBeats(8000, 32000, 120, 0);
function audio(resume = () => Promise.resolve()) {
  const voices: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const node = () => {
    const n = { start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn((target: unknown) => target), frequency: { value: 0 }, buffer: null };
    voices.push(n); return n;
  };
  const close = vi.fn(async () => {});
  vi.stubGlobal('AudioContext', class {
    currentTime = 0; baseLatency = 0; outputLatency = 0; destination = {};
    resume = resume; close = close; createBufferSource = node; createOscillator = node;
    createGain = () => { const n = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: () => n, disconnect: vi.fn() }; return n; };
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return { voices, close };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('review playback', () => {
  it('schedules stems and clicks on one clock and cancels future clicks on Stop', async () => {
    const { voices } = audio(); const { result } = renderHook(useReviewPlayback);
    await act(() => result.current.play([{} as AudioBuffer], grid, 0, 2, true));
    expect(voices).toHaveLength(5); // One stem plus four beats.
    expect(voices[0].start).toHaveBeenCalledWith(0.04, 0, 2);
    expect(voices.slice(1).map((n) => n.start.mock.calls[0][0])).toEqual([0.04, 0.54, 1.04, 1.54]);
    act(() => result.current.stop());
    for (const voice of voices) { expect(voice.stop).toHaveBeenLastCalledWith(); expect(voice.disconnect).toHaveBeenCalled(); }
    expect(result.current.head).toBeNull();
  });
  it('cannot start audio after leaving while the context is resuming', async () => {
    let release!: () => void;
    const { voices, close } = audio(() => new Promise<void>((resolve) => { release = resolve; }));
    const { result, unmount } = renderHook(useReviewPlayback);
    let play!: Promise<void>;
    act(() => { play = result.current.play([{} as AudioBuffer], grid, 0, 2, true); });
    unmount();
    await act(async () => { release(); await play; });
    expect(voices).toHaveLength(0); expect(close).toHaveBeenCalledOnce();
  });
});
