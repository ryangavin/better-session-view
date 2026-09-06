import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evenBeats } from './warp.ts';
import type { LinkTimeline } from './linkTiming.ts';

const fixture = vi.hoisted(() => ({ publisher: null as any, schedules: [] as any[] }));
vi.mock('./linkAudio.ts', () => ({
  LINK_AUDIO_OFF: { enabled: false, tempo: null },
  LinkAudioSender: class {
    state = { enabled: false, tempo: null as number | null };
    timeline: LinkTimeline | null = null;
    changed: () => void;
    heard: (timeline: LinkTimeline, changed: boolean) => void;
    stop = vi.fn();
    setTempo = vi.fn();
    setInputs = vi.fn();
    plan = vi.fn(async (beat: number) => {
      const clock = { ...this.timeline!, beat: beat - 4, startMicros: this.timeline!.micros + 2000000 };
      this.timeline = clock;
      return clock;
    });
    constructor(_ctx: unknown, changed: () => void, heard: (timeline: LinkTimeline, changed: boolean) => void) {
      this.changed = changed; this.heard = heard; fixture.publisher = this;
    }
    enable(enabled: boolean) { this.state = { ...this.state, enabled }; this.changed(); }
    receive(clock: LinkTimeline, changed = false) {
      this.timeline = clock; this.state.tempo = clock.tempo; this.changed(); this.heard(clock, changed);
    }
  },
}));
vi.mock('./eq.ts', () => ({ FLAT: {}, Split: class {
  input = {}; output = { connect() {} }; apply() {} disconnect() {}
} }));
vi.mock('./stretch.ts', () => ({
  channelsOf: async () => [new Float32Array(480000), new Float32Array(480000)],
  stretchOf: async () => ({ latency: 0.05, node: {
    connect() {}, disconnect() {}, addBuffers: async () => {}, dropBuffers: async () => {},
    setUpdateInterval: async () => {},
    schedule: async (schedule: unknown) => { fixture.schedules.push(schedule); },
  } }),
}));
import { Transport } from './engine.ts';

class Context {
  currentTime = 10;
  sampleRate = 48000;
  destination = {};
  resume = async () => {};
  createGain() { return { connect() {}, disconnect() {}, gain: {
    value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {},
  } }; }
  createChannelSplitter() { return { connect() {}, disconnect() {} }; }
  createChannelMerger() { return { connect() {}, disconnect() {} }; }
  createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} }; }
}
const clock: LinkTimeline = { token: 1, micros: 1000000, contextTime: 10, tempo: 120,
  beat: 20, peers: 1, playing: false, playingMicros: 0, startMicros: 0 };
const settled = async () => { for (let i = 0; i < 15; ++i) await Promise.resolve(); };
function setup() {
  const audio = new Transport();
  audio.load({ drums: { duration: 10 } as AudioBuffer });
  audio.warp(evenBeats(48000, 480000, 120, 0), 120, false);
  audio.setLinkAudio(true);
  fixture.publisher.receive(clock);
  return audio;
}

describe('Link playback scheduling', () => {
  beforeEach(() => { fixture.schedules = []; vi.stubGlobal('AudioContext', Context); });
  it('ignores the playing state on join and schedules a new local Play at the SDK time', async () => {
    const audio = setup();
    fixture.publisher.receive({ ...clock, playing: true });
    await settled();
    expect(audio.playing).toBe(false);
    audio.play(0);
    await settled();
    expect(fixture.publisher.plan).toHaveBeenCalledWith(0, expect.any(Number), true);
    expect(fixture.schedules.filter((schedule) => schedule.active).at(-1)).toMatchObject({ input: 0, output: 12 });
    expect(audio.waiting).toBe(true);
    audio.pause();
    expect(audio.playing).toBe(false);
    expect(fixture.publisher.stop).toHaveBeenCalledOnce();
  });
  it('follows new remote starts without echoing them and ignores late plans after Stop', async () => {
    const audio = setup();
    let finish: (value: LinkTimeline) => void = () => {};
    fixture.publisher.plan.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fixture.publisher.receive({ ...clock, playing: true, playingMicros: 1234 }, true);
    await settled();
    expect(fixture.publisher.plan).toHaveBeenCalledWith(0, expect.any(Number), false);
    audio.stop();
    finish({ ...clock, startMicros: 3000000 });
    await settled();
    expect(fixture.schedules.some((schedule) => schedule.active)).toBe(false);
    expect(audio.playing).toBe(false);
  });
  it('cancels a scheduled local launch on disconnect without stopping other peers', async () => {
    const audio = setup();
    audio.play(0);
    await settled();
    expect(audio.waiting).toBe(true);
    audio.setLinkAudio(false);
    expect(audio.playing).toBe(false);
    expect(audio.monitoring).toBe(true);
    expect(fixture.publisher.stop).not.toHaveBeenCalled();
  });
  it('retimes rendered audio from Link beat position when the shared tempo changes', async () => {
    const audio = setup();
    audio.play(0);
    await settled();
    (audio.audio() as unknown as Context).currentTime = 13;
    fixture.publisher.receive({ ...clock, token: 2, contextTime: 13, micros: 4000000, beat: 2, tempo: 90 });
    const scheduled = fixture.schedules.filter((schedule) => schedule.active).at(-1);
    // The source is 120 BPM. Two shared beats put its playhead at one source second.
    expect(scheduled.input).toBeCloseTo(1 + (scheduled.output - 13) * 90 / 120, 5);
    audio.load({ drums: { duration: 10 } as AudioBuffer });
    expect(fixture.publisher.stop).not.toHaveBeenCalled();
  });
  it('keeps interior groove with four-bar pins and launches using that rendered phase', async () => {
    const audio = setup();
    const map = evenBeats(48000, 480000, 120, 0);
    // Beat one is 100 ms late, but the four-bar boundary is exactly eight seconds.
    const samples = [...map.samples];
    samples[1] += 4800;
    audio.warp({ ...map, samples }, 120, true, 4);
    await settled();
    audio.play(0.6);
    await settled();
    expect(fixture.publisher.plan).toHaveBeenLastCalledWith(1.2, expect.any(Number), true);
    const scheduled = fixture.schedules.filter((schedule) => schedule.active).at(-1);
    expect(scheduled.rate).toBeCloseTo(1);
    // Clock updates must not pull that late beat back onto a per-beat grid.
    (audio.audio() as unknown as Context).currentTime = 13;
    const count = fixture.schedules.length;
    fixture.publisher.receive({ ...clock, contextTime: 13, micros: 4000000, beat: 3.2 });
    expect(fixture.schedules).toHaveLength(count);
    // A denser explicit choice still reaches the engine.
    audio.pause(false);
    audio.warp({ ...map, samples }, 120, true, 'beat');
    audio.play(0.6);
    await settled();
    expect(fixture.publisher.plan).toHaveBeenLastCalledWith(1, expect.any(Number), true);
  });
});
