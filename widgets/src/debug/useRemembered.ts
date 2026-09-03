import { useCallback, useState } from 'react';

/**
 * A choice a harness keeps between refreshes: the track you were looking at,
 * the arm you had selected, whether the legends were open.
 *
 * `localStorage`, guarded, because a harness in a private window or inside a
 * host that blocks storage should still open. The namespace keeps two
 * harnesses in one app from reading each other's choices.
 */
export function useRemembered<T>(key: string, initial: T): [T, (next: T) => void] {
  const name = `wdg-debug:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const kept = localStorage.getItem(name);
      return kept === null ? initial : (JSON.parse(kept) as T);
    } catch {
      return initial;
    }
  });
  const remember = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(name, JSON.stringify(next));
      } catch {
        // no storage; the choice lasts the session
      }
    },
    [name],
  );
  return [value, remember];
}
