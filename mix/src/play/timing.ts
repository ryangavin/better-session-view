/** Nearest marker grid; ties go forward. Launch scheduling is a separate ceiling. */
export function snapBeat(beat:number,resolution:number):number {return resolution>0 ? Math.floor(beat/resolution+.5+1e-10)*resolution : beat;}
/** The division boundary at or before a beat, so a region built forward encloses it. */
export function floorBeat(beat:number,resolution:number):number {return resolution>0 ? Math.floor(beat/resolution+1e-10)*resolution : beat;}
export function launchWait(beat:number,resolution:number):number {return resolution>0 ? Math.max(0,Math.ceil((beat-1e-9)/resolution)*resolution-beat) : 0;}
export const LOOP_LENGTHS=[.25,.5,1,2,4,8,16,32,64] as const;
