// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserMidiPort, MidiNotes, notesIn, PitchPlayer } from './player.ts';
import type { TranscribedNote } from '../../tab.ts';

const note = (start: number, end: number, pitch: number | null = 40): TranscribedNote => ({ start, end, pitch, velocity: 100, confidence: .8, muted: pitch === null });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('clips sustaining notes at passage boundaries and suppresses unpitched events', () => {
  expect(notesIn([note(0, 2), note(2, 3, null), note(3, 5, 45)], { from: 1, to: 4 }, -12)).toEqual([
    { start: 1, end: 2, pitch: 28, velocity: 100 }, { start: 3, end: 4, pitch: 33, velocity: 100 },
  ]);
  expect(notesIn([note(0, 2), note(1, 3)], { from: 0, to: 3 }, 0)[0].end).toBe(1);
});

it('queues paired MIDI messages only on the chosen channel and clears held notes on stop', () => {
  const port = { send: vi.fn(), clear: vi.fn() }, midi = new MidiNotes(port);
  const n = { start: 0, end: 1, pitch: 40, velocity: 100 };
  midi.note(n, 3, 1000, 2000, .5);
  expect(port.send.mock.calls).toEqual([[[0x92, 40, 50], 1000], [[0x82, 40, 0], 1998]]);
  midi.stop();
  expect(port.clear).toHaveBeenCalledOnce();
  expect(port.send).toHaveBeenLastCalledWith([0x82, 40, 0]);
  port.send.mockClear(); midi.stop();
  expect(port.send).not.toHaveBeenCalled();
});

it('does not send when muted and tolerates an unplug during note cleanup', () => {
  const port = { send: vi.fn(() => { throw new Error('unplugged'); }), clear: vi.fn() }, midi = new MidiNotes(port);
  const n = { start: 0, end: 1, pitch: 40, velocity: 100 };
  midi.note(n, 1, 0, 1000, 0);
  expect(port.send).not.toHaveBeenCalled();
  expect(() => midi.note(n, 1, 0, 1000)).toThrow();
  expect(() => midi.stop()).not.toThrow();
  expect(port.send).toHaveBeenLastCalledWith([0x80, 40, 0]);
});

function audioContext() {
  const sources: ReturnType<typeof node>[] = [], oscillators: ReturnType<typeof node>[] = [], gains: ReturnType<typeof node>[] = [];
  function node() {
    const n = { frequency: { value: 0 }, gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: (to: unknown) => to, disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    return n;
  }
  const ctx = { currentTime: 0, baseLatency: 0, outputLatency: 0, destination: {}, resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    createGain: () => { const n = node(); gains.push(n); return n; },
    createBufferSource: () => { const n = node(); sources.push(n); return n; },
    createOscillator: () => { const n = node(); oscillators.push(n); return n; } };
  vi.stubGlobal('AudioContext', function () { return ctx; });
  return { ctx, sources, oscillators, gains };
}

it('uses one audio clock for source and notes, seeks held notes, and cancels pending starts', async () => {
  const { ctx, sources, oscillators, gains } = audioContext();
  const player = new PitchPlayer();
  player.levels(.7, .4, false);
  const settings = { source: { duration: 2 } as AudioBuffer, notes: [note(.1, .8)], transpose: 0, span: { from: 0, to: 1 }, loop: false };
  await player.start(settings);
  expect(sources[0].start).toHaveBeenCalledWith(.04, 0, 1);
  expect(oscillators[0].start.mock.calls[0][0]).toBeCloseTo(.14);
  expect(oscillators[0].stop.mock.calls[0][0]).toBeCloseTo(.84);
  expect(gains[1].gain.value).toBe(0); // internal synth disabled before context creation
  ctx.currentTime = .4;
  await player.start(settings, .5);
  expect(sources[1].start).toHaveBeenCalledWith(.44, .5, .5);
  expect(oscillators[1].start.mock.calls[0][0]).toBeCloseTo(.44);
  player.stop();
  expect(oscillators[1].disconnect).toHaveBeenCalled();
  expect(player.position()).toBeNull();
  const pending = player.start(settings); player.stop(); await pending;
  expect(sources).toHaveLength(2);
  player.dispose(); expect(ctx.close).toHaveBeenCalledOnce();
});

it('schedules successive loop passes on exact boundaries', async () => {
  vi.useFakeTimers();
  const { ctx, sources } = audioContext();
  const player = new PitchPlayer();
  await player.start({ source: { duration: 5 } as AudioBuffer, notes: [note(0, 5)], transpose: 0, span: { from: 1, to: 2 }, loop: true });
  ctx.currentTime = 1;
  vi.advanceTimersByTime(25);
  expect(sources[1].start).toHaveBeenCalledWith(1.04, 1, 1);
  ctx.currentTime = 1.2;
  expect(player.position()).toBeCloseTo(1.16);
  player.stop();
  expect(sources.every(s => s.stop.mock.calls.length > 0)).toBe(true);
});

it('cancels browser-queued MIDI without relying on an OS clear method', () => {
  vi.useFakeTimers();
  const send = vi.fn(), port = new BrowserMidiPort({ send });
  port.send([0x90, 40, 100], performance.now() + 100);
  port.clear(); vi.advanceTimersByTime(200);
  expect(send).not.toHaveBeenCalled();
  port.send([0x90, 40, 100], performance.now() + 50);
  vi.advanceTimersByTime(50);
  expect(send).toHaveBeenCalledWith([0x90, 40, 100]);
});
