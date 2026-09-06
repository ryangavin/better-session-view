// No imports at runtime: this runs on Web Audio's rendering thread.
declare const currentFrame: number;
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  port: MessagePort;
}
declare function registerProcessor(name: string, processor: new (options: { processorOptions: { channels: number } }) => AudioWorkletProcessor): void;

interface Clock { token: number; contextTime: number; micros: number }
class LinkCapture extends AudioWorkletProcessor {
  private channels: number;
  private pool: Int16Array[];
  private buffer: Int16Array | undefined;
  private offset = 0;
  private begin = 0;
  private clock: Clock | null = null;
  private pendingClock: Clock | null = null;
  private dropped = 0;
  private active = true;
  constructor(options: { processorOptions: { channels: number } }) {
    super();
    this.channels = options.processorOptions.channels;
    this.pool = Array.from({ length: 3 }, () => new Int16Array(this.channels * 2048));
    this.port.onmessage = ({ data }) => {
      if (data.clock) this.pendingClock = data.clock;
      if (data.recycle) this.pool.push(new Int16Array(data.recycle));
      if (data.stop) this.active = false;
    };
  }
  process(inputs: Float32Array[][]): boolean {
    if (!this.active) return false;
    const frames = inputs.find((input) => input[0]?.length)?.[0].length ?? 128;
    for (let frame = 0; frame < frames; ++frame) {
      if (this.offset === 0) {
        this.begin = currentFrame + frame;
        this.clock = this.pendingClock;
        this.buffer = this.pool.pop();
      }
      if (this.buffer) {
        for (let stream = 0; stream < this.channels; ++stream) {
          const input = inputs[stream];
          for (let side = 0; side < 2; ++side) {
            const value = input?.[side]?.[frame] ?? input?.[0]?.[frame] ?? 0;
            const safe = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
            this.buffer[stream * 2048 + this.offset * 2 + side] = Math.round(safe * (safe < 0 ? 32768 : 32767));
          }
        }
      }
      if (++this.offset === 1024) {
        this.port.postMessage({ tick: true, dropped: this.dropped });
        if (this.buffer && this.clock && this.begin / sampleRate - this.clock.contextTime < 0.5) {
          const samples = this.buffer;
          this.port.postMessage({ samples, frames: 1024, rate: sampleRate,
            token: this.clock.token,
            micros: Math.round(this.clock.micros + (this.begin / sampleRate - this.clock.contextTime) * 1e6),
            dropped: this.dropped,
          }, [samples.buffer]);
        } else {
          if (this.buffer) this.pool.push(this.buffer);
          if (this.clock) this.dropped++;
        }
        this.buffer = undefined;
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('openflow-link-capture', LinkCapture);
