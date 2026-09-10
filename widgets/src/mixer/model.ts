import type { SpectralEnergy } from '../theme/spectral.ts';
import type { HTMLAttributes } from 'react';
import type { Param } from '../param/param.ts';

export interface MixerSection { id: string; name: string }
export interface MixerStem {
  id: string;
  name: string;
  level: number;
  available: boolean;
  playing?: boolean;
  cueHeld?: boolean;
  selected: string | null;
  /** Undefined: no pending change. Null: pending stop. */
  queued: string | null | undefined;
}
export type DeckControl = 'gain' | 'trim' | 'sendA' | 'sendB' | 'filter' | 'route' | 'cue' | 'full';
/**
 * One drawn source: the original in full mode, or one stem per lane in stem mode.
 *
 * Each carries its own reading and its own marks, because stems move apart —
 * that divergence is the thing the lanes are there to show.
 */
export interface MixerWaveLane {
  id: string;
  name: string;
  peaks: readonly { min: number; max: number }[];
  /** Optional host-measured low/mid/high energy, one tuple per peak. */
  spectrum?: readonly SpectralEnergy[];
  /** Where a Cue press returns this source, in beats. */
  cue?: number;
  /** Its own hot cue, when the source's own checkpoint sits away from the deck's. */
  stemCue?: number;
  loop?: { start: number; end: number | null; enabled: boolean };
}
export interface MixerDeck {
  /** Host-reported deck transport; absent while playback is not connected. */
  focus?: string;
  independentStems?: boolean;
  moveTogether?: boolean;
  gridAvailable?: boolean;
  loopFocus?: boolean;
  zoom?: number;
  playing?: boolean;
  synced?: boolean;
  slip?: boolean;
  cueHeld?: boolean;
  loop?: { start: number | null; end: number | null; enabled: boolean };
  canLoopOut?: boolean;
  id: string;
  letter: string;
  track: { id: string; title: string; artist: string; bpm: number | null; key: string } | null;
  status: 'empty' | 'loading' | 'ready' | 'unavailable';
  message?: string;
  /** Host-selected timing leader; never elected by the face. */
  syncLeader?: boolean;
  /** Source window; fixed shows the complete source rather than scrolling under the playhead. */
  waveform?: { fixed?: boolean; start: number; length: number; visible: number; lanes: readonly MixerWaveLane[] };
  /** Whole-track silhouette, drawn until the host supplies a window. */
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
  bpm: number; cross: number;
  /** Shared timing: every deck answers to one launch wait, marker division and loop length. */
  launchBeats: number;
  quantize: number;
  /** The quick loop's length in beats, shared by every deck. */
  loopBeats: number;
  master: number; masterTrim: number; masterFilter: number;
  masterSendA: number; masterSendB: number; masterEq: readonly number[];
  effects: readonly { id: string; name: string; controls?: readonly { id: string; name: string; param: Param }[] }[];
  effectValues?: Partial<Record<'A' | 'B', Record<string, Record<string, number>>>>;
  fxA: string; fxB: string;
  effectsEnabled?: boolean;
  effectEnabled?: {A:boolean;B:boolean};
  /** Host parameter positions; the host maps these to its DSP cutoff. */
  effectHighPass?: {A:number;B:number};
  effectHighPassParam?: Param;
  effectHighPassHint?: string;
  effectTailing?: boolean;
  phonesLevel?: number;
  phonesMix?: number;
}
export type MasterControl = 'bpm' | 'cross' | 'master' | 'masterTrim' | 'masterFilter' | 'masterSendA' | 'masterSendB';
export interface MixerCommands {
  setLaunchBeats?(beats:number):void;
  setQuantize?(beats:number):void;
  /** The quick loop length every deck answers to. */
  setLoopBeats?(beats:number):void;
  setSlip?(deckId:string, enabled:boolean):void;
  setLoopFocus?(deckId:string, focus:boolean):void;
  quickLoop?(deckId:string):void;
  resizeLoop?(deckId:string, factor:number):void;
  moveLoop?(deckId:string, beats:number):void;
  adjustLoop?(deckId:string, boundary:'in'|'out', beats:number):void;
  setFocus?(deckId: string, stemId: string): void;
  setMoveTogether?(deckId: string, together: boolean): void;
  /** Move active sources by one mapped beat; host owns boundaries and loop policy. */
  beatJump?(deckId:string, delta:-1|1):void;
  moveDeck?(deckId: string, phase: 'begin' | 'move' | 'commit' | 'cancel', deltaBeats?: number): void;
  setZoom?(deckId: string, beats: number): void;
  setStemPlaying?(deckId: string, stemId: string, playing: boolean): void;
  cueStem?(deckId: string, stemId: string, held: boolean): void;
  deckLoopIn?(deckId: string): void;
  deckLoopOut?(deckId: string): void;
  setDeckLoopEnabled?(deckId: string, enabled: boolean): void;
  setDeckSync?(deckId: string, synced: boolean): void;
  setDeckPlaying?(deckId: string, playing: boolean): void;
  /** Press/release intent; cue position and audition behavior belong to the host. */
  cueDeck?(deckId: string, held: boolean): void;
  setRunning(value: boolean): void;
  stopAll(): void;
  loopIn(): void;
  loopOut(): void;
  setLoopEnabled(value: boolean): void;
  setPhones?(control:'phonesLevel'|'phonesMix', value:number):void;
  setEffectsEnabled?(enabled:boolean):void;
  setEffectEnabled?(slot:'A'|'B', enabled:boolean):void;
  setEffectHighPass?(slot:'A'|'B', value:number):void;
  clearEffectTails?():void;
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
  decks: Readonly<Record<string, { beat: number; level: number; stereo?: readonly [number,number]; seconds?: number; duration?: number; sources?: Readonly<Record<string, {beat: number; seconds: number; playing: boolean; enabled: boolean; backgroundBeat?:number}>> }>>;
  masterLevel: number;
  masterStereo?: readonly [number,number];
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
