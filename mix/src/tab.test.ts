import { describe, expect, it } from 'vitest';
import { assignFrets, parseTuning, renderTab, type TranscribedNote } from './tab.ts';

const note = (pitch: number | null, start: number): TranscribedNote => ({
  pitch,
  start,
  end: start + 0.2,
  velocity: 90,
  confidence: pitch === null ? 0 : 0.9,
  muted: pitch === null,
});

describe('bass tuning', () => {
  it('requires an explicit low-to-high tuning', () => {
    expect(parseTuning('')).toBeNull();
    expect(parseTuning('E1')).toBeNull();
    expect(parseTuning('E1 A1 D2 G2')?.map((string) => string.pitch)).toEqual([28, 33, 38, 43]);
    expect(parseTuning('B0,E1,A1,D2,G2')?.map((string) => string.pitch)).toEqual([23, 28, 33, 38, 43]);
  });

  it('refuses malformed or non-ascending strings', () => {
    expect(parseTuning('E1 H1 D2 G2')).toBeNull();
    expect(parseTuning('G2 D2 A1 E1')).toBeNull();
  });
});

describe('fret assignment', () => {
  it('chooses a smooth playable path instead of the first candidate per note', () => {
    const tuning = parseTuning('E1 A1 D2 G2')!;
    const placed = assignFrets([note(40, 0), note(42, 0.5), note(43, 1)], tuning);
    expect(placed.map(({ string, fret }) => [string, fret])).toEqual([[2, 2], [2, 4], [3, 0]]);
  });

  it('uses the supplied five-string tuning without exporting it as a default', () => {
    const tuning = parseTuning('B0 E1 A1 D2 G2')!;
    expect(assignFrets([note(23, 0)], tuning)[0]).toMatchObject({ string: 0, fret: 0 });
    expect(assignFrets([note(22, 0)], tuning)[0]).toMatchObject({ unplayable: true });
  });
});

describe('tab text', () => {
  const tuning = parseTuning('E1 A1 D2 G2')!;

  it('lays a trusted grid onto sixteenth-note columns', () => {
    const text = renderTab({
      notes: [note(28, 0), note(30, 0.5), note(null, 1)],
      tuning,
      seconds: 4,
      bars: { origin: 0, across: 1 },
    });
    expect(text).toContain('# trusted grid · nearest sixteenth');
    expect(text).toContain('bars 1–4');
    expect(text).toContain('x');
  });

  it('prints exact times instead of inventing a grid', () => {
    const text = renderTab({ notes: [note(28, 1.25)], tuning, seconds: 4, bars: null });
    expect(text).toContain('# no trusted grid — exact onset times');
    expect(text).toContain('00:01.250');
  });
});
