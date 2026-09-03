/**
 * A channel read at another speed.
 *
 * Windowed sinc, thirty-two lobes either side: what a varispeed tape does,
 * done without the tape. The output's sample `n` is the input at `from + n *
 * speed`, so a speed under one plays slower and longer. Speeds near one are
 * the whole use — a record measured at 128.055 laid at 128 — and the point
 * of sixty-four taps under a Kaiser window is that nothing is lost on the
 * way: flat to twenty kilohertz within a hundredth of a decibel, and the
 * error a hundred decibels under the signal. A five-minute stem is a few
 * seconds, which an export can afford and a stem cannot afford to lose.
 *
 * At a speed of exactly one from a whole sample the kernel is a single one
 * and the output is the input, bit for bit.
 *
 * Nothing is band-limited on the way down, because nothing here goes down
 * far enough to fold: a speed of two would alias, and no caller asks for it.
 */

const LOBES = 32;
const TAPS = 2 * LOBES;
/** How finely the fraction of a sample is resolved: a table of kernels, one per phase. */
const PHASES = 16384;
/** The Kaiser window's shape: twelve is a stopband a hundred and ten decibels down. */
const BETA = 12;

const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

/** The zeroth-order modified Bessel function, by its series. */
const bessel0 = (x: number): number => {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
};

/** A sinc under a Kaiser window: flat to the edge of hearing, and nothing past it. */
const kernel = (x: number): number => {
  if (Math.abs(x) >= LOBES) return 0;
  const window = bessel0(BETA * Math.sqrt(1 - (x / LOBES) ** 2)) / bessel0(BETA);
  return sinc(x) * window;
};

/**
 * Every kernel the loop will need, worked out once: the taps for a fraction
 * `p / PHASES` of a sample, each row normalised so a flat signal stays flat.
 * Sines per tap per output sample were most of the cost; a lookup is none.
 */
const TABLE: Float32Array = (() => {
  const table = new Float32Array((PHASES + 1) * TAPS);
  for (let p = 0; p <= PHASES; p++) {
    const frac = p / PHASES;
    let weight = 0;
    for (let t = 0; t < TAPS; t++) weight += kernel(t - LOBES + 1 - frac);
    for (let t = 0; t < TAPS; t++) table[p * TAPS + t] = kernel(t - LOBES + 1 - frac) / weight;
  }
  return table;
})();

export function resample(channel: Float32Array, speed: number, from: number, length: number): Float32Array {
  const out = new Float32Array(length);
  const last = channel.length - 1;
  for (let n = 0; n < length; n++) {
    const at = from + n * speed;
    const centre = Math.floor(at);
    if (centre < -LOBES || centre > last + LOBES) continue;
    const row = Math.round((at - centre) * PHASES) * TAPS;
    const start = centre - LOBES + 1;
    let sum = 0;
    if (start >= 0 && start + TAPS - 1 <= last) {
      for (let t = 0; t < TAPS; t++) sum += channel[start + t] * TABLE[row + t];
    } else {
      for (let t = 0; t < TAPS; t++) {
        const j = start + t;
        if (j >= 0 && j <= last) sum += channel[j] * TABLE[row + t];
      }
    }
    out[n] = sum;
  }
  return out;
}
