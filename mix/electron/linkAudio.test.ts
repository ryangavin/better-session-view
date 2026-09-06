import { describe, expect, it } from 'vitest';
import { validBlock, validCommand, validOutputs } from './linkAudio.ts';

describe('Link Audio IPC boundary', () => {
  it('accepts supported timing commands and rejects unbounded or non-finite values', () => {
    expect(validCommand({ kind: 'tempo', bpm: 20 })).toBe(true);
    expect(validCommand({ kind: 'tempo', bpm: 999 })).toBe(true);
    expect(validCommand({ kind: 'tempo', bpm: Infinity })).toBe(false);
    expect(validCommand({ kind: 'tempo', bpm: 1000 })).toBe(false);
    expect(validCommand({ kind: 'start', beat: -1.5, micros: 123456789 })).toBe(true);
    expect(validCommand({ kind: 'start', beat: NaN, micros: 123456789 })).toBe(false);
    expect(validCommand({ kind: 'align', beat: 0, micros: 0 })).toBe(false);
  });
  it('accepts separate decks plus master and rejects duplicate or unsafe identities', () => {
    const outputs = ['deck-a', 'deck-b', 'deck-c', 'deck-d', 'master'].map((id) => ({ id, name: id }));
    expect(validOutputs(outputs)).toBe(true);
    expect(validOutputs([...outputs, outputs[0]])).toBe(false);
    expect(validOutputs([{ id: 'ok', name: 'bad\0name' }])).toBe(false);
    expect(validOutputs([])).toBe(false);
  });
  it('rejects partial, oversized, non-PCM, and invalid timing blocks before writing to the pipe', () => {
    const block = { token: 1, micros: 1000000, rate: 48000, frames: 1024, samples: new Int16Array(5 * 2048) };
    expect(validBlock(block, 5)).toBe(true);
    expect(validBlock(block, 4)).toBe(false);
    expect(validBlock({ ...block, frames: 2048 }, 5)).toBe(false);
    expect(validBlock({ ...block, micros: NaN }, 5)).toBe(false);
    expect(validBlock({ ...block, rate: 0 }, 5)).toBe(false);
    expect(validBlock({ ...block, samples: new Float32Array(5 * 2048) as unknown as Int16Array }, 5)).toBe(false);
  });
});
