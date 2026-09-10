export const EFFECT_HIGH_PASS_HZ = 200;
export const EFFECT_HIGH_PASS_HINT = 'High-pass the signal entering this effect at 200 Hz, 12 dB/octave. Dry bass and existing tails are unchanged.';
const KEY = 'mixflow.effect-high-pass.v1';
export type EffectHighPass = { A: boolean; B: boolean };
export function readEffectHighPass(): EffectHighPass {
  try { const saved=JSON.parse(localStorage.getItem(KEY) ?? '{}');return {A:saved?.A===true,B:saved?.B===true}; }
  catch { return {A:false,B:false}; }
}
export function saveEffectHighPass(value: EffectHighPass) {
  try { localStorage.setItem(KEY,JSON.stringify(value)); } catch { /* Audio controls remain usable without storage. */ }
}
