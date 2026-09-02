import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forTrack, recall, remember, withTrack, type Session } from './remember.ts';

/**
 * What this protects is a reload losing somebody's work, and — more quietly —
 * a reload *crashing* because of what was in the store. The second is the one
 * worth tests: this runs before anything is on screen, so a throw here is a
 * blank window with no way back except clearing site data.
 */

/** A `localStorage` that behaves, and one that does not. */
const shelf = (): Storage => {
  const held = new Map<string, string>();
  return {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
    clear: () => held.clear(),
    key: (i: number) => [...held.keys()][i] ?? null,
    get length() {
      return held.size;
    },
  } as Storage;
};

beforeEach(() => {
  vi.stubGlobal('localStorage', shelf());
});

describe('recalling', () => {
  it('is empty before anything was ever kept', () => {
    expect(recall()).toEqual({});
  });

  it('round-trips a session', () => {
    const session: Session = { selected: 'a', model: 'htdemucs_ft', loop: false };
    remember(session);
    expect(recall()).toEqual(session);
  });

  it('is empty rather than throwing on a store that is not JSON', () => {
    localStorage.setItem('mixflow.window.v1', '{ half');
    expect(recall()).toEqual({});
  });

  it('is empty rather than throwing on JSON that is not a session', () => {
    localStorage.setItem('mixflow.window.v1', '"a string"');
    expect(recall()).toEqual({});
  });

  it('survives a browser that refuses to read at all', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage is disabled');
      },
    });
    expect(recall()).toEqual({});
  });

  it('survives a browser that refuses to write', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => remember({ selected: 'a' })).not.toThrow();
  });
});

describe('per-track memory', () => {
  it('is empty for a track nothing is known about', () => {
    expect(forTrack({}, 'nobody')).toEqual({});
  });

  it("keeps one track's mix out of another's", () => {
    let session: Session = {};
    session = withTrack(session, 'a', { at: 12 });
    session = withTrack(session, 'b', { at: 400 });
    expect(forTrack(session, 'a').at).toBe(12);
    expect(forTrack(session, 'b').at).toBe(400);
  });

  it('merges rather than replacing, so setting the head does not drop the mix', () => {
    let session: Session = {};
    session = withTrack(session, 'a', { levels: { vocals: { volume: 1, muted: false, soloed: false } } });
    session = withTrack(session, 'a', { at: 30 });
    expect(forTrack(session, 'a').levels?.vocals.volume).toBe(1);
    expect(forTrack(session, 'a').at).toBe(30);
  });
});

describe('what a track keeps of its grid', () => {
  it('round-trips the markers with the rest of the track', () => {
    const markers = [
      { at: 0.5, bar: 0 },
      { at: 75.5, bar: 40 },
    ];
    remember(withTrack({}, 'a', { bpm: 128, bpmAuto: true, offset: 0.5, markers }));
    expect(forTrack(recall(), 'a').markers).toEqual(markers);
  });

  it('reads a store from before there were markers as a track still owed a fit', () => {
    remember(withTrack({}, 'a', { bpm: 128, offset: 0.5 }));
    expect(forTrack(recall(), 'a').markers).toBeUndefined();
  });
});
