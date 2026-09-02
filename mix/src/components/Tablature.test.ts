import { describe, expect, it } from 'vitest';
import { parseTuning, type TranscribedNote } from '../tab.ts';
import { fretsIn } from './Tablature.tsx';

const note = (pitch: number | null, start: number, end = start + 0.25): TranscribedNote => ({
  pitch,
  start,
  end,
  velocity: 90,
  confidence: pitch === null ? 0 : 0.9,
  muted: pitch === null,
});

describe('on-screen tablature', () => {
  const tuning = parseTuning('E1 A1 D2 G2')!;

  it('projects exact MIDI time into the visible song slice', () => {
    const shown = fretsIn([note(28, 2), note(30, 5), note(32, 8)], tuning, 10, {
      from: 0.4,
      to: 0.9,
    });
    expect(shown.map((each) => each.pitch)).toEqual([30, 32]);
    expect(shown[0]).toMatchObject({ until: 0.25, label: '2' });
    expect(shown[0]!.at).toBeCloseTo(0.2);
    expect(shown[1]!.at).toBeCloseTo(0.8);
  });

  it('keeps muted and unplayable events visible', () => {
    const shown = fretsIn([note(null, 1), note(20, 2)], tuning, 4, { from: 0, to: 1 });
    expect(shown.map((each) => each.label)).toEqual(['x', '?']);
  });
});
