import { useCallback, useEffect, useMemo, useState } from 'react';
import { tempoOps, type SceneFields } from '../../../core/src/roles.js';
import {
  commonTitle,
  titleOf,
  titleOps,
  type TitlePatch,
} from '../../../core/src/sceneTitle.js';
import type { BridgeState } from './useBridge.js';

interface Args {
  /** The selected scenes, ascending — see useGridSelection. */
  sceneList: number[];
  scenesForOps: SceneFields[];
  sceneNames: Map<number, string>;
  applyScenes: BridgeState['applyScenes'];
}

/**
 * Editing the selected scenes' titles — `@{bpm}-{key} {SONG}`, everything in
 * the name after the role tag — and their own `Scene.tempo`.
 */
export function useSceneTitles({ sceneList, scenesForOps, sceneNames, applyScenes }: Args) {
  /** Which title fields have been edited — see TitlePatch in core. */
  const [titlePatch, setTitlePatch] = useState<TitlePatch>({});

  // Reset the edits when the selection changes, or a song name typed for one
  // song would sit in the field waiting to be applied to the next one.
  const selectionKey = sceneList.join(',');
  useEffect(() => {
    setTitlePatch({});
  }, [selectionKey]);

  /** What the selected scenes agree on, per field. Null where they differ. */
  const commonFields = useMemo(
    () => commonTitle(sceneList.map((s) => titleOf(sceneNames.get(s) ?? ''))),
    [sceneList, sceneNames],
  );

  const sceneNameOps = useMemo(
    () => titleOps(scenesForOps, sceneList, titlePatch),
    [sceneList, scenesForOps, titlePatch],
  );

  /** The first selected scene as it would read after the pending edit. */
  const titlePreview = useMemo(() => {
    const first = sceneList[0];
    if (first === undefined) return null;
    // titleOps drops scenes it wouldn't change, so fall back to the current
    // name — a preview that goes blank when the edit is a no-op reads as if
    // the rename would blank the scene.
    return sceneNameOps.find((op) => op.s === first)?.name ?? sceneNames.get(first) ?? '';
  }, [sceneList, sceneNameOps, sceneNames]);

  const onRenameScenes = useCallback(
    () => void applyScenes(sceneNameOps, 'rename scenes'),
    [applyScenes, sceneNameOps],
  );

  // The bpm field drives two independent things: the name token, written by
  // Rename above, and Live's own Scene.tempo, written here. Kept apart because
  // only one of them changes how the set plays.
  const wantedTempo = useMemo(() => {
    const raw = (titlePatch.bpm ?? commonFields.bpm ?? '').trim();
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : null;
  }, [commonFields.bpm, titlePatch.bpm]);

  const tempoWriteOps = useMemo(
    () => tempoOps(scenesForOps, sceneList, wantedTempo),
    [sceneList, scenesForOps, wantedTempo],
  );

  const onSetTempo = useCallback(
    () => void applyScenes(tempoWriteOps, wantedTempo === null ? 'clear tempo' : 'set tempo'),
    [applyScenes, tempoWriteOps, wantedTempo],
  );

  return {
    titlePatch,
    setTitlePatch,
    commonFields,
    sceneNameOps,
    titlePreview,
    onRenameScenes,
    tempoWriteOps,
    onSetTempo,
  };
}
