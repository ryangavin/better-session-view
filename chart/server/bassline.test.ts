import { describe, expect, it } from 'vitest';
import { basslineShape, buildBassline } from './bassline.ts';
import { emptySet, type SetState } from './bridge.ts';

function track(i: number, name: string, over: Partial<BSV.Track> = {}): BSV.Track {
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
    ...over,
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

interface Clip {
  t: number;
  name: string;
  slot: number;
  loopEnd: number;
  notes: BSV.ClipNote[];
  loopStart?: number;
  instrument?: string;
  isMidi?: boolean;
}

function setWith(clips: Clip[]): SetState {
  const state = emptySet();
  state.connected = true;
  state.lomReady = true;
  state.rev = 1;
  state.rolling = true;
  state.tracks = clips.map((c) => track(c.t, c.name, { isMidi: c.isMidi ?? true }));
  state.play = [];
  state.status = [];
  for (const c of clips) {
    state.play[c.t] = { playing: c.slot, fired: -1, armed: false };
    state.status.push(playing(c.t, c.loopEnd, { loopStart: c.loopStart ?? 0 }));
    state.notes.set(`${c.t}:${c.slot}`, {
      t: c.t,
      s: c.slot,
      instrument: c.instrument ?? 'Operator',
      notes: c.notes,
    });
  }
  return state;
}

/** A four-bar bass line, one note a bar, as `get_all_notes_extended` reports it. */
const LINE: BSV.ClipNote[] = [50, 48, 45, 43].map((pitch, bar) => ({
  pitch,
  start: bar * 4,
  duration: 3.5,
}));

describe('buildBassline', () => {
  it('copies the bass track note for note', () => {
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 4, loopEnd: 16, notes: LINE }]),
    );

    expect(out).toMatchObject({ t: 0, name: 'Bass', from: 0, to: 16, beatsPerBar: 4 });
    expect(out?.notes).toEqual([
      { from: 0, to: 3.5, pitch: 50 },
      { from: 4, to: 7.5, pitch: 48 },
      { from: 8, to: 11.5, pitch: 45 },
      { from: 12, to: 15.5, pitch: 43 },
    ]);
  });

  it('keeps a note exactly as long as it was played', () => {
    // The whole point of the rewrite: nothing rounds to a window, merges a run
    // or moves a note onto a grid line it was deliberately played off.
    const swung = [
      { pitch: 40, start: 0, duration: 0.3125 },
      { pitch: 40, start: 0.625, duration: 0.1875 },
      { pitch: 45, start: 1.5, duration: 2.5 },
    ];
    const out = buildBassline(setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: swung }]));

    expect(out?.notes).toEqual([
      { from: 0, to: 0.3125, pitch: 40 },
      { from: 0.625, to: 0.8125, pitch: 40 },
      { from: 1.5, to: 4, pitch: 45 },
    ]);
  });

  it('ignores every track that is not the bass', () => {
    const out = buildBassline(
      setWith([
        { t: 0, name: 'Drums', slot: 4, loopEnd: 8, notes: [{ pitch: 36, start: 0, duration: 0.2 }] },
        { t: 1, name: 'Keys', slot: 4, loopEnd: 16, notes: [{ pitch: 60, start: 0, duration: 4 }] },
        { t: 2, name: 'Bass', slot: 4, loopEnd: 16, notes: LINE },
      ]),
    );

    expect(out?.t).toBe(2);
    expect(out?.notes).toHaveLength(4);
  });

  it('finds the track however it is capitalised, and inside a longer name', () => {
    const out = buildBassline(
      setWith([{ t: 3, name: 'SUB BASS 808', slot: 0, loopEnd: 4, notes: LINE.slice(0, 1) }]),
    );
    expect(out?.t).toBe(3);
  });

  it('takes the first bass track in Live order when a set has two', () => {
    const out = buildBassline(
      setWith([
        { t: 1, name: 'Bass', slot: 0, loopEnd: 4, notes: [{ pitch: 40, start: 0, duration: 1 }] },
        { t: 2, name: 'Bass Sub', slot: 0, loopEnd: 4, notes: [{ pitch: 28, start: 0, duration: 1 }] },
      ]),
    );
    expect(out?.t).toBe(1);
  });

  it('draws the loop, not the clip', () => {
    // Live plays the loop bracket and nothing else, so material outside it is
    // material nobody in the room will hear.
    const notes = [
      { pitch: 45, start: 0, duration: 4 },
      { pitch: 43, start: 8, duration: 4 },
      { pitch: 45, start: 12, duration: 4 },
      { pitch: 47, start: 24, duration: 4 },
    ];
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopStart: 8, loopEnd: 16, notes }]),
    );

    expect(out).toMatchObject({ from: 8, to: 16 });
    expect(out?.notes).toEqual([
      { from: 0, to: 4, pitch: 43 },
      { from: 4, to: 8, pitch: 45 },
    ]);
  });

  it('cuts a note off where the loop does', () => {
    const out = buildBassline(
      setWith([
        { t: 0, name: 'Bass', slot: 0, loopEnd: 8, notes: [{ pitch: 45, start: 6, duration: 8 }] },
      ]),
    );
    expect(out?.notes).toEqual([{ from: 6, to: 8, pitch: 45 }]);
  });

  it('draws one octave, starting on the E nearest the part', () => {
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 16, notes: LINE }]),
    );
    // LINE bottoms out at 43, and the nearest E to that is 40 — the open E of a
    // four-string, in the octave this part happens to be written in.
    expect(out).toMatchObject({ low: 40, high: 51 });
  });

  it('takes the E above when the part dips below one', () => {
    // A low D is under the E, not a seventh over the one below it. Getting this
    // backwards is what would draw a five-string line as an ordinary one.
    const out = buildBassline(
      setWith([
        { t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: [{ pitch: 38, start: 0, duration: 1 }] },
      ]),
    );
    expect(out?.low).toBe(40);
    expect(out?.notes).toEqual([{ from: 0, to: 1, pitch: 50, below: true }]);
  });

  it('finds the E whatever octave the part is written in', () => {
    const up = buildBassline(
      setWith([
        { t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: [{ pitch: 45, start: 0, duration: 1 }] },
      ]),
    );
    expect(up?.low).toBe(40);

    const down = buildBassline(
      setWith([
        { t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: [{ pitch: 33, start: 0, duration: 1 }] },
      ]),
    );
    expect(down?.low).toBe(28);
  });

  it('takes the lower E on a tie, so nothing is marked on a coin toss', () => {
    // A lowest note six semitones from an E either side.
    const out = buildBassline(
      setWith([
        { t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: [{ pitch: 34, start: 0, duration: 1 }] },
      ]),
    );
    expect(out?.low).toBe(28);
    expect(out?.notes[0]?.below).toBeUndefined();
  });

  it('marks a note under the low E, and only those', () => {
    const out = buildBassline(
      setWith([
        {
          t: 0,
          name: 'Bass',
          slot: 0,
          loopEnd: 8,
          notes: [
            { pitch: 36, start: 0, duration: 1 },
            { pitch: 40, start: 1, duration: 1 },
            { pitch: 47, start: 2, duration: 1 },
            { pitch: 64, start: 3, duration: 1 },
          ],
        },
      ]),
    );

    // 36 is under the E and comes up an octave with a mark on it. 64 comes down
    // two and carries nothing — anybody can play it where it is drawn.
    expect(out).toMatchObject({ low: 40, high: 51 });
    expect(out?.notes).toEqual([
      { from: 0, to: 1, pitch: 48, below: true },
      { from: 1, to: 2, pitch: 40 },
      { from: 2, to: 3, pitch: 47 },
      { from: 3, to: 4, pitch: 40 },
    ]);
  });

  it('folds by whole octaves rather than clamping to the edge', () => {
    // A clamp would change what the note is, and a run of clamps would flatten
    // a line into a bar along the top of the roll.
    const out = buildBassline(
      setWith([
        {
          t: 0,
          name: 'Bass',
          slot: 0,
          loopEnd: 8,
          notes: [
            { pitch: 40, start: 0, duration: 1 },
            { pitch: 74, start: 1, duration: 1 },
            { pitch: 79, start: 2, duration: 1 },
          ],
        },
      ]),
    );

    expect(out?.notes.map((note) => note.pitch)).toEqual([40, 50, 43]);
  });

  it('spells to match the key the set states', () => {
    const state = setWith([{ t: 0, name: 'Bass', slot: 3, loopEnd: 4, notes: LINE.slice(0, 1) }]);
    state.model = {
      rev: 1,
      songs: [],
      songByScene: {},
      factsByScene: { '3': { key: 'Bb' } },
      unmapped: [],
    };

    expect(buildBassline(state)?.flats).toBe(true);
  });

  it('has nothing to draw when no track is called bass', () => {
    expect(
      buildBassline(
        setWith([{ t: 0, name: 'Keys', slot: 0, loopEnd: 16, notes: LINE }]),
      ),
    ).toBeNull();
  });

  it('has nothing to draw when the bass clip is audio', () => {
    expect(
      buildBassline(
        setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 16, notes: [], isMidi: false }]),
      ),
    ).toBeNull();
  });

  it('has nothing to draw when the loop is empty', () => {
    expect(
      buildBassline(
        setWith([{ t: 0, name: 'Bass', slot: 0, loopStart: 16, loopEnd: 20, notes: LINE }]),
      ),
    ).toBeNull();
  });

  it('has nothing to draw when the bass track is not playing', () => {
    const state = setWith([{ t: 0, name: 'Bass', slot: 4, loopEnd: 16, notes: LINE }]);
    state.play[0] = { playing: -1, fired: 2, armed: false };
    expect(buildBassline(state)).toBeNull();
  });
});

