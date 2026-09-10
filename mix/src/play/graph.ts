import { EFFECT_HIGH_PASS_HZ } from './effectHighPass.ts';
import { FLAT, Split } from '../eq.ts';

export const levelGain = (value: number) => (Math.max(0, Math.min(100, value)) / 100) ** 3;
export const dbGain = (value: number) => 10 ** (value / 20);
export const routeGain = (route: number, cross: number) => route === 1 ? 1 : route === 0 ? Math.min(1, (100 - cross) / 100) : Math.min(1, (100 + cross) / 100);
export function smooth(param: AudioParam, value: number, now: number) { param.cancelScheduledValues(now); param.setTargetAtTime(value, now, 0.008); }

/** Channel EQ/filter, pre-fader phones tap, post-fader output and measurement. */
export class MixerChannel {
  input: GainNode; output: GainNode; pre: GainNode;
  private eq: Split; private high: BiquadFilterNode; private low: BiquadFilterNode;
  private meter: AnalyserNode; private samples: Float32Array<ArrayBuffer>;
  private splitter?: ChannelSplitterNode;
  private stereoMeters: AnalyserNode[] = [];
  constructor(private ctx: AudioContext, stereo = false) {
    this.input = ctx.createGain(); this.eq = new Split(ctx); this.high = ctx.createBiquadFilter(); this.high.type = 'highpass'; this.high.frequency.value = 10; this.high.Q.value = 0;
    this.low = ctx.createBiquadFilter(); this.low.type = 'lowpass'; this.low.frequency.value = ctx.sampleRate / 2; this.low.Q.value = 0;
    this.pre = ctx.createGain(); this.output = ctx.createGain(); this.meter = ctx.createAnalyser(); this.meter.fftSize = 1024; this.samples = new Float32Array(1024);
    this.input.connect(this.eq.input); this.eq.output.connect(this.high); this.high.connect(this.low); this.low.connect(this.pre); this.pre.connect(this.output); this.output.connect(this.meter);
    if(stereo){
      this.splitter=ctx.createChannelSplitter(2);this.output.connect(this.splitter);
      this.stereoMeters=[0,1].map(channel=>{const meter=ctx.createAnalyser();meter.fftSize=1024;this.splitter!.connect(meter,channel);return meter;});
    }
  }
  apply(trim: number, bands: readonly number[], filter: number, gain: number) {
    const now = this.ctx.currentTime;
    smooth(this.input.gain, dbGain(trim), now);
    this.eq.apply({ ...FLAT, high: bands[0], mid: bands[1], low: bands[2] }, now, 0.015);
    smooth(this.high.frequency, filter > 0 ? 20 * 1000 ** (filter / 100) : 10, now);
    smooth(this.low.frequency, filter < 0 ? 20000 * (40 / 20000) ** (-filter / 100) : this.ctx.sampleRate / 2, now);
    smooth(this.output.gain, gain, now);
  }
  level(): number { this.meter.getFloatTimeDomainData(this.samples); let peak = 0; for (const n of this.samples) peak = Math.max(peak, Math.abs(n)); return Math.min(1, peak); }
  stereoLevels(): readonly [number,number] {
    const levels=this.stereoMeters.map(meter=>{meter.getFloatTimeDomainData(this.samples);let peak=0;for(const sample of this.samples)peak=Math.max(peak,Math.abs(sample));return Math.min(1,peak);});
    return [levels[0] ?? 0,levels[1] ?? 0];
  }
  dispose() { this.splitter?.disconnect();this.stereoMeters.forEach(m=>m.disconnect());this.input.disconnect(); this.eq.disconnect(); this.high.disconnect(); this.low.disconnect(); this.pre.disconnect(); this.output.disconnect(); this.meter.disconnect(); }
}

