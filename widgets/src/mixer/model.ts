import type { SpectralEnergy } from '../theme/spectral.ts';
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
  /** Host-reported deck transport; absent while playback is not connected. */
  playing?: boolean;
  synced?: boolean;
  cueHeld?: boolean;
  loop?: { start: number | null; end: number | null; enabled: boolean };
  canLoopOut?: boolean;
  id: string;
  letter: string;
  track: { id: string; title: string; artist: string; bpm: number | null; key: string } | null;
  status: 'empty' | 'loading' | 'ready' | 'unavailable';
  message?: string;
  /** Optional scrolling source window. The host supplies the beat range and loop in source coordinates. */
  waveform?: { start: number; length: number; visible: number; loop?: { start: number; end: number | null; enabled: boolean } };
  peaks: readonly { min: number; max: number }[];
  /** Optional host-measured low/mid/high energy, one tuple per peak. */
  waveformSpectrum?: readonly SpectralEnergy[];
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
  effects: readonly { id: string; name: string; controls?: readonly { id: string; name: string; param: Param }[] }[];
  effectValues?: Partial<Record<'A' | 'B', Record<string, Record<string, number>>>>;
  fxA: string; fxB: string;
}
export type MasterControl = 'bpm' | 'cross' | 'master' | 'masterTrim' | 'masterFilter' | 'masterSendA' | 'masterSendB';
export interface MixerCommands {
  deckLoopIn?(deckId: string): void;
  deckLoopOut?(deckId: string): void;
  setDeckLoopEnabled?(deckId: string, enabled: boolean): void;
  setDeckSync?(deckId: string, synced: boolean): void;
  setDeckPlaying?(deckId: string, playing: boolean): void;
  /** Press/release intent; cue position and audition behavior belong to the host. */
  cueDeck?(deckId: string, held: boolean): void;
  setRunning(value: boolean): void;
  stopAll(): void;
  setQuantized(value: boolean): void;
  loopIn(): void;
  loopOut(): void;
  setLoopEnabled(value: boolean): void;
  setEffectParam?(slot: 'A' | 'B', effectId: string, paramId: string, value: number): void;
  setEffect(slot: 'A' | 'B', effectId: string): void;
  setMaster(control: MasterControl, value: number): void;
  setMasterEq(band: number, value: number): void;
  setDeck(deckId: string, control: DeckControl, value: number | boolean): void;
  setDeckEq(deckId: string, band: number, value: number): void;
  setStemLevel(deckId: string, stemId: string, value: number): void;
  /** Null section requests stop; omitted stem is a whole-deck hot cue; a stem ID requests a section loop. */
  launch(deckId: string, sectionId: string | null, stemId?: string): void;
}
export interface MixerFrame {
  /** Absolute beat position per deck, and normalized measured output 0–1. */
  decks: Readonly<Record<string, { beat: number; level: number; seconds?: number; duration?: number }>>;
  masterLevel: number;
}
export interface MixerTheme {
  primary: string;
  signal: string;
  stems: Readonly<Record<string, string>>;
  decks: Readonly<Record<string, { ink: string; waveform: string }>>;
}
export interface MixerParams {
  stemLevel?: Param;
  level: Param; trim: Param; send: Param; eq: Param; filter: Param; tempo: Param; cross: Param;
}
export interface MixerViewProps {
  /** The host already displays its shared transport above the mixer. */
  externalTransport?: boolean;
  /** Host-owned library drag/drop; the widget knows no library format. */
  deckProps?(deckId: string): HTMLAttributes<HTMLDivElement>;
  state: MixerState;
  commands: MixerCommands;
  /** Read-only, synchronous audio-clock/meter snapshot. Never advances playback. */
  readFrame(): MixerFrame;
  theme: MixerTheme;
  params: MixerParams;
}
