import workletUrl from './linkAudioWorklet.ts?worker&url';
import { openflow } from './openflow.ts';
import type { LinkBlock, LinkClock, LinkCommand, LinkOutput } from './linkAudioTypes.ts';
import { linkMicrosAt, type LinkTimeline } from './linkTiming.ts';

export interface LinkInput extends LinkOutput { node: AudioNode }
export interface LinkAudioState {
  enabled: boolean;
  starting: boolean;
  peers: number;
  outputs: string[];
  dropped: number;
  problem: string | null;
  tempo: number | null;
}
export const LINK_AUDIO_OFF: LinkAudioState = {
  enabled: false, starting: false, peers: 0, outputs: [], dropped: 0, problem: null, tempo: null,
};

/** Named graph outputs, independent of stems or decks. One instance is one Link peer. */
export class LinkAudioSender {
  state: LinkAudioState = LINK_AUDIO_OFF;
  private inputs: LinkInput[] = [];
  private node: AudioWorkletNode | null = null;
  private session: string | null = null;
  private revision = 0;
  private module: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private key = '';
  timeline: LinkTimeline | null = null;
  private offsets: { rtt: number; offset: number }[] = [];
  private pendingTempo: number | null = null;
  private sendingTempo = false;

  constructor(private context: AudioContext, private changed: () => void,
    private heard: (timeline: LinkTimeline, transportChanged: boolean) => void = () => {},
    private initialTempo: () => number = () => 120) {}

  private receive(clock: LinkClock, before: number, local = false): LinkTimeline | null {
    if (this.timeline && clock.token <= this.timeline.token) {
      // HTTP replies in the dev harness can arrive out of order. A plan still
      // needs its own launch time even when a newer clock has already arrived.
      return { ...clock, contextTime: this.timeline.contextTime + (clock.micros - this.timeline.micros) / 1e6 };
    }
    const after = performance.now();
    this.offsets.push({ rtt: after - before, offset: clock.micros - (before + after) * 500 });
    if (this.offsets.length > 16) this.offsets.shift();
    const best = this.offsets.reduce((a, b) => a.rtt < b.rtt ? a : b);
    const stamp = this.context.getOutputTimestamp();
    if (!stamp.performanceTime || stamp.contextTime === undefined) return null;
    const contextTime = stamp.contextTime + (clock.micros - stamp.performanceTime * 1000 - best.offset) / 1e6;
    // timeForIsPlaying is transformed by Link's clock correction too; a tiny
    // timestamp movement is not another Play/Stop command.
    const changed = !local && this.timeline !== null && clock.playing !== this.timeline.playing;
    const timeline = { ...clock, contextTime };
    this.timeline = timeline;
    this.node?.port.postMessage({ clock: { token: clock.token, contextTime, micros: clock.micros } });
    this.update({ tempo: Math.round(clock.tempo * 1e6) / 1e6, peers: clock.peers, starting: false });
    this.heard(timeline, changed);
    return timeline;
  }

  private async command(command: LinkCommand): Promise<LinkTimeline | null> {
    const session = this.session;
    const api = openflow()?.linkAudio;
    if (!session || !api) throw new Error('Link is still connecting');
    const before = performance.now();
    const clock = await api.control(session, command);
    if (session !== this.session) return null;
    return this.receive(clock, before, true);
  }

  async plan(beat: number, earliest: number, announce: boolean): Promise<LinkTimeline | null> {
    if (!this.timeline) return null;
    return this.command({ kind: announce ? 'start' : 'align', beat, micros: linkMicrosAt(this.timeline, earliest) });
  }
  stop(): void {
    const revision = this.revision;
    void this.command({ kind: 'stop' }).catch((why) => { if (revision === this.revision) this.fail(why); });
  }
  setTempo(bpm: number): void {
    this.pendingTempo = bpm;
    if (this.sendingTempo) return;
    this.sendingTempo = true;
    void (async () => {
      try {
        while (this.pendingTempo !== null && this.session) {
          const next = this.pendingTempo;
          this.pendingTempo = null;
          await this.command({ kind: 'tempo', bpm: next });
        }
      } catch (why) { this.fail(why); }
      finally { this.sendingTempo = false; }
    })();
  }

