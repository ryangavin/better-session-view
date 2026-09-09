/** Explicitly opened macOS virtual source; epoch timestamps cross the IPC boundary. */
export interface BassMidiAPI {
  open(): Promise<string>;
  send(id: string, data: number[], epochMs: number): Promise<void>;
  clear(id: string): Promise<void>;
  ping(id: string): Promise<void>;
  close(id: string): Promise<void>;
}
