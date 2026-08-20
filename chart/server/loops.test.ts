import { describe, expect, it } from 'vitest';
import { buildLoops, loopShape } from './loops.ts';
import { emptySet, type SetState } from './bridge.ts';

function track(i: number, name: string, isGroup = false): BSV.Track {
  return {
    i,
    name,
    color: 0x3cc8ff,
    colorIndex: 10,
    isMidi: true,
    isGroup,
    isGrouped: false,
    groupIndex: -1,
    isFolded: false,
  };
}

function playing(t: number, over: Partial<BSV.PlayingClip> = {}): BSV.PlayingClip {
  return {
    t,
    position: 0,
    loopStart: 0,
    loopEnd: 16,
    looping: true,
    recording: false,
    inSeconds: false,
    signatureNumerator: 4,
    signatureDenominator: 4,
    ...over,
  };
}

function setWith(tracks: BSV.Track[], status: BSV.PlayingClip[]): SetState {
  const state = emptySet();
  state.connected = true;
  state.lomReady = true;
  state.rev = 1;
  state.tempo = 120;
  state.tracks = tracks;
  state.status = status;
  return state;
}

describe('buildLoops', () => {
  it('carries every playing clip with the name and colour of its track', () => {
    const loops = buildLoops(
      setWith([track(0, 'Drums'), track(1, 'Bass')], [playing(0), playing(1, { loopEnd: 32 })]),
    );

    expect(loops.tempo).toBe(120);
    expect(loops.tracks.map((row) => [row.t, row.name, row.loopEnd])).toEqual([
      [0, 'Drums', 16],
      [1, 'Bass', 32],
    ]);
    expect(loops.tracks[0]!.color).toBe(0x3cc8ff);
  });

  it('leaves out a group track, which carries no clip of its own', () => {
    const loops = buildLoops(
      setWith([track(0, 'Rhythm', true), track(1, 'Drums')], [playing(0), playing(1)]),
    );

    expect(loops.tracks.map((row) => row.name)).toEqual(['Drums']);
  });

  it('holds track order rather than floating the longest loop', () => {
    const loops = buildLoops(
      setWith(
        [track(0, 'Drums'), track(1, 'Pad'), track(2, 'Bass')],
        [playing(2), playing(0), playing(1, { loopEnd: 64 })],
      ),
    );

    expect(loops.tracks.map((row) => row.name)).toEqual(['Drums', 'Pad', 'Bass']);
  });

  it('says nothing about a track Live is not reporting', () => {
    const loops = buildLoops(setWith([track(0, 'Drums'), track(1, 'Bass')], [playing(1)]));

    expect(loops.tracks.map((row) => row.t)).toEqual([1]);
  });

  it('leaves a clip whose track is gone out rather than inventing one', () => {
    const loops = buildLoops(setWith([track(0, 'Drums')], [playing(0), playing(9)]));

    expect(loops.tracks.map((row) => row.t)).toEqual([0]);
  });
});

describe('buildLoops — a stopped set', () => {
  it('says so, because a reader must not advance a frozen position', () => {
    const state = setWith([track(0, 'Drums')], [playing(0)]);
    state.rolling = false;
    expect(buildLoops(state).rolling).toBe(false);

    state.rolling = true;
    expect(buildLoops(state).rolling).toBe(true);
  });
});

describe('loopShape', () => {
  it('ignores the positions, which are meant to move', () => {
    const tracks = [track(0, 'Drums')];
    const still = buildLoops(setWith(tracks, [playing(0, { position: 0 })]));
    const moved = buildLoops(setWith(tracks, [playing(0, { position: 7.5 })]));

    expect(loopShape(moved)).toBe(loopShape(still));
  });

  it('notices a different clip, a renamed track and a tempo move', () => {
    const tracks = [track(0, 'Drums')];
    const base = loopShape(buildLoops(setWith(tracks, [playing(0)])));

    expect(loopShape(buildLoops(setWith(tracks, [playing(0, { loopEnd: 32 })])))).not.toBe(base);
    expect(loopShape(buildLoops(setWith([track(0, 'Kit')], [playing(0)])))).not.toBe(base);

    const faster = setWith(tracks, [playing(0)]);
    faster.tempo = 124;
    expect(loopShape(buildLoops(faster))).not.toBe(base);
  });

  it('notices the transport stopping, which changes how a frame is read', () => {
    const tracks = [track(0, 'Drums')];
    const rolling = setWith(tracks, [playing(0)]);
    rolling.rolling = true;
    const stopped = setWith(tracks, [playing(0)]);
    stopped.rolling = false;

    expect(loopShape(buildLoops(stopped))).not.toBe(loopShape(buildLoops(rolling)));
  });

  it('notices a track stopping', () => {
    const tracks = [track(0, 'Drums'), track(1, 'Bass')];
    const both = loopShape(buildLoops(setWith(tracks, [playing(0), playing(1)])));
    const one = loopShape(buildLoops(setWith(tracks, [playing(0)])));

    expect(one).not.toBe(both);
  });
});
