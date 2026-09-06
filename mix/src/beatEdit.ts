import { useCallback, useEffect, useRef, useState } from 'react';
import type { Beats } from './warp.ts';

/** An auditionable grid draft. Only the caller's explicit Done action commits it. */
export function useBeatEdit(track: string | null, saved: Beats) {
  const [draft, setDraft] = useState<{ track: string | null; grid: Beats; before: Beats[]; group?: symbol } | null>(null);
  const gesture = useRef<symbol | undefined>(undefined);
  useEffect(() => { setDraft(null); gesture.current = undefined; }, [track]);
  const active = draft?.track === track ? draft : null;
  const begin = useCallback(() => { gesture.current = undefined; setDraft({ track, grid: saved, before: [] }); }, [track, saved]);
  const change = useCallback((next: Beats) => {
    const group = gesture.current;
    setDraft((was) => !was || was.track !== track || was.grid === next ? was : {
      track, grid: next, group,
      before: group && was.group === group ? was.before : [...was.before, was.grid],
    });
  }, [track]);
  const undo = useCallback(() => {
    gesture.current = undefined;
    setDraft((was) => !was || !was.before.length ? was : { track: was.track, grid: was.before.at(-1)!, before: was.before.slice(0, -1) });
  }, []);
  const cancel = useCallback(() => { gesture.current = undefined; setDraft(null); }, []);
  const beginGesture = useCallback(() => { gesture.current = Symbol(); }, []);
  const endGesture = useCallback(() => { gesture.current = undefined; }, []);
  return { grid: active?.grid ?? saved, active: !!active, dirty: !!active?.before.length, begin, change, undo, cancel, beginGesture, endGesture };
}
