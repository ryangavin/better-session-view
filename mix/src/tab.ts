import { barAt, type Bars } from './warp.ts';

export interface TranscribedNote {
  start: number;
  end: number;
  pitch: number | null;
  velocity: number;
  confidence: number;
  muted: boolean;
}

export interface TuningString {
  /** What appears at the left of the tab line, including octave. */
  name: string;
  /** MIDI pitch of the open string. */
  pitch: number;
}

export type Tuning = readonly TuningString[];

export interface FrettedNote extends TranscribedNote {
  string: number;
  fret: number | null;
  unplayable: boolean;
}

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9,
  'A#': 10, Bb: 10, B: 11,
};

/** Parse a required low-to-high tuning such as `E1 A1 D2 G2`. No default exists. */
export function parseTuning(text: string): Tuning | null {
  const words = text.trim().split(/[\s,]+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return null;
  const tuning: TuningString[] = [];
  for (const word of words) {
    const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(word);
    if (!match) return null;
    const note = `${match[1]!.toUpperCase()}${match[2] ?? ''}`;
    const octave = Number(match[3]);
    const chroma = PITCH_CLASS[note];
    if (chroma === undefined) return null;
    tuning.push({ name: `${note}${octave}`, pitch: (octave + 1) * 12 + chroma });
  }
  if (tuning.some((string, i) => i > 0 && string.pitch <= tuning[i - 1]!.pitch)) return null;
  return tuning;
}

interface Candidate {
  string: number;
  fret: number | null;
  unplayable: boolean;
}

const candidates = (note: TranscribedNote, tuning: Tuning, maxFret: number): Candidate[] => {
  if (note.muted || note.pitch === null) {
    return tuning.map((_, string) => ({ string, fret: null, unplayable: false }));
  }
  const playable = tuning.flatMap((open, string) => {
    const fret = note.pitch! - open.pitch;
    return fret >= 0 && fret <= maxFret ? [{ string, fret, unplayable: false }] : [];
  });
  return playable.length > 0 ? playable : [{ string: 0, fret: null, unplayable: true }];
};

const hand = (candidate: Candidate, fallback: number): number =>
  candidate.fret === null || candidate.fret === 0 ? fallback : candidate.fret;

/**
 * Choose one playable string/fret path for the whole line.
 *
 * This is the small Sayegh-style dynamic program: every note enumerates its
 * playable positions, and the cheapest complete path wins. Position jumps cost
 * most, unnecessary string changes cost a little, and very high frets carry a
 * steady surcharge. There is no learned or hidden tuning preference.
 */
export function assignFrets(notes: readonly TranscribedNote[], tuning: Tuning, maxFret = 24): FrettedNote[] {
  if (tuning.length < 2) throw new Error('a tuning needs at least two strings');
  if (notes.length === 0) return [];

  const choices = notes.map((note) => candidates(note, tuning, maxFret));
  const costs: number[][] = [];
  const previous: number[][] = [];

  for (let at = 0; at < choices.length; at += 1) {
    costs[at] = [];
    previous[at] = [];
    for (let c = 0; c < choices[at]!.length; c += 1) {
      const own = choices[at]![c]!;
      const surcharge = own.unplayable ? 1000 : Math.max(0, (own.fret ?? 0) - 12) * 0.12;
      if (at === 0) {
        costs[at]![c] = surcharge + (own.fret ?? 0) * 0.025;
        previous[at]![c] = -1;
        continue;
      }
      let best = Number.POSITIVE_INFINITY;
      let from = 0;
      for (let p = 0; p < choices[at - 1]!.length; p += 1) {
        const before = choices[at - 1]![p]!;
        const beforeHand = hand(before, own.fret ?? 0);
        const ownHand = hand(own, beforeHand);
        const jump = Math.abs(ownHand - beforeHand);
        const stringChange = own.string === before.string ? 0 : 0.7;
        const value = costs[at - 1]![p]! + jump + stringChange + surcharge;
        if (value < best) {
          best = value;
          from = p;
        }
      }
      costs[at]![c] = best;
      previous[at]![c] = from;
    }
  }

  let cursor = costs.at(-1)!.reduce((best, value, i, all) => value < all[best]! ? i : best, 0);
  const path = new Array<number>(notes.length);
  for (let at = notes.length - 1; at >= 0; at -= 1) {
    path[at] = cursor;
    cursor = previous[at]![cursor]!;
  }
  return notes.map((note, at) => ({ ...note, ...choices[at]![path[at]!]! }));
}

const mark = (note: FrettedNote): string => note.unplayable ? '?' : note.muted ? 'x' : String(note.fret);
const clock = (seconds: number): string => {
  const minute = Math.floor(seconds / 60);
  return `${String(minute).padStart(2, '0')}:${(seconds - minute * 60).toFixed(3).padStart(6, '0')}`;
};

function unquantized(notes: readonly FrettedNote[], tuning: Tuning): string[] {
  const lines = ['# no trusted grid — exact onset times', ''];
  for (const note of notes) {
    const cells = tuning.map((_, string) => string === note.string ? mark(note) : '-');
    lines.push(`${clock(note.start)}  ${cells.map((cell, i) => `${tuning[i]!.name}|${cell}`).reverse().join('  ')}`);
  }
  return lines;
}

function quantized(notes: readonly FrettedNote[], tuning: Tuning, bars: Bars, seconds: number): string[] {
  const bySlot = new Map<number, FrettedNote>();
  for (const note of notes) {
    const slot = Math.round(barAt(bars, note.start / seconds) * 16);
    const held = bySlot.get(slot);
    if (!held || Number(!note.muted) + note.confidence > Number(!held.muted) + held.confidence) {
      bySlot.set(slot, note);
    }
  }
  if (bySlot.size === 0) return ['# trusted grid · nearest sixteenth', '', '(no notes)'];

  const first = Math.floor(Math.min(...bySlot.keys()) / 64) * 64;
  const last = Math.floor(Math.max(...bySlot.keys()) / 64) * 64;
  const lines = ['# trusted grid · nearest sixteenth'];
  for (let block = first; block <= last; block += 64) {
    lines.push('', `bars ${Math.floor(block / 16) + 1}–${Math.floor((block + 63) / 16) + 1}`);
    for (let string = tuning.length - 1; string >= 0; string -= 1) {
      let row = `${tuning[string]!.name.padStart(3)}|`;
      for (let slot = block; slot < block + 64; slot += 1) {
        const note = bySlot.get(slot);
        const cell = note && note.string === string ? mark(note) : '-';
        row += `${cell.padStart(2, '-')}${(slot + 1) % 16 === 0 ? '|' : '-'}`;
      }
      lines.push(row);
    }
  }
  return lines;
}

export function renderTab(args: {
  notes: readonly TranscribedNote[];
  tuning: Tuning;
  seconds: number;
  bars?: Bars | null;
}): string {
  const fretted = assignFrets(args.notes, args.tuning);
  const heading = [
    '# mix[flow] bass transcription',
    `# tuning (low to high): ${args.tuning.map((string) => string.name).join(' ')}`,
    `# pitched ${fretted.filter((note) => !note.muted).length} · muted ${fretted.filter((note) => note.muted).length}`,
  ];
  const body = args.bars && args.seconds > 0
    ? quantized(fretted, args.tuning, args.bars, args.seconds)
    : unquantized(fretted, args.tuning);
  return `${[...heading, ...body].join('\n')}\n`;
}
