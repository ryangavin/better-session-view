export interface Crossovers { low:number; high:number }
/** Keep cutoffs audible and below Nyquist, including unusual decoded sample rates. */
export function crossoverLimit(rate:number):number {
  if(!Number.isFinite(rate)||rate<=50)throw new Error('Invalid analysis sample rate');
  return Math.min(20000,rate*.45);
}
export function defaultCrossovers(rate:number):Crossovers {
  const max=crossoverLimit(rate);
  const low=Math.min(250,Math.max(20,max/4));
  return {low,high:Math.max(low+1,Math.min(2500,max*.75))};
}
export function validateCrossovers(value:Crossovers,rate:number):void {
  const max=crossoverLimit(rate);
  if(!Number.isFinite(value.low)||!Number.isFinite(value.high)||value.low<20||value.high>max||value.high-value.low<1)throw new Error('Crossovers must be ordered, at least 1 Hz apart, between 20 Hz and the analysis limit');
}
/** Invalid persisted pairs reset together, never leave inverted band definitions. */
export function crossoversOf(value:unknown,rate:number):Crossovers {
  if(value&&typeof value==='object'){
    const s=value as Crossovers;
    try{validateCrossovers(s,rate);return {low:s.low,high:s.high};}catch{/* recover saved settings */}
  }
  return defaultCrossovers(rate);
}
