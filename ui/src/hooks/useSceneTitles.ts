import { useCallback, useEffect, useMemo, useState } from 'react';
import { tempoOps, type SceneFields } from '../../../core/src/roles.js';
import { MIN_TEMPO } from '../../../core/src/derive.js';
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
  /** Set-wide seed offered only when every selected scene has a blank artist. */
  defaultArtist: string;
  applyScenes: BridgeState['applyScenes'];
}

/**
 * Editing the selected scenes' names — `@{key} {SONG} - {ARTIST}`, everything
 * after the role tag — and their independent `Scene.tempo`.
 */
export function useSceneTitles({
  sceneList,
  scenesForOps,
  sceneNames,
  defaultArtist,
  applyScenes,
}: Args) {
  /** Which title fields have been edited — see TitlePatch in core. */
  const [titlePatch, setTitlePatch] = useState<TitlePatch>({});

  // Reset the edits when the selection changes, or a song name typed for one
  // song would sit in the field waiting to be applied to the next one.
  const selectionKey = sceneList.join(',');
  useEffect(() => {
    setTitlePatch({});
  }, [selectionKey]);

  const selectedTitles = useMemo(
    () => sceneList.map((s) => titleOf(sceneNames.get(s) ?? '')),
    [sceneList, sceneNames],
  );

  /**
   * What the selection agrees on. Song and key come from the names; BPM comes
   * from Scene.tempo, falling back to a legacy name only during migration.
   */
  const commonFields = useMemo(() => {
    const named = commonTitle(selectedTitles);
    if (sceneList.length === 0) return named;
    const scenes = new Map(scenesForOps.map((scene) => [scene.s, scene]));
    const bpms = sceneList.map((s, i) => {
      const tempo = scenes.get(s)?.tempo ?? -1;
      return tempo >= MIN_TEMPO ? String(tempo) : (selectedTitles[i]?.bpm ?? '');
    });
    const bpm = bpms.every((value) => value === bpms[0]) ? bpms[0]! : null;
    return { ...named, bpm };
  }, [sceneList, scenesForOps, selectedTitles]);

  // A default is a pending suggestion, never an implicit write. It appears
  // only for a uniformly blank artist; a real or mixed value always wins. An
  // explicit empty patch also wins, so deleting the seed lets this song remain
  // artistless without the default springing back into the field.
  const pendingPatch = useMemo<TitlePatch>(() => {
    if (titlePatch.artist !== undefined || commonFields.artist !== '') return titlePatch;
    const artist = defaultArtist.trim();
    return artist === '' ? titlePatch : { ...titlePatch, artist };
  }, [commonFields.artist, defaultArtist, titlePatch]);

  const sceneNameOps = useMemo(
    () =>
      titleOps(scenesForOps, sceneList, {
        song: pendingPatch.song,
        artist: pendingPatch.artist,
        tag: pendingPatch.tag,
        key: pendingPatch.key,
      }),
    [pendingPatch, sceneList, scenesForOps],
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

  // BPM belongs to Live's Scene.tempo, not to the name. A legacy name supplies
  // the initial field only when the scene has no tempo property yet.
  const wantedTempo = useMemo(() => {
    const raw = (pendingPatch.bpm ?? commonFields.bpm ?? '').trim();
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : null;
  }, [commonFields.bpm, pendingPatch.bpm]);

  const tempoWriteOps = useMemo(
    () => tempoOps(scenesForOps, sceneList, wantedTempo),
    [sceneList, scenesForOps, wantedTempo],
  );

  const onSetTempo = useCallback(
    () => void applyScenes(tempoWriteOps, wantedTempo === null ? 'clear tempo' : 'set tempo'),
    [applyScenes, tempoWriteOps, wantedTempo],
  );

  return {
    titlePatch: pendingPatch,
    setTitlePatch,
    commonFields,
    sceneNameOps,
    titlePreview,
    onRenameScenes,
    tempoWriteOps,
    onSetTempo,
  };
}
