import {it,expect} from 'vitest';
import {snapBeat,launchWait} from './timing.ts';
it('separates nearest marker snapping from future launch scheduling, including lead-in and ties',()=>{
 expect(snapBeat(8.22,1)).toBe(8);expect(snapBeat(12.78,1)).toBe(13);expect(snapBeat(8.3,.5)).toBe(8.5);
 expect(snapBeat(-.5,1)).toBe(0);expect(snapBeat(-.8,1)).toBe(-1);expect(snapBeat(8.3,0)).toBe(8.3);
 expect(launchWait(8.22,4)).toBeCloseTo(3.78);expect(launchWait(8,4)).toBe(0);expect(launchWait(-.2,1)).toBeCloseTo(.2);
});
