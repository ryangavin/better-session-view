import { describe, expect, it } from 'vitest';
import { derive } from '../../core/src/derive.ts';
import { SCENE_PATTERNS } from '../../core/src/namePattern.ts';
import { buildSetModel } from '../../core/src/setModel.ts';
import { buildChart } from './chart.ts';
import { emptySet, type SetState } from './bridge.ts';

// Built from real scene names through the same `derive()` the bridge runs,
// rather than from a hand-written `SetModel`. A fixture that stated the mapping
// directly would keep passing after the naming convention moved underneath it,
// which is the one failure a chart must not have: it would go on agreeing with
// a grid that had stopped agreeing with it.

const NAMES = [
  '[INTRO] @128-Bm NIGHTFALL - THE AVIATORS',
  '[VERSE] @128-Bm NIGHTFALL - THE AVIATORS',
  '[CHORUS] @128-Bm NIGHTFALL - THE AVIATORS',
  '[BRIDGE] @128-Bm NIGHTFALL - THE AVIATORS',
  '[CHORUS] @128-Bm NIGHTFALL - THE AVIATORS',
  '[JAM] @124-Em GLASS TUNNEL',
  // Live's own default: a scene nobody has named. It matches no pattern, so it
  // belongs to no song — which is the only way `songByScene` misses. A bare
  // word like `soundcheck` does not; it derives as a one-section song, exactly
  // as the grid shows it.
  '',
];

function setWith(play: Array<{ playing: number; fired: number }>): SetState {
  const state = emptySet();
  state.connected = true;
  state.lomReady = true;
  state.rev = 7;
  state.rolling = true;
  state.tempo = 127.5;
  state.scenes = NAMES.map((name, i) => ({
    i,
    name,
    color: 0xff3636,
    colorIndex: 14,
    isEmpty: false,
    tempo: 0,
  }));
  state.tracks = play.map((_, i) => ({
    i,
    name: `T${i}`,
    color: 0,
    colorIndex: 0,
    isMidi: true,
    isGroup: false,
    isGrouped: false,
    groupIndex: -1,
    isFolded: false,
  }));
  state.play = play.map((p) => ({ ...p, armed: false }));
  return remodel(state);
}

const quiet = (n: number) => Array.from({ length: n }, () => ({ playing: -1, fired: -1 }));

/** Re-derive, the way a `sceneRows` delta makes the bridge do. */
function remodel(state: SetState): SetState {
  state.model = buildSetModel(
    derive(
      state.scenes.map((s) => ({ i: s.i, name: s.name, tempo: s.tempo, colorIndex: s.colorIndex })),
      SCENE_PATTERNS,
    ),
    state.rev,
  );
  return state;
}

