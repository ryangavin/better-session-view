/** One independently selectable stereo stream in Live. Keys survive track changes. */
export interface LinkOutput { id: string; name: string }
export interface LinkClock {
  token: number; micros: number; tempo: number; peers: number;
  beat: number; playing: boolean; playingMicros: number;
  /** Nonzero only for an explicitly planned launch. */
  startMicros: number;
}
export type LinkCommand = { kind: 'tempo'; bpm: number }
  | { kind: 'start' | 'align'; beat: number; micros: number }
  | { kind: 'stop' };
export interface LinkBlock {
  token: number;
  micros: number;
  rate: number;
  frames: number;
  /** Stream-major, with interleaved stereo samples within each stream. */
  samples: Int16Array;
}
export interface LinkAudioAPI {
  open(outputs: LinkOutput[], tempo?: number): Promise<string>;
  clock(session: string): Promise<LinkClock>;
  control(session: string, command: LinkCommand): Promise<LinkClock>;
  write(session: string, block: LinkBlock): Promise<number>;
  close(session: string): Promise<void>;
}
