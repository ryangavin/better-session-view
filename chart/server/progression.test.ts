import { describe, expect, it } from 'vitest';
import { buildProgression, progressionShape } from './progression.ts';
import { emptySet, type SetState } from './bridge.ts';

function track(i: number, name: string): BSV.Track {
  return {
    i,
    name,
    color: 0,
    colorIndex: 0,
    isMidi: true,
    isGroup: false,
    isGrouped: false,
    groupIndex: -1,
    isFolded: false,
  };
}

function playing(t: number, loopEnd: number, over: Partial<BSV.PlayingClip> = {}): BSV.PlayingClip {
  return {
    t,
    position: 0,
    loopStart: 0,
    loopEnd,
    looping: true,
    recording: false,
    inSeconds: false,
    signatureNumerator: 4,
    signatureDenominator: 4,
    ...over,
  };
}

/** A triad held for a bar, as `Clip.get_all_notes_extended` would report it. */
function triad(bar: number, pitches: number[]): BSV.ClipNote[] {
  return pitches.map((pitch) => ({ pitch, start: bar * 4, duration: 4 }));
}

const AM_F_C_G = [
  ...triad(0, [57, 60, 64]),
  ...triad(1, [53, 57, 60]),
  ...triad(2, [48, 52, 55]),
  ...triad(3, [55, 59, 62]),
];

function setWith(
  clips: Array<{ t: number; name: string; slot: number; loopEnd: number; instrument: string; notes: BSV.ClipNote[] }>,
): SetState {
  const state = emptySet();
  state.connected = true;
  state.lomReady = true;
  state.rev = 1;
  state.rolling = true;
  state.tracks = clips.map((c) => track(c.t, c.name));
  state.play = [];
  state.status = [];
  for (const c of clips) {
    state.play[c.t] = { playing: c.slot, fired: -1, armed: false };
    state.status.push(playing(c.t, c.loopEnd));
    state.notes.set(`${c.t}:${c.slot}`, {
      t: c.t,
      s: c.slot,
      instrument: c.instrument,
      notes: c.notes,
    });
  }
  return state;
}

const symbols = (p: ReturnType<typeof buildProgression>) => p?.cells.map((c) => c.symbol);

