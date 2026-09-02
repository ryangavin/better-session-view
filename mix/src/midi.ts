import type { TranscribedNote } from './tab.ts';

/** One millisecond per tick, under the 60 BPM tempo written into the file. */
export const MIDI_TICKS_PER_SECOND = 1000;

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));

const u32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const u16 = (value: number): number[] => [(value >>> 8) & 0xff, value & 0xff];

/** MIDI's variable-length non-negative integer. */
export function midiVlq(value: number): number[] {
  let held = Math.max(0, Math.floor(value));
  const bytes = [held & 0x7f];
  while ((held >>>= 7) > 0) bytes.unshift((held & 0x7f) | 0x80);
  return bytes;
}

interface MidiEvent {
  tick: number;
  order: number;
  bytes: number[];
}

/**
 * Write the corrected pitched events as a small, dependency-free SMF file.
 *
 * The pitch worker writes MIDI for its standalone contract. Electron rewrites
 * that artifact from the cached note list so changing an octave is a layout
 * operation, not another run through the model.
 */
export function midiFile(notes: readonly TranscribedNote[]): Uint8Array {
  const events: MidiEvent[] = [
    // 1,000,000 µs per quarter at 1,000 ticks per quarter = one tick per ms.
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, 0x0f, 0x42, 0x40] },
    { tick: 0, order: 1, bytes: [0xff, 0x03, 0x04, ...ascii('Bass')] },
    // General MIDI Electric Bass (finger), zero-based program 33.
    { tick: 0, order: 2, bytes: [0xc0, 33] },
  ];

  for (const note of notes) {
    if (note.muted || note.pitch === null) continue;
    const pitch = Math.max(0, Math.min(127, Math.round(note.pitch)));
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity)));
    const on = Math.max(0, Math.round(note.start * MIDI_TICKS_PER_SECOND));
    const off = Math.max(on + 20, Math.round(note.end * MIDI_TICKS_PER_SECOND));
    events.push({ tick: on, order: 2, bytes: [0x90, pitch, velocity] });
    // Off sorts before an onset at the same tick, so adjacent notes do not overlap.
    events.push({ tick: off, order: 1, bytes: [0x80, pitch, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let at = 0;
  for (const event of events) {
    track.push(...midiVlq(event.tick - at), ...event.bytes);
    at = event.tick;
  }
  track.push(0, 0xff, 0x2f, 0);

  return Uint8Array.from([
    ...ascii('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(MIDI_TICKS_PER_SECOND),
    ...ascii('MTrk'), ...u32(track.length), ...track,
  ]);
}
