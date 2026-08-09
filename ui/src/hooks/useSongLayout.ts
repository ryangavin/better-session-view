import { useCallback, useMemo, useState } from 'react';
import { derive } from '../../../core/src/derive.js';
import { SCENE_PATTERNS } from '../../../core/src/namePattern.js';
import { allSongKeys, blockTrackRoles, songRows } from '../../../core/src/songRows.js';

/**
 * The mapping read back out of the set, and how it lays the grid out: which
 * scene belongs to which song (see core/src/derive.ts — nothing is stored for
 * this, it falls out of the names), which songs are folded, and what a folded
 * header shows in place of the rows it hides.
 */
export function useSongLayout(snapshot: BSV.Snapshot | null) {
  const derivation = useMemo(
    () => derive(snapshot?.scenes ?? [], SCENE_PATTERNS),
    [snapshot],
  );

  // Which songs are folded. Keyed by song rather than by scene index, so it
  // survives a re-snapshot — every write re-walks the set, and a collapsed
  // state that reset each time would make the grid unusable during a mapping
  // pass. Like collapsing a track group, this never writes back to Live.
  const [collapsedSongs, setCollapsedSongs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const layout = useMemo(
    () => songRows(derivation, collapsedSongs),
    [collapsedSongs, derivation],
  );

  /**
   * Per block, per track, which sections of the song that track plays — what a
   * folded header shows in place of the rows it's hiding.
   *
   * Computed for every block rather than only the folded ones, deliberately.
   * It's a single pass over the clips, and keying it off `derivation` instead of
   * `collapsedSongs` means folding a song doesn't rebuild the map — which would
   * hand every header a new prop and re-render all hundred of them on a gesture
   * that changed one.
   */
  const songShapes = useMemo(
    () =>
      blockTrackRoles(
        snapshot?.clips ?? [],
        snapshot?.scenes ?? [],
        derivation.songs.flatMap((s) => s.blocks),
      ),
    [derivation, snapshot],
  );

  /**
   * Visible scene indexes, the row-wise counterpart of `trackColumns`.
   *
   * Everything that moves or selects goes through this rather than through
   * `sceneCount`, so a collapsed song is invisible to the arrow keys and to
   * block selection. Without it ⌘↓ would descend into scenes you can't see and
   * fire them, which is the one thing the ⌘-makes-a-sound rule exists to keep
   * predictable.
   */
  const rows = layout.rows;

  const onToggleSong = useCallback((songKey: string) => {
    setCollapsedSongs((prev) => {
      const next = new Set(prev);
      if (!next.delete(songKey)) next.add(songKey);
      return next;
    });
  }, []);

  const onCollapseAll = useCallback(
    (all: boolean) => setCollapsedSongs(all ? new Set(allSongKeys(derivation)) : new Set()),
    [derivation],
  );

  /** Open one song, leaving the rest as they are. A no-op keeps the identity. */
  const unfoldSong = useCallback((songKey: string) => {
    setCollapsedSongs((prev) => {
      if (!prev.has(songKey)) return prev;
      const next = new Set(prev);
      next.delete(songKey);
      return next;
    });
  }, []);

  return {
    derivation,
    headers: layout.headers,
    hiddenScenes: layout.hidden,
    rows,
    songShapes,
    collapsedSongs,
    onToggleSong,
    onCollapseAll,
    unfoldSong,
  };
}