describe('buildChart', () => {
  it('reports the song, its facts and its sections from the scene playing', () => {
    const chart = buildChart(
      setWith([
        { playing: 2, fired: -1 },
        { playing: 2, fired: -1 },
        { playing: 2, fired: -1 },
      ]),
    );

    expect(chart.song?.name).toBe('NIGHTFALL');
    expect(chart.song?.key).toBe('Bm');
    expect(chart.song?.bpm).toBe('128');
    expect(chart.song?.artist).toBe('THE AVIATORS');
    expect(chart.song?.sections.map((s) => s.label)).toEqual([
      'INTRO',
      'VERSE',
      'CHORUS',
      'BRIDGE',
      'CHORUS',
    ]);
    // The heading states the key, so no row repeats it.
    expect(chart.song?.sections.every((s) => s.key === null)).toBe(true);
    expect(chart.now?.label).toBe('CHORUS');
    expect(chart.now?.s).toBe(2);
    expect(chart.next).toBeNull();
    expect(chart.tempo).toBe(127.5);
  });

  it('takes the scene most of the set is playing, not one track reaching past it', () => {
    const chart = buildChart(
      setWith([
        { playing: 1, fired: -1 },
        { playing: 1, fired: -1 },
        { playing: 5, fired: -1 },
      ]),
    );

    expect(chart.now?.label).toBe('VERSE');
    expect(chart.song?.name).toBe('NIGHTFALL');
  });

  it('lights the section playing and outlines the one fired', () => {
    const chart = buildChart(
      setWith([
        { playing: 1, fired: 2 },
        { playing: 1, fired: 2 },
      ]),
    );

    expect(chart.song!.sections.map((s) => [s.label, s.playing, s.queued])).toEqual([
      ['INTRO', false, false],
      ['VERSE', true, false],
      ['CHORUS', false, true],
      ['BRIDGE', false, false],
      ['CHORUS', false, false],
    ]);
    expect(chart.next?.label).toBe('CHORUS');
  });

  it("does not read Live's -2 stop-button code as a queued scene", () => {
    const chart = buildChart(
      setWith([
        { playing: 1, fired: -2 },
        { playing: 1, fired: -2 },
      ]),
    );

    expect(chart.next).toBeNull();
    expect(chart.song!.sections.some((s) => s.queued)).toBe(false);
  });

  it('shows the song being fired into while nothing is playing yet', () => {
    const chart = buildChart(
      setWith([
        { playing: -1, fired: 5 },
        { playing: -1, fired: 5 },
      ]),
    );

    expect(chart.now).toBeNull();
    expect(chart.next?.label).toBe('JAM');
    expect(chart.song?.name).toBe('GLASS TUNNEL');
  });

  it('moves the key onto every section once the song states more than one', () => {
    const state = setWith([{ playing: 3, fired: -1 }]);
    state.scenes[3]!.name = '[BRIDGE] @128-D NIGHTFALL - THE AVIATORS';
    const chart = buildChart(remodel(state));

    // The heading has nothing single to say — `SongEntry.key` is `Bm / D` — so
    // it says nothing and the rows carry it.
    expect(chart.song!.key).toBe('');
    expect(chart.song!.sections.map((s) => s.key)).toEqual(['Bm', 'Bm', 'Bm', 'D', 'Bm']);
    expect(chart.now?.key).toBe('D');
  });

  it('moves the bpm onto every section once the song speeds up', () => {
    const state = setWith([{ playing: 4, fired: -1 }]);
    state.scenes[4]!.name = '[CHORUS] @140-Bm NIGHTFALL - THE AVIATORS';
    const chart = buildChart(remodel(state));

    expect(chart.song!.bpm).toBe('');
    expect(chart.song!.sections.map((s) => s.bpm)).toEqual(['128', '128', '128', '128', '140']);
    // The key still agrees, so it stays in the heading and off every row.
    expect(chart.song!.key).toBe('Bm');
    expect(chart.song!.sections.every((s) => s.key === null)).toBe(true);
  });

  it('falls back to the song a role-less scene names', () => {
    const state = setWith([{ playing: 1, fired: -1 }]);
    state.scenes[1]!.name = '@128-Bm NIGHTFALL - THE AVIATORS';
    const chart = buildChart(remodel(state));

    expect(chart.now?.role).toBeNull();
    expect(chart.now?.label).toBe('NIGHTFALL');
  });

  it('names a scene by its position when the set never named it', () => {
    const chart = buildChart(setWith([{ playing: 6, fired: -1 }]));

    expect(chart.song).toBeNull();
    expect(chart.now?.label).toBe('Scene 7');
    expect(chart.now?.role).toBeNull();
  });

  it('says nothing is playing rather than guessing', () => {
    const chart = buildChart(setWith(quiet(3)));

    expect(chart.now).toBeNull();
    expect(chart.next).toBeNull();
    expect(chart.song).toBeNull();
    expect(chart.ready).toBe(true);
  });

  it('reports a bridge it cannot see as neither connected nor ready', () => {
    const chart = buildChart(emptySet());

    expect(chart.connected).toBe(false);
    expect(chart.ready).toBe(false);
    expect(chart.song).toBeNull();
  });

  it('carries the scene colour, and null where a scene has none', () => {
    const state = setWith([{ playing: 0, fired: -1 }]);
    state.scenes[1]!.colorIndex = -1;
    const chart = buildChart(state);

    expect(chart.song!.sections[0]!.color).toBe(0xff3636);
    expect(chart.song!.sections[1]!.color).toBeNull();
  });
});
