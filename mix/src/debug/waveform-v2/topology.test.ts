import { expect,it } from 'vitest';
import { prepare } from './model.ts';
import { columns,bandShares,spectralColor,activity } from './topology.ts';
function fixture(){const peak=Float32Array.from([0,1,0,0,.25,0,0,0]);return prepare({seconds:8,step:1,peak,rms:peak,bands:[peak,peak,peak],stems:[{id:'drums',rms:peak}]});}
it('retains a one-bin attack and silent gaps when reducing to display pixels',()=>{
  expect(columns(fixture(),0,8,4).map(c=>c.peak)).toEqual([1,0,.25,0]);
  expect(columns(fixture(),0,8,8).map(c=>c.peak)).toEqual([0,1,0,0,.25,0,0,0]);
});
it('keeps quiet zooms on the same whole-track reference and expands bins without interpolation',()=>{
  expect(columns(fixture(),4,6,4).map(c=>c.peak)).toEqual([.25,.25,0,0]);
  expect(columns(fixture(),8,10,2).map(c=>c.peak)).toEqual([0,0]);
});
it('weights color and separate stem activity over the same real duration including the tail',()=>{
  const peak=Float32Array.from([0,1]);const m=prepare({seconds:1.25,step:1,peak,rms:peak,bands:[peak,peak,peak],stems:[{id:'drums',rms:peak}]});
  const [c]=columns(m,0,1.25,1);expect(c.peak).toBe(1);expect(c.bands[0]).toBeCloseTo(Math.sqrt(.2));expect(c.stems[0]).toBe(c.bands[0]);
});
it('frequency shares fill the peak without inventing additive band amplitudes',()=>{
  expect(bandShares([1,2,1])).toEqual([.25,.5,.25]);expect(bandShares([0,0,0])).toEqual([0,0,0]);
  expect(spectralColor([1,0,0])).toEqual([220,52,52]);expect(spectralColor([0,1,0])).toEqual([52,220,52]);expect(spectralColor([0,0,1])).toEqual([52,52,220]);
});
it('does not show stem activity for silence or below the declared floor',()=>{
  expect(activity(0)).toBe(0);expect(activity(.0001)).toBe(0);expect(activity(.001)).toBe(0);expect(activity(1)).toBe(1);expect(activity(.1)).toBeCloseTo(2/3);
});
