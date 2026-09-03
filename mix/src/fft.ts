/**
 * The magnitude spectrum of a real frame, by a radix-2 Cooley–Tukey FFT.
 *
 * Enough for an onset function: the spectral flux in `flux.ts` compares each
 * frame's magnitudes with the last, and nothing downstream reads a phase.
 * Twiddles and the bit-reversal table are kept per frame size, since the
 * same size is asked for once per hop across the whole file.
 */

interface Plan {
  cos: Float64Array;
  sin: Float64Array;
  reversed: Uint32Array;
  re: Float64Array;
  im: Float64Array;
}

const plans = new Map<number, Plan>();

function planOf(n: number): Plan {
  const kept = plans.get(n);
  if (kept) return kept;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`fft: frame of ${n} is not a power of two`);
  const bits = 31 - Math.clz32(n);
  const reversed = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    let v = i;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (v & 1);
      v >>= 1;
    }
    reversed[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n);
    sin[k] = -Math.sin((2 * Math.PI * k) / n);
  }
  const plan = { cos, sin, reversed, re: new Float64Array(n), im: new Float64Array(n) };
  plans.set(n, plan);
  return plan;
}

/**
 * The magnitudes of bins 0 through n/2 of a real frame, into `out` where one
 * is given. The frame's length must be a power of two.
 */
export function magnitudesOf(frame: ArrayLike<number>, out?: Float64Array): Float64Array {
  const n = frame.length;
  const { cos, sin, reversed, re, im } = planOf(n);
  for (let i = 0; i < n; i++) {
    re[i] = frame[reversed[i]];
    im[i] = 0;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const stride = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * stride];
        const s = sin[k * stride];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  const bins = n / 2 + 1;
  const result = out ?? new Float64Array(bins);
  for (let k = 0; k < bins; k++) result[k] = Math.hypot(re[k], im[k]);
  return result;
}