/** Wet-only return. Channel sends choose how much reaches it. */
export class MixerEffect {
  input: GainNode; output: GainNode;
  private nodes: AudioNode[] = []; private delays: DelayNode[] = []; private feedbacks: GainNode[] = [];
  private meter: AnalyserNode; private samples: Float32Array<ArrayBuffer>;
  private inlet: GainNode; private bypass: GainNode; private filtered: GainNode;
  private tone: BiquadFilterNode; private oscillator?: OscillatorNode; private depth?: GainNode;
  constructor(private ctx: AudioContext, readonly kind: string) {
    this.input = ctx.createGain(); this.output = ctx.createGain(); this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.nodes.push(this.input, this.output, this.tone);
    this.inlet=ctx.createGain();this.bypass=ctx.createGain();this.filtered=ctx.createGain();
    const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=EFFECT_HIGH_PASS_HZ;high.Q.value=Math.SQRT1_2;
    this.bypass.gain.value=1;this.filtered.gain.value=0;
    this.input.connect(this.bypass);this.bypass.connect(this.inlet);
    this.input.connect(high);high.connect(this.filtered);this.filtered.connect(this.inlet);
    this.nodes.push(this.inlet,this.bypass,this.filtered,high);
    if (kind === 'reverb') {
      [0.0297, 0.0371, 0.0411, 0.0533].forEach(time => {
        const delay = ctx.createDelay(1), feedback = ctx.createGain(), gain = ctx.createGain();
        delay.delayTime.value = time; gain.gain.value = 0.25;
        this.inlet.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(gain); gain.connect(this.tone);
        this.delays.push(delay); this.feedbacks.push(feedback); this.nodes.push(delay, feedback, gain);
      });
    } else {
      const delay = ctx.createDelay(4), feedback = ctx.createGain();
      this.inlet.connect(delay); delay.connect(this.tone); this.tone.connect(feedback); feedback.connect(delay);
      this.delays.push(delay); this.feedbacks.push(feedback); this.nodes.push(delay, feedback);
      if (kind === 'chorus' || kind === 'flanger') {
        this.oscillator = ctx.createOscillator(); this.depth = ctx.createGain();
        this.oscillator.connect(this.depth); this.depth.connect(delay.delayTime); this.oscillator.start(); this.nodes.push(this.oscillator, this.depth);
      }
    }
    this.tone.connect(this.output);this.meter=ctx.createAnalyser();this.meter.fftSize=256;this.samples=new Float32Array(256);this.output.connect(this.meter);this.nodes.push(this.meter);
  }
  setHighPass(on: boolean) {
    smooth(this.bypass.gain,on?0:1,this.ctx.currentTime);
    smooth(this.filtered.gain,on?1:0,this.ctx.currentTime);
  }
  apply(values: Record<string, number>, bpm: number) {
    const now = this.ctx.currentTime;
    smooth(this.tone.frequency, 300 * 60 ** ((values.tone ?? 50) / 100), now);
    if (this.kind === 'reverb') this.feedbacks.forEach((feedback, i) => smooth(feedback.gain, 0.001 ** (this.delays[i].delayTime.value / (values.decay ?? 2.5)), now));
    else {
      const modulated = !!this.oscillator;
      smooth(this.delays[0].delayTime, modulated ? this.kind === 'chorus' ? 0.018 : 0.004 : 60 / bpm * (this.kind === 'echo' ? 0.75 : 1), now);
      smooth(this.feedbacks[0].gain, this.kind === 'chorus' ? 0.1 : Math.min(0.92, (values.feedback ?? 35) / 100), now);
      if (this.oscillator && this.depth) { smooth(this.oscillator.frequency, values.rate ?? 1, now); smooth(this.depth.gain, this.kind === 'chorus' ? 0.008 * (values.depth ?? 40) / 100 : 0.002, now); }
    }
  }
  level():number {this.meter.getFloatTimeDomainData(this.samples);let peak=0;for(const value of this.samples)peak=Math.max(peak,Math.abs(value));return peak;}
  dispose() { this.oscillator?.stop(); this.nodes.forEach(node => node.disconnect()); }
}
