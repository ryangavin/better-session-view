import { describe, expect, it } from 'vitest';
import { corpusSnapshot } from '../../test/corpus.ts';
import { firstRender } from '../../test/render.ts';
import { clipKey } from '../lib/selection.ts';
import { useSnapshotLookups } from './useSnapshotLookups.ts';

/**
 * Pinned against a recorded set — 30 tracks, 272 scenes, 387 clips — rather
 * than against a fixture, because the counts are the assertion: a lookup that
 * silently drops the clips of one track is exactly the failure a three-clip
 * fixture cannot show.
 */
const set = corpusSnapshot().data;
const lookups = (snapshot: OpenFlow.Snapshot | null = set) =>
  firstRender(() => useSnapshotLookups(snapshot));

describe('clips', () => {
  it('indexes every clip in the set', () => {
    expect(lookups().clips.size).toBe(set.clipCount);
  });

  it('finds one by its slot rather than by scanning for it', () => {
    expect(lookups().clips.get(clipKey(1, 13))?.name).toBe('JAM2 Sparkle Pad');
  });
});

describe('names', () => {
  it('names every track', () => {
    const { trackNames } = lookups();
    expect(trackNames.size).toBe(set.trackCount);
    expect(trackNames.get(0)).toBe('Pads');
  });

  it('names every scene, including the empty ones', () => {
    expect(lookups().sceneNames.size).toBe(set.sceneCount);
  });
});

describe('isOccupied', () => {
  it('is true for a slot holding a clip', () => {
    expect(lookups().isOccupied({ t: 1, s: 13 })).toBe(true);
  });

  it('is false for an empty slot on a track that has clips elsewhere', () => {
    expect(lookups().isOccupied({ t: 1, s: 0 })).toBe(false);
  });
});

describe('clipsByScene', () => {
  it('buckets every clip, losing none', () => {
    const total = [...lookups().clipsByScene.values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(set.clipCount);
  });

  it('holds a bucket only for scenes that have clips', () => {
    // 177 of the 272 scenes. A scene with no clips is absent rather than
    // present and empty, which is what lets the grid ask the Map instead of
    // asking whether the answer is meaningful.
    expect(lookups().clipsByScene.size).toBe(177);
  });

  it("keeps a scene's clips together across tracks", () => {
    expect(lookups().clipsByScene.get(48)?.map((c) => c.t)).toEqual([4, 10, 17, 21, 25, 26, 27]);
  });
});

describe('scenesForOps', () => {
  it('offers every scene to op assembly, in index order', () => {
    const scenes = lookups().scenesForOps;
    expect(scenes).toHaveLength(set.sceneCount);
    // `s`, not `i`: op assembly addresses a scene the way an op does.
    expect(scenes.map((sc) => sc.s)).toEqual(set.scenes.map((sc) => sc.i));
  });

  it("carries the fields a scene op writes back, and not the scene's clips", () => {
    expect(Object.keys(lookups().scenesForOps[0])).toEqual([
      's',
      'name',
      'colorIndex',
      'color',
      'tempo',
    ]);
  });
});

/**
 * Not an edge case: this is what every launch renders before the first snapshot
 * arrives, and the grid draws itself empty rather than waiting.
 */
describe('before a snapshot has landed', () => {
  it('answers with empty lookups rather than throwing', () => {
    const { clips, trackNames, sceneNames, clipsByScene, scenesForOps } = lookups(null);
    expect([clips.size, trackNames.size, sceneNames.size, clipsByScene.size]).toEqual([0, 0, 0, 0]);
    expect(scenesForOps).toEqual([]);
  });

  it('reports nothing as occupied', () => {
    expect(lookups(null).isOccupied({ t: 1, s: 13 })).toBe(false);
  });
});
