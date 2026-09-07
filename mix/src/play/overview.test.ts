import { describe, it, expect } from 'vitest';
import { measureOverview } from './overview.ts';
import { beatAt, evenBeats, sampleOf } from '../warp.ts';

function buffer(channels: Float32Array[], rate = 44100): AudioBuffer {
  return {numberOfChannels: channels.length, sampleRate: rate, length: channels[0].length,
    duration: channels[0].length/rate, getChannelData: (i:number) => channels[i]} as AudioBuffer;
}
const signal = () => new AbortController().signal;
describe('full-track beat overview', () => {
  it('keeps audible lead-in before bar 1 and aligns it across different decoder/map rates', async () => {
    const samples = new Float32Array(4*44100);
    const hit = Math.round(.7*44100); samples[hit] = .8;
    const audio = buffer([samples]);
    // Track C has a 2.43-second lead-in before its saved first downbeat.
    const map = evenBeats(48000,4*48000,128,2.4251666667);
    const overview = await measureOverview(audio,map,signal());
    const i = overview.peaks.findIndex(p => p.max > .7);
    expect(overview.start).toBeLessThan(-5);
    const from = overview.start+i/8, to = from+1/8;
    const beat = beatAt(map,hit/44100*map.rate);
    expect(beat).toBeGreaterThanOrEqual(from);
    expect(beat).toBeLessThan(to);
    expect(sampleOf(map,from)/map.rate).toBeLessThanOrEqual(.7);
    expect(sampleOf(map,to)/map.rate).toBeGreaterThan(.7);
    expect(overview.spectrum).toHaveLength(overview.peaks.length);
  });
  it('retains both stereo channels and the very end of the original', async () => {
    const left = new Float32Array(44100).fill(.5), right = new Float32Array(44100).fill(-.5);
    right[right.length-1] = -.9;
    const overview = await measureOverview(buffer([left,right]),evenBeats(44100,44100,120,0),signal());
    expect(overview.peaks[0]).toEqual({min:-.5,max:.5});
    expect(overview.peaks.at(-1)!.min).toBeCloseTo(-.9);
  });
  it('measures frequency content, independently of peak amplitude', async () => {
    const colors: number[][] = [];
    for (const hz of [70,900,9000]) {
      const samples = Float32Array.from({length:44100},(_,i) => .5*Math.sin(2*Math.PI*hz*i/44100));
      const overview = await measureOverview(buffer([samples]),evenBeats(44100,44100,120,0),signal());
      expect(overview.peaks[4].max).toBeCloseTo(.5,2);
      colors.push([...overview.spectrum[4]]);
    }
    colors.forEach((color,i) => expect(color.indexOf(Math.max(...color))).toBe(i));

  });
  it('cancels before reading a replaced track', async () => {
    const aborted = new AbortController(); aborted.abort();
    await expect(measureOverview(buffer([new Float32Array(10)]),evenBeats(44100,10,120,0),aborted.signal)).rejects.toThrow();
  });
});
