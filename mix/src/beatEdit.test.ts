// @vitest-environment happy-dom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useBeatEdit } from './beatEdit.ts';
import { moved, shifted, type Beats } from './warp.ts';
afterEach(cleanup);
const saved: Beats = { rate: 8000, length: 20000, first: 0, samples: [160, 4200, 8160, 12300, 16200] };
describe('manual beat editing draft', () => {
  it('ignores edits until explicitly opened, and Cancel restores exact irregular samples', () => {
    const { result } = renderHook(() => useBeatEdit('song', saved));
    act(() => result.current.change(shifted(saved, 80)));
    expect(result.current.grid).toBe(saved);
    act(() => result.current.begin());
    act(() => result.current.change(shifted(saved, 80)));
    expect(result.current.grid.samples[0]).toBe(240);
    expect(saved.samples[0]).toBe(160);
    act(() => result.current.cancel());
    expect(result.current.grid).toBe(saved);
    expect(result.current.active).toBe(false);
  });
  it('undoes a whole drag, then a separate nudge, without touching the saved map', () => {
    const { result } = renderHook(() => useBeatEdit('song', saved));
    act(() => result.current.begin());
    const nudged = shifted(saved, 80);
    act(() => result.current.change(nudged));
    act(() => result.current.beginGesture());
    act(() => result.current.change(moved(result.current.grid, 1, 4300)));
    act(() => result.current.change(moved(result.current.grid, 1, 4400)));
    act(() => result.current.endGesture());
    expect(result.current.grid.samples[1]).toBe(4400);
    act(() => result.current.undo());
    expect(result.current.grid).toBe(nudged);
    act(() => result.current.undo());
    expect(result.current.grid).toBe(saved);
    expect(result.current.dirty).toBe(false);
  });
  it('cannot carry an abandoned draft to another song or revive it on return', () => {
    const other = shifted(saved, 900);
    const { result, rerender } = renderHook(({ id, grid }) => useBeatEdit(id, grid), { initialProps: { id: 'a', grid: saved } });
    act(() => result.current.begin());
    act(() => result.current.change(shifted(saved, 80)));
    rerender({ id: 'b', grid: other });
    expect(result.current.active).toBe(false); expect(result.current.grid).toBe(other);
    rerender({ id: 'a', grid: saved });
    expect(result.current.active).toBe(false); expect(result.current.grid).toBe(saved);
  });
});
