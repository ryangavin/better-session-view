import { describe, expect, it } from 'vitest';
import { basslineShape, buildBassline } from './bassline.ts';
import { emptySet, type SetState } from './bridge.ts';

function track(i: number, name: string, over: Partial<OpenFlow.Track> = {}): OpenFlow.Track {
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

function playing(t: number, loopEnd: number, over: Partial<OpenFlow.PlayingClip> = {}): OpenFlow.PlayingClip {
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
  notes: OpenFlow.ClipNote[];
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
const LINE: OpenFlow.ClipNote[] = [50, 48, 45, 43].map((pitch, bar) => ({
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

  it('draws one octave, sitting on the open E', () => {
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 16, notes: LINE }]),
    );
    // The bottom row is the open E whatever the part does above it.
    expect(out).toMatchObject({ low: 40, high: 51 });
  });

  it('marks nothing in a part that sits above the open E', () => {
    // The bug this still has to stay fixed: a D minor line an octave above the
    // low E is a line anybody can play, so the D and the Eb carry no dot even
    // though they are the lowest notes in it.
    const dminor = [50, 53, 57, 60, 51].map((pitch, i) => ({
      pitch,
      start: i,
      duration: 1,
    }));
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 8, notes: dminor }]),
    );

    expect(out).toMatchObject({ low: 40, high: 51 });
    expect(out?.notes.map((note) => note.pitch)).toEqual([50, 41, 45, 48, 51]);
    expect(out?.notes.some((note) => note.below)).toBe(false);
  });

  it('draws the note under the root an octave up, with the dot', () => {
    // The reading this is for: a G minor line with a D under the G. The D is
    // below the open E, so it goes up an octave to be drawn and takes the mark
    // that says it wants the fifth string.
    const gminor = [38, 43, 46, 50].map((pitch, i) => ({ pitch, start: i * 4, duration: 4 }));
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 16, notes: gminor }]),
    );

    expect(out).toMatchObject({ low: 40, high: 51 });
    expect(out?.notes).toEqual([
      { from: 0, to: 4, pitch: 50, below: true },
      { from: 4, to: 8, pitch: 43 },
      { from: 8, to: 12, pitch: 46 },
      { from: 12, to: 16, pitch: 50 },
    ]);
  });

  it('follows the part down when the clip is written below the open E', () => {
    // A clip an octave out is playable nowhere as written, and measuring it
    // against a fixed pitch would dot every note in it.
    const under = [26, 31, 34, 38].map((pitch, i) => ({ pitch, start: i, duration: 1 }));
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 8, notes: under }]),
    );

    expect(out).toMatchObject({ low: 28, high: 39 });
    expect(out?.notes).toEqual([
      { from: 0, to: 1, pitch: 38, below: true },
      { from: 1, to: 2, pitch: 31 },
      { from: 2, to: 3, pitch: 34 },
      { from: 3, to: 4, pitch: 38 },
    ]);
  });

  it('never follows the part up', () => {
    // The other direction is a different question: a part written high is a
    // part playable where it is, so the open E stays where the rig put it.
    const over = [64, 67, 71].map((pitch, i) => ({ pitch, start: i, duration: 1 }));
    const out = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: over }]),
    );

    expect(out).toMatchObject({ low: 40, high: 51 });
    expect(out?.notes.some((note) => note.below)).toBe(false);
  });

  it('wraps the top of a part wider than an octave', () => {
    const out = buildBassline(
      setWith([
        {
          t: 0,
          name: 'Bass',
          slot: 0,
          loopEnd: 8,
          notes: [
            { pitch: 43, start: 0, duration: 1 },
            { pitch: 54, start: 1, duration: 1 },
            { pitch: 55, start: 2, duration: 1 },
            { pitch: 67, start: 3, duration: 1 },
          ],
        },
      ]),
    );

    expect(out).toMatchObject({ low: 40, high: 51 });
    expect(out?.notes.map((note) => note.pitch)).toEqual([43, 42, 43, 43]);
    expect(out?.notes.some((note) => note.below)).toBe(false);
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

  it('marks a note the four-string cannot reach, and only those', () => {
    const out = buildBassline(
      setWith([
        {
          t: 0,
          name: 'Bass',
          slot: 0,
          loopEnd: 8,
          notes: [
            { pitch: 35, start: 0, duration: 1 },
            { pitch: 39, start: 1, duration: 1 },
            { pitch: 40, start: 2, duration: 1 },
            { pitch: 45, start: 3, duration: 1 },
          ],
        },
      ]),
    );

    // The open E is the line: 35 and 39 are under it and get drawn an octave
    // up, 40 is it.
    expect(out?.notes).toEqual([
      { from: 0, to: 1, pitch: 47, below: true },
      { from: 1, to: 2, pitch: 51, below: true },
      { from: 2, to: 3, pitch: 40 },
      { from: 3, to: 4, pitch: 45 },
    ]);
  });

  it('tells two lines of the same shape an octave apart apart', () => {
    // Same shape, same rows, an octave apart. Only the lower one is out of
    // reach, and only its bottom note carries the dot.
    const shape = (at: number) => [at, at + 3, at + 7].map((pitch, i) => ({
      pitch,
      start: i,
      duration: 1,
    }));

    const under = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: shape(38) }]),
    );
    const over = buildBassline(
      setWith([{ t: 0, name: 'Bass', slot: 0, loopEnd: 4, notes: shape(50) }]),
    );

    expect(under?.notes.map((note) => note.below ?? false)).toEqual([true, false, false]);
    expect(over?.notes.some((note) => note.below)).toBe(false);
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
              { pitch: 47, start: 1, duration: 1 },
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
              { pitch: 38, start: 0, duration: 1 },
              { pitch: 45, start: 1, duration: 1 },
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
