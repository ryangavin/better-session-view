import { describe, it, expect } from 'vitest';
import { measureScan, overviewOf } from './overview.ts';
import { SCAN_RATE } from './scan.ts';
import { beatAt, evenBeats, sampleOf } from '../warp.ts';

function buffer(channels: Float32Array[], rate = 44100): AudioBuffer {
  return {numberOfChannels: channels.length, sampleRate: rate, length: channels[0].length,
    duration: channels[0].length/rate, getChannelData: (i:number) => channels[i]} as AudioBuffer;
}
const signal = () => new AbortController().signal;
const drawn = async (audio: AudioBuffer, map: Parameters<typeof overviewOf>[1], at = signal()) =>
  overviewOf(await measureScan(audio, at), map, audio.duration);
describe('full-track beat overview', () => {
  it('keeps audible lead-in before bar 1 and aligns it across different decoder/map rates', async () => {
    const samples = new Float32Array(4*44100);
    const hit = Math.round(.7*44100); samples[hit] = .8;
    const audio = buffer([samples]);
    // Track C has a 2.43-second lead-in before its saved first downbeat.
    const map = evenBeats(48000,4*48000,128,2.4251666667);
    const overview = await drawn(audio,map);
    const i = overview.peaks.findIndex(p => p.max > .7);
    expect(overview.start).toBeLessThan(-5);
    const from = overview.start+i/overview.columnsPerBeat!, to = from+1/overview.columnsPerBeat!;
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
    const overview = await drawn(buffer([left,right]),evenBeats(44100,44100,120,0));
    expect(overview.peaks[0]).toEqual({min:-.5,max:.5});
    expect(overview.peaks.at(-1)!.min).toBeCloseTo(-.9);
  });
  it('measures frequency content, independently of peak amplitude', async () => {
    const colors: number[][] = [];
    for (const hz of [70,900,9000]) {
      const samples = Float32Array.from({length:44100},(_,i) => .5*Math.sin(2*Math.PI*hz*i/44100));
      const overview = await drawn(buffer([samples]),evenBeats(44100,44100,120,0));
      expect(Math.max(...overview.peaks.map(p => p.max))).toBeCloseTo(.5,2);
      colors.push(overview.spectrum.reduce<number[]>((sum, band) => sum.map((v,i) => v + band[i]), [0,0,0]));
    }
    colors.forEach((color,i) => expect(color.indexOf(Math.max(...color))).toBe(i));

  });
  it('draws whatever grid asks, from one walk of the samples', async () => {
    const samples = new Float32Array(4*44100);
    samples[Math.round(1.5*44100)] = .8;
    const scan = await measureScan(buffer([samples]),signal());
    expect(scan.rate).toBe(SCAN_RATE);
    expect(scan.bins).toBe(4*SCAN_RATE);
    const spike = (map: Parameters<typeof overviewOf>[1]) => {
      const overview = overviewOf(scan,map,4);
      const i = overview.peaks.findIndex(p => p.max > .7);
      return sampleOf(map,overview.start+i/overview.columnsPerBeat!)/map.rate;
    };
    // The same walk, read against a slower grid and against a shifted one.
    expect(spike(evenBeats(44100,4*44100,120,0))).toBeCloseTo(1.5,1);
    expect(spike(evenBeats(44100,4*44100,90,.3))).toBeCloseTo(1.5,1);
    expect(spike(evenBeats(44100,4*44100,174,.11))).toBeCloseTo(1.5,1);
  });
  it('cancels before reading a replaced track', async () => {
    const aborted = new AbortController(); aborted.abort();
    await expect(measureScan(buffer([new Float32Array(10)]),aborted.signal)).rejects.toThrow();
  });
});

it('retains short transients and their silent gaps from the saved scan, with bounded drawing work', async () => {
  const { levelsOf, packedOf } = await import('@openflow/widgets/wave/levels.ts');
  const { edgesOf, densityFor } = await import('@openflow/widgets/wave/outline.ts');
  const values = new Float32Array(400 * 5);
  // Two 5ms hits inside one former 62.5ms overview column, separated by silence.
  for (const [bin, peak] of [[2,.9],[9,.6]]) {
    values[bin*5] = -peak; values[bin*5+1] = peak; values[bin*5+2] = peak*peak;
  }
  const overview = overviewOf({rate:200,bins:400,values},evenBeats(48000,96000,120,0),2);
  expect(overview.columnsPerBeat).toBe(100);
  expect(overview.peaks[2].max).toBeCloseTo(.9);
  expect(overview.peaks[9].max).toBeCloseTo(.6);
  expect(overview.peaks.slice(3,9).every(p => p.min === 0 && p.max === 0)).toBe(true);
  const edges = edgesOf(levelsOf(packedOf(overview.peaks)),{from:0,to:1,width:800,height:50,
    density:densityFor(.25)*2,smooth:.35,headroom:.86});
  expect(edges.points).toBeLessThanOrEqual(800*2);
  expect(edges.read).toBeLessThanOrEqual(overview.peaks.length);
  expect(Math.min(...edges.topY)).toBeCloseTo(25-.9*25*.86);
  expect(edges.topY[5]).toBeGreaterThan(24);
});
