import type { Param } from '@openflow/widgets/param/param.ts';
export const EFFECT_HIGH_PASS_HINT = 'High-pass the signal entering this effect: Off, then 20 Hz–2 kHz in logarithmic steps, 12 dB/octave. Dry bass and existing tails are unchanged. Double-click resets to Off.';
// 48 equal steps per decade (about 5% each); 200 Hz is an exact legacy position.
export const EFFECT_HIGH_PASS_CUTOFFS = [0, ...Array.from({length:97},(_,i)=>20 * 10 ** (i/48))];
export const EFFECT_HIGH_PASS_PARAM: Param = {kind:'enum',min:0,max:97,defaultValue:0,
  items:EFFECT_HIGH_PASS_CUTOFFS.map(hz=>hz===0?'Off':hz<1000?`${Math.round(hz)}Hz`:`${(hz/1000).toFixed(1)}kHz`)};
const KEY = 'mixflow.effect-high-pass.v2', LEGACY = 'mixflow.effect-high-pass.v1';
/** The shared enum knob speaks positions; storage and DSP speak Hz. */
export type EffectHighPass = { A: number; B: number };
export const highPassPosition = (value:number) => Number.isFinite(value)?Math.max(0,Math.min(97,Math.round(value))):0;
export const highPassHz = (position:number) => EFFECT_HIGH_PASS_CUTOFFS[highPassPosition(position)];
export function highPassPositionOf(hz:unknown) {
  if(typeof hz!=='number' || !Number.isFinite(hz) || hz<=0)return 0;
  return Math.max(1,Math.min(97,1+Math.round(48*Math.log10(hz/20))));
}
export function readEffectHighPass(): EffectHighPass {
  try {
    const raw=localStorage.getItem(KEY);
    if(raw!==null){const saved=JSON.parse(raw);return {A:highPassPositionOf(saved?.A),B:highPassPositionOf(saved?.B)};}
    const legacy=JSON.parse(localStorage.getItem(LEGACY) ?? '{}');
    return {A:legacy?.A===true?highPassPositionOf(200):0,B:legacy?.B===true?highPassPositionOf(200):0};
  } catch { return {A:0,B:0}; }
}
export function saveEffectHighPass(value: EffectHighPass) {
  try { localStorage.setItem(KEY,JSON.stringify({A:highPassHz(value.A),B:highPassHz(value.B)})); } catch { /* Audio controls remain usable without storage. */ }
}
