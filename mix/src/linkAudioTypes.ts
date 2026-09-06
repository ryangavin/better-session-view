/** One independently selectable stereo stream in Live. Keys survive track changes. */
export interface LinkOutput { id: string; name: string }
export interface LinkClock { token: number; micros: number; tempo: number; peers: number }
export interface LinkBlock {
  token: number;
  micros: number;
  rate: number;
  frames: number;
  /** Stream-major, with interleaved stereo samples within each stream. */
  samples: Int16Array;
}
export interface LinkAudioAPI {
  open(outputs: LinkOutput[]): Promise<string>;
  clock(session: string): Promise<LinkClock>;
  write(session: string, block: LinkBlock): Promise<number>;
  close(session: string): Promise<void>;
}
