import type { HTMLAttributes } from 'react';
import type { Param } from '../param/param.ts';

export interface MixerSection { id: string; name: string }
export interface MixerStem {
  id: string;
  name: string;
  level: number;
  available: boolean;
  selected: string | null;
  /** Undefined: no pending change. Null: pending stop. */
  queued: string | null | undefined;
}
export type DeckControl = 'gain' | 'trim' | 'sendA' | 'sendB' | 'filter' | 'route' | 'cue' | 'full';
export interface MixerDeck {
  id: string;
  letter: string;
  track: { id: string; title: string; artist: string; bpm: number | null; key: string } | null;
  status: 'empty' | 'loading' | 'ready' | 'unavailable';
  message?: string;
  peaks: readonly { min: number; max: number }[];
  sections: readonly MixerSection[];
  stems: readonly MixerStem[];
  full: boolean;
  fullSection: string | null;
  fullQueued: string | null | undefined;
  gain: number; trim: number; sendA: number; sendB: number; filter: number;
  eq: readonly number[];
  route: number;
  cue: boolean;
}
export interface MixerState {
  /** False when a host has only a UI controller; disables clock-dependent actions. */
  playbackAvailable?: boolean;
  decks: readonly MixerDeck[];
  running: boolean;
  /** Whole beat for labels; fractional positions come from readFrame. */
  beat: number;
  loop: { start: number | null; end: number | null; enabled: boolean };
  canLoopOut: boolean;
  bpm: number; quantized: boolean; cross: number;
  master: number; masterTrim: number; masterFilter: number;
  masterSendA: number; masterSendB: number; masterEq: readonly number[];
  effects: readonly { id: string; name: string }[];
  fxA: string; fxB: string;
}
export type MasterControl = 'bpm' | 'cross' | 'master' | 'masterTrim' | 'masterFilter' | 'masterSendA' | 'masterSendB';
export interface MixerCommands {
  setRunning(value: boolean): void;
  stopAll(): void;
  setQuantized(value: boolean): void;
  loopIn(): void;
  loopOut(): void;
  setLoopEnabled(value: boolean): void;
  setEffect(slot: 'A' | 'B', effectId: string): void;
  setMaster(control: MasterControl, value: number): void;
  setMasterEq(band: number, value: number): void;
  setDeck(deckId: string, control: DeckControl, value: number | boolean): void;
  setDeckEq(deckId: string, band: number, value: number): void;
  setStemLevel(deckId: string, stemId: string, value: number): void;
  /** Null section requests stop; omitted stem targets the entire deck. */
  launch(deckId: string, sectionId: string | null, stemId?: string): void;
}
export interface MixerFrame {
  /** Absolute beat position per deck, and normalized measured output 0–1. */
  decks: Readonly<Record<string, { beat: number; level: number }>>;
  masterLevel: number;
}
export interface MixerTheme {
  primary: string;
  signal: string;
  stems: Readonly<Record<string, string>>;
  decks: Readonly<Record<string, { ink: string; waveform: string }>>;
}
export interface MixerParams {
  level: Param; trim: Param; send: Param; eq: Param; filter: Param; tempo: Param; cross: Param;
}
export interface MixerViewProps {
  /** Host-owned library drag/drop; the widget knows no library format. */
  deckProps?(deckId: string): HTMLAttributes<HTMLDivElement>;
  state: MixerState;
  commands: MixerCommands;
  /** Read-only, synchronous audio-clock/meter snapshot. Never advances playback. */
  readFrame(): MixerFrame;
  theme: MixerTheme;
  params: MixerParams;
}
