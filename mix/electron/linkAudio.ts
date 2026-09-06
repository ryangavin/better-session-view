import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { LinkAudioAPI, LinkBlock, LinkClock, LinkOutput } from '../src/linkAudioTypes.ts';

/** Fixed limits bound both IPC copies and the helper's queue. */
export function validOutputs(outputs: unknown): outputs is LinkOutput[] {
  return Array.isArray(outputs) && outputs.length > 0 && outputs.length <= 16
    && outputs.every((o) => o && typeof o.id === 'string' && /^[a-z0-9-]{1,64}$/.test(o.id)
      && typeof o.name === 'string' && o.name.length > 0 && o.name.length <= 128 && !/[\r\n\0]/.test(o.name))
    && new Set(outputs.map((o) => o.id)).size === outputs.length;
}
export function validBlock(block: LinkBlock, count: number): boolean {
  return !!block && Number.isSafeInteger(block.token) && block.token > 0
    && Number.isSafeInteger(block.micros) && block.micros > 0
    && Number.isInteger(block.rate) && block.rate >= 8000 && block.rate <= 192000
    && block.frames === 1024 && block.samples instanceof Int16Array
    && block.samples.length === count * 2048;
}

class Publisher {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, { resolve: (line: string[]) => void; reject: (why: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private ended: Error | null = null;
  private writing = false;
  touched = Date.now();
  readonly ready: Promise<void>;
  readonly outputs: LinkOutput[];

  constructor(executable: string, outputs: LinkOutput[]) {
    this.outputs = outputs;
    this.child = spawn(executable, ['mix[flow]', ...outputs.map((o) => o.name)], { stdio: 'pipe' });
    let stderr = '';
    this.child.stderr.on('data', (part: Buffer) => { stderr = (stderr + part.toString()).slice(-2000); });
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.stop(new Error('Link Audio did not start')); }, 5000);
      this.child.once('error', (why) => { clearTimeout(timer); reject(why); this.stop(why); });
      this.child.once('exit', () => {
        clearTimeout(timer);
        const why = this.ended ?? new Error(stderr || 'Link Audio stopped');
        reject(why);
        this.stop(why);
      });
      createInterface({ input: this.child.stdout }).on('line', (line) => {
        if (line === 'ready') { clearTimeout(timer); resolve(); return; }
        const words = line.split(' ');
        const request = Number(words[1]);
        const pending = this.pending.get(request);
        if (!pending) return;
        this.pending.delete(request);
        clearTimeout(pending.timer);
        pending.resolve(words);
      });
    });
    this.child.stdin.on('error', (why) => this.stop(why));
  }

  private request(header: (id: number) => string, bytes?: Buffer): Promise<string[]> {
    if (this.ended) return Promise.reject(this.ended);
    if (this.pending.size >= 4) return Promise.reject(new Error('Link Audio is not keeping up'));
    this.touched = Date.now();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop(new Error('Link Audio timed out')), 2000);
      this.pending.set(id, { resolve, reject, timer });
      // One write prevents a concurrent clock query from splitting a PCM frame.
      this.child.stdin.write(bytes ? Buffer.concat([Buffer.from(header(id)), bytes]) : header(id));
    });
  }

  async clock(): Promise<LinkClock> {
    const line = await this.request((id) => `c ${id}\n`);
    return { token: Number(line[1]), micros: Number(line[2]), tempo: Number(line[3]), peers: Number(line[4]) };
  }

  async write(block: LinkBlock): Promise<number> {
    if (!validBlock(block, this.outputs.length)) throw new Error('Invalid Link Audio block');
    if (this.writing) return -1;
    this.writing = true;
    try {
      const bytes = Buffer.from(block.samples.buffer, block.samples.byteOffset, block.samples.byteLength);
      const line = await this.request((id) => `a ${id} ${block.token} ${block.micros} ${block.frames} ${block.rate}\n`, bytes);
      return Number(line[2]);
    } finally { this.writing = false; }
  }

  stop(why = new Error('Link Audio disabled')): void {
    if (this.ended) return;
    this.ended = why;
    this.child.kill();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(why); }
    this.pending.clear();
  }
}

/** Each renderer owns its peer. An abandoned tab expires instead of leaving phantom inputs. */
export class LinkAudioService implements LinkAudioAPI {
  private sessions = new Map<string, Publisher>();
  private reaper: ReturnType<typeof setInterval>;
  private executable: string;
  constructor(executable: string) {
    this.executable = executable;
    this.reaper = setInterval(() => {
      for (const [id, publisher] of this.sessions) if (Date.now() - publisher.touched > 5000) void this.close(id);
    }, 1000);
    this.reaper.unref();
  }
  async open(outputs: LinkOutput[]): Promise<string> {
    if (!validOutputs(outputs)) throw new Error('Invalid Link Audio outputs');
    if (this.sessions.size >= 8) throw new Error('Too many Link Audio publishers');
    const id = randomUUID();
    const publisher = new Publisher(this.executable, outputs);
    this.sessions.set(id, publisher);
    try { await publisher.ready; return id; }
    catch (why) { await this.close(id); throw why; }
  }
  private get(id: string): Publisher {
    const publisher = this.sessions.get(id);
    if (!publisher) throw new Error('Link Audio session ended');
    return publisher;
  }
  clock(id: string): Promise<LinkClock> { return this.get(id).clock(); }
  write(id: string, block: LinkBlock): Promise<number> { return this.get(id).write(block); }
  async close(id: string): Promise<void> { this.sessions.get(id)?.stop(); this.sessions.delete(id); }
  stop(): void {
    clearInterval(this.reaper);
    for (const publisher of this.sessions.values()) publisher.stop();
    this.sessions.clear();
  }
}