  setInputs(inputs: LinkInput[]): void {
    const key = JSON.stringify(inputs.map(({ id, name }) => [id, name]));
    this.detach();
    this.inputs = inputs;
    if (this.key === key) { this.attach(); return; }
    this.key = key;
    this.release();
    if (this.state.enabled && inputs.length) void this.start();
    else this.update({ outputs: inputs.map((input) => input.name), starting: false });
  }

  enable(enabled: boolean): void {
    if (enabled === this.state.enabled) return;
    this.release();
    this.update({ enabled, problem: null, dropped: 0, peers: 0, starting: enabled && this.inputs.length > 0 });
    if (enabled && this.inputs.length) void this.start();
  }

  private async start(): Promise<void> {
    const api = openflow()?.linkAudio;
    if (!api) { this.fail(new Error('Link Audio requires the mix app to be running')); return; }
    const revision = ++this.revision;
    this.update({ starting: true, outputs: this.inputs.map((input) => input.name) });
    let session: string | null = null;
    try {
      this.module ??= this.context.audioWorklet.addModule(workletUrl).catch((why) => { this.module = null; throw why; });
      await this.module;
      if (revision !== this.revision) return;
      session = await api.open(this.inputs.map(({ id, name }) => ({ id, name })), this.initialTempo());
      if (revision !== this.revision) { await api.close(session); return; }
      this.session = session;
      const node = new AudioWorkletNode(this.context, 'openflow-link-capture', {
        numberOfInputs: this.inputs.length, numberOfOutputs: 1, outputChannelCount: [1],
        channelCount: 2, channelCountMode: 'explicit',
        processorOptions: { channels: this.inputs.length },
      });
      this.node = node;
      // Silent output keeps the capture node being pulled even when monitoring is elsewhere.
      node.connect(this.context.destination);
      this.attach();
      let writing = false;
      let dropped = 0;
      let workletDropped = 0;
      let lastClock = 0;
      node.onprocessorerror = () => this.fail(new Error('Link Audio capture stopped'));
      node.port.onmessage = ({ data }: MessageEvent<LinkBlock & { dropped: number; tick?: boolean }>) => {
        workletDropped = data.dropped;
        if (data.tick) {
          if (performance.now() - lastClock >= 100) void clock();
          return;
        }
        const samples = data.samples;
        const recycle = () => node.port.postMessage({ recycle: samples.buffer }, [samples.buffer]);
        if (revision !== this.revision || writing) { dropped++; recycle(); return; }
        writing = true;
        void api.write(session!, data).then((sent) => { if (sent < 0) dropped++; })
          .catch((why) => { if (revision === this.revision) this.fail(why); })
          .finally(() => { writing = false; recycle(); });
      };
      let clocking = false;
      // Pick the least delayed sample from a short window to correlate the two clocks.
      const clock = async () => {
        if (clocking) return;
        clocking = true;
        const before = performance.now();
        lastClock = before;
        try {
          const clock = await api.clock(session!);
          if (revision !== this.revision) return;
          this.receive(clock, before);
          this.update({ dropped: dropped + workletDropped });
        } catch (why) { if (revision === this.revision) this.fail(why); }
        finally { clocking = false; }
      };
      this.timer = setInterval(() => void clock(), 100);
      await clock();
    } catch (why) {
      if (session && session !== this.session) void api.close(session).catch(() => {});
      if (revision === this.revision) this.fail(why);
    }
  }

  private attach(): void { if (this.node) this.inputs.forEach((input, i) => input.node.connect(this.node!, 0, i)); }
  private detach(): void {
    if (!this.node) return;
    for (const input of this.inputs) { try { input.node.disconnect(this.node); } catch { /* Graph already replaced. */ } }
  }
  private release(): void {
    this.revision++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.detach();
    this.node?.port.postMessage({ stop: true });
    this.node?.disconnect();
    this.node = null;
    if (this.session) void openflow()?.linkAudio.close(this.session).catch(() => {});
    this.session = null;
    this.timeline = null;
    this.offsets = [];
  }
  private fail(why: unknown): void {
    this.release();
    this.update({ enabled: false, starting: false, peers: 0, problem: why instanceof Error ? why.message : String(why) });
  }
  private update(change: Partial<LinkAudioState>): void {
    if (Object.entries(change).every(([key, value]) => this.state[key as keyof LinkAudioState] === value)) return;
    this.state = { ...this.state, ...change };
    this.changed();
  }
  dispose(): void { this.release(); }
}
