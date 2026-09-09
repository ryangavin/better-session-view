import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { BassMidiAPI } from '../src/bassMidi.ts';

export function validMidiNote(data: unknown): data is number[] {
  return Array.isArray(data) && data.length === 3 && data.every(Number.isInteger)
    && data[0] >= 0x80 && data[0] <= 0x9f && data[1] >= 0 && data[1] <= 127 && data[2] >= 0 && data[2] <= 127;
}

/** Only one owner: never let a second lab clear another lab's playing notes. */
export class BassMidiService implements BassMidiAPI {
  private held: { id: string; child: ChildProcessWithoutNullStreams } | null = null;
  constructor(private executable: string) {}
  async open(): Promise<string> {
    if (process.platform !== 'darwin') throw new Error('The mix[flow] virtual MIDI port requires macOS');
    if (this.held) throw new Error('The mix[flow] Bass port is already open in another lab');
    const child = spawn(this.executable, [], { stdio: 'pipe' }), id = randomUUID();
    this.held = { id, child };
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Virtual MIDI did not start')), 3000);
        const lines = createInterface({ input: child.stdout });
        const finish = (error?: Error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
        child.once('error', finish);
        child.once('exit', () => { if (this.held?.id === id) this.held = null; finish(new Error('Virtual MIDI stopped')); lines.close(); });
        child.stdin.on('error', () => { /* exit and ping report the closed helper */ });
        child.stderr.resume();
        lines.on('line', line => { if (line === 'ready') finish(); });
      });
      return id;
    } catch (e) { await this.close(id); throw e; }
  }
  private write(id: string, command: string) {
    if (!this.held || this.held.id !== id || this.held.child.stdin.destroyed) throw new Error('Virtual MIDI port is closed');
    if (this.held.child.stdin.writableLength > 65536) throw new Error('Virtual MIDI is not keeping up');
    this.held.child.stdin.write(command);
  }
  async send(id: string, data: number[], epochMs: number) {
    if (!validMidiNote(data) || !Number.isFinite(epochMs)) throw new Error('Invalid MIDI note');
    const delay = Math.max(0, Math.round(epochMs - Date.now()));
    if (delay > 600000) throw new Error('MIDI event is too far ahead');
    this.write(id, `n ${delay} ${data.join(' ')}\n`);
  }
  async clear(id: string) { this.write(id, 'c\n'); }
  async ping(id: string) { this.write(id, 'p\n'); }
  async close(id: string) {
    if (this.held?.id !== id) return;
    const child = this.held.child; this.held = null;
    // EOF clears notes and destroys the source, including after renderer loss.
    child.stdin.end('q\n');
  }
  stop() { if (this.held) void this.close(this.held.id); }
}