describe('basslineShape', () => {
  it('ignores where the playhead is', () => {
    const clips: Clip[] = [{ t: 0, name: 'Bass', slot: 4, loopEnd: 16, notes: LINE }];
    const still = setWith(clips);
    const moved = setWith(clips);
    moved.status[0]!.position = 9.25;

    expect(basslineShape(buildBassline(moved))).toBe(basslineShape(buildBassline(still)));
  });

  it('notices a note needing the fifth string', () => {
    // Same rows, same timing, different thing to tell the bass player.
    const over = basslineShape(
      buildBassline(
        setWith([
          {
            t: 0,
            name: 'Bass',
            slot: 0,
            loopEnd: 4,
            notes: [
              { pitch: 40, start: 0, duration: 1 },
              { pitch: 50, start: 1, duration: 1 },
            ],
          },
        ]),
      ),
    );
    const under = basslineShape(
      buildBassline(
        setWith([
          {
            t: 0,
            name: 'Bass',
            slot: 0,
            loopEnd: 4,
            notes: [
              { pitch: 40, start: 0, duration: 1 },
              { pitch: 38, start: 1, duration: 1 },
            ],
          },
        ]),
      ),
    );

    expect(under).not.toBe(over);
  });

  it('notices a different part, including one note moving', () => {
    const base = basslineShape(
      buildBassline(setWith([{ t: 0, name: 'Bass', slot: 4, loopEnd: 16, notes: LINE }])),
    );
    const nudged = LINE.map((note, i) => (i === 2 ? { ...note, start: note.start + 0.5 } : note));
    const other = basslineShape(
      buildBassline(setWith([{ t: 0, name: 'Bass', slot: 4, loopEnd: 16, notes: nudged }])),
    );

    expect(other).not.toBe(base);
    expect(basslineShape(null)).toBe('');
  });
});
