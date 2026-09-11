/** Ongoing musical-clock correction, separate from explicit launch/Cue acquisition. */
export function correctionRate(errorBeats:number,previous=0):number {
  const wanted=Math.abs(errorBeats)<.015 ? 0 : Math.max(-.01,Math.min(.01,errorBeats/16));
  return previous+Math.max(-.0025,Math.min(.0025,wanted-previous));
}
