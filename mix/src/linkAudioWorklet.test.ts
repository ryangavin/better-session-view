import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function capture(streams: number) {
  let Processor: new (options: unknown) => { process(inputs: Float32Array[][]): boolean; port: { onmessage(event: unknown): void } };
  const messages: Record<string, unknown>[] = [];
  const realm = {
    currentFrame: 48000, sampleRate: 48000, Int16Array,
    AudioWorkletProcessor: class { port = { postMessage: (message: Record<string, unknown>) => messages.push(message) }; },
    registerProcessor: (_name: string, constructor: typeof Processor) => { Processor = constructor; },
  };
  const source = readFileSync(new URL('./linkAudioWorklet.ts', import.meta.url), 'utf8');
  runInNewContext(transformSync(source, { loader: 'ts', format: 'iife' }).code, realm);
  const node = new Processor!({ processorOptions: { channels: streams } });
  node.port.onmessage({ data: { clock: { token: 3, contextTime: 1, micros: 2000000 } } });
  const render = (inputs: Float32Array[][], blocks = 8) => {
    for (let i = 0; i < blocks; ++i) { node.process(inputs); realm.currentFrame += 128; }
  };
  return { node, render, messages };
}

describe('Link Audio capture', () => {
  it('keeps five stereo outputs separate and timestamps the first rendered sample', () => {
    const { render, messages } = capture(5);
    const inputs = Array.from({ length: 5 }, (_, i) => [
      new Float32Array(128).fill((i + 1) / 10), new Float32Array(128).fill(-(i + 1) / 10),
    ]);
    render(inputs);
    const block = messages.find((message) => message.samples)!;
    expect(block).toMatchObject({ token: 3, micros: 2000000, frames: 1024, rate: 48000 });
    const samples = block.samples as Int16Array;
    expect(samples.length).toBe(5 * 2048);
    for (let i = 0; i < 5; ++i) for (let frame = 0; frame < 1024; ++frame) {
      expect(samples[i * 2048 + frame * 2]).toBe(Math.round(inputs[i][0][0] * 32767));
      expect(samples[i * 2048 + frame * 2 + 1]).toBe(Math.round(inputs[i][1][0] * 32768));
    }
  });
  it('duplicates mono, silences disconnected inputs and invalid samples, and clips at PCM limits', () => {
    const { render, messages } = capture(3);
    const mono = new Float32Array(128).fill(2);
    mono[1] = -2; mono[2] = NaN;
    render([[mono], [], [new Float32Array(128).fill(Infinity)]]);
    const samples = messages.find((message) => message.samples)!.samples as Int16Array;
    expect([...samples.slice(0, 6)]).toEqual([32767, 32767, -32768, -32768, 0, 0]);
    expect(samples.slice(2048).every((value) => value === 0)).toBe(true);
  });
  it('bounds queued audio when the receiver stalls and resumes after a buffer is returned', () => {
    const { node, render, messages } = capture(1);
    const inputs = [[new Float32Array(128).fill(0.25)]];
    render(inputs, 40);
    const blocks = () => messages.filter((message) => message.samples);
    expect(blocks()).toHaveLength(3);
    node.port.onmessage({ data: { recycle: (blocks()[0].samples as Int16Array).buffer } });
    render(inputs);
    expect(blocks()).toHaveLength(4);
    expect(blocks()[3].dropped).toBe(2);
  });
  it('keeps a snapshot for the whole block when a new clock arrives mid-render', () => {
    const { node, render, messages } = capture(1);
    render([], 4);
    node.port.onmessage({ data: { clock: { token: 4, contextTime: 1, micros: 3000000 } } });
    render([], 12);
    const blocks = messages.filter((message) => message.samples);
    expect(blocks.map((block) => block.token)).toEqual([3, 4]);
  });
});