describe('buildProgression', () => {
  it('reads the progression out of a playing clip', () => {
    const out = buildProgression(
      setWith([{ t: 0, name: 'Keys', slot: 4, loopEnd: 16, instrument: 'Operator', notes: AM_F_C_G }]),
    );

    expect(symbols(out)).toEqual(['Am', 'F', 'C', 'G']);
    expect(out).toMatchObject({ t: 0, from: 0, to: 16 });
  });

  it('leaves drums out, which would otherwise misspell every chord', () => {
    // A kick and a snare are C1 and D1. Merged in they turn this into
    // Am6 | F6 | C | Gmaj7 — measured, not hypothetical.
    const drums: BSV.ClipNote[] = [];
    for (let b = 0; b < 16; b++) {
      drums.push({ pitch: 36, start: b, duration: 0.25 });
      if (b % 2 === 1) drums.push({ pitch: 38, start: b, duration: 0.25 });
    }
    const out = buildProgression(
      setWith([
        { t: 0, name: 'Keys', slot: 4, loopEnd: 16, instrument: 'Operator', notes: AM_F_C_G },
        { t: 1, name: 'Drums', slot: 4, loopEnd: 16, instrument: 'DrumGroupDevice', notes: drums },
      ]),
    );

    expect(symbols(out)).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('merges the tracks, so a bass under an arpeggio spells more than either', () => {
    const arp: BSV.ClipNote[] = [];
    [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]].forEach((tri, bar) => {
      for (let i = 0; i < 8; i++) {
        arp.push({ pitch: tri[i % 3]! + 12, start: bar * 4 + i * 0.5, duration: 0.5 });
      }
    });
    const bass = [45, 41, 36, 43].map((pitch, bar) => ({ pitch, start: bar * 4, duration: 3.5 }));

    const out = buildProgression(
      setWith([
        { t: 0, name: 'Keys', slot: 2, loopEnd: 16, instrument: 'Operator', notes: arp },
        { t: 1, name: 'Bass', slot: 2, loopEnd: 16, instrument: 'Operator', notes: bass },
      ]),
    );
    expect(symbols(out)).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('times the chart against the longest harmony loop', () => {
    // A two-bar bass figure under an eight-bar chord cycle: timing the chart to
    // the bass would report the cycle four times, each cut off a quarter in.
    const bass = [45, 45].map((pitch, bar) => ({ pitch, start: bar * 4, duration: 4 }));
    const out = buildProgression(
      setWith([
        { t: 0, name: 'Bass', slot: 1, loopEnd: 8, instrument: 'Operator', notes: bass },
        { t: 1, name: 'Keys', slot: 1, loopEnd: 16, instrument: 'Operator', notes: AM_F_C_G },
      ]),
    );

    expect(out?.t).toBe(1);
    expect(out).toMatchObject({ from: 0, to: 16 });
  });

  it('has nothing to say when only drums are playing', () => {
    const drums = [{ pitch: 36, start: 0, duration: 0.25 }];
    expect(
      buildProgression(
        setWith([
          { t: 0, name: 'Drums', slot: 0, loopEnd: 16, instrument: 'DrumGroupDevice', notes: drums },
        ]),
      ),
    ).toBeNull();
  });

  it('has nothing to say about an audio clip, which has no notes at all', () => {
    expect(
      buildProgression(setWith([{ t: 0, name: 'Gtr', slot: 0, loopEnd: 16, instrument: '', notes: [] }])),
    ).toBeNull();
  });

  it('says nothing rather than drawing a chart of blanks', () => {
    // A bare melody spells no chord in any window. An empty chart looks like a
    // bug; no chart looks like no chart.
    const melody = [60, 62, 64, 65].map((pitch, i) => ({ pitch, start: i, duration: 0.25 }));
    expect(
      buildProgression(
        setWith([{ t: 0, name: 'Lead', slot: 0, loopEnd: 4, instrument: 'Operator', notes: melody }]),
      ),
    ).toBeNull();
  });

  it('spells to match the key the set states', () => {
    const bb = [...triad(0, [58, 62, 65]), ...triad(1, [58, 62, 65])];
    const state = setWith([
      { t: 0, name: 'Keys', slot: 3, loopEnd: 8, instrument: 'Operator', notes: bb },
    ]);
    state.model = {
      rev: 1,
      songs: [],
      songByScene: {},
      factsByScene: { '3': { key: 'Bb' } },
      unmapped: [],
    };

    expect(symbols(buildProgression(state))).toEqual(['Bb']);
  });
});

describe('progressionShape', () => {
  it('ignores where the playhead is', () => {
    const clips = [
      { t: 0, name: 'Keys', slot: 4, loopEnd: 16, instrument: 'Operator', notes: AM_F_C_G },
    ];
    const still = setWith(clips);
    const moved = setWith(clips);
    moved.status[0]!.position = 9.25;

    expect(progressionShape(buildProgression(moved))).toBe(
      progressionShape(buildProgression(still)),
    );
  });

  it('notices a different progression', () => {
    const base = progressionShape(
      buildProgression(
        setWith([{ t: 0, name: 'Keys', slot: 4, loopEnd: 16, instrument: 'Operator', notes: AM_F_C_G }]),
      ),
    );
    const other = progressionShape(
      buildProgression(
        setWith([
          { t: 0, name: 'Keys', slot: 5, loopEnd: 16, instrument: 'Operator', notes: triad(0, [60, 64, 67]) },
        ]),
      ),
    );

    expect(other).not.toBe(base);
    expect(progressionShape(null)).toBe('');
  });
});
