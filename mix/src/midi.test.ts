import { describe, expect, it } from 'vitest';
import { midiFile, midiVlq } from './midi.ts';
import type { TranscribedNote } from './tab.ts';

const note = (pitch: number | null, start: number, end: number): TranscribedNote => ({
  pitch,
  start,
  end,
  velocity: 91,
  confidence: pitch === null ? 0 : 0.9,
  muted: pitch === null,
});

describe('MIDI layout', () => {
  it('encodes variable-length delta times', () => {
    expect(midiVlq(0)).toEqual([0]);
    expect(midiVlq(127)).toEqual([127]);
    expect(midiVlq(128)).toEqual([0x81, 0]);
    expect(midiVlq(16383)).toEqual([0xff, 0x7f]);
  });

  it('writes pitched notes and omits muted attacks', () => {
    const bytes = Array.from(midiFile([note(28, 0.25, 0.5), note(null, 1, 1.1)]));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(bytes).toContain(28);
    expect(bytes.join(',')).toContain([0x90, 28, 91].join(','));
    expect(bytes.filter((byte) => byte === 0x90)).toHaveLength(1);
  });
});
