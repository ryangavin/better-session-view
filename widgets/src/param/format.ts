/**
 * How a value is spelled, when nobody more authoritative is spelling it.
 *
 * This is a fallback, and it matters which way round that is. Where there is a
 * real engine behind the control it owns the text — Live's `str_for_value` is
 * the string Live itself is showing, and a second conversion maintained here
 * would eventually disagree with it. Every widget therefore takes an optional
 * `display` that wins outright, and reaches this only when there is nothing to
 * defer to: the bench, a preview, an engine of our own.
 *
 * The styles are Max for Live's built-in set, which is Ableton's own vocabulary
 * for how a device parameter reads.
 */

import { clamp, span, type Param } from './param.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Decimals are fixed rather than trimmed, and chosen from the range.
 *
 * A readout that drops its trailing zeros changes width as it counts, so the
 * number jitters sideways under the pointer for the whole of a drag — which is
 * exactly when someone is reading it.
 */
function decimalsFor(width: number): number {
  const size = Math.abs(width);
  if (size <= 20) return 2;
  if (size <= 200) return 1;
  return 0;
}

function fixed(value: number, decimals: number): string {
  // -0 formats as "-0.00", which reads as a negative value that isn't one.
  const held = Object.is(value, -0) ? 0 : value;
  return held.toFixed(decimals);
}

/** `%0.2f Bogons` and friends. One directive, which is all the style allows. */
function sprintf(pattern: string, value: number): string {
  return pattern.replace(
    /%(-)?(0)?(\d+)?(?:\.(\d+))?([dfs])/,
    (_match, left, zero, width, precision, conversion) => {
      let text: string;
      if (conversion === 'd') text = String(Math.round(value));
      else if (conversion === 'f') text = value.toFixed(precision ? Number(precision) : 6);
      else text = String(value);
      const target = width ? Number(width) : 0;
      if (text.length >= target) return text;
      const pad = (zero && !left ? '0' : ' ').repeat(target - text.length);
      return left ? text + pad : pad + text;
    },
  );
}

/** The MIDI note number as Live names it, where 60 is C3. */
export function noteName(value: number): string {
  const note = Math.round(value);
  const name = NOTES[((note % 12) + 12) % 12];
  return `${name}${Math.floor(note / 12) - 2}`;
}

/** Pan reads as a distance from center, 50 at either extreme, like Live's. */
function panText(p: Param, value: number): string {
  const reach = Math.max(Math.abs(p.min), Math.abs(p.max), Number.EPSILON);
  const amount = Math.round((Math.abs(value) / reach) * 50);
  if (amount === 0) return 'C';
  return `${amount}${value < 0 ? 'L' : 'R'}`;
}

export function format(p: Param, value: number): string {
  if (p.kind === 'enum' && p.items?.length) {
    return p.items[Math.max(0, Math.min(p.items.length - 1, Math.round(value)))] ?? '';
  }

  const held = clamp(p, value);
  const decimals = decimalsFor(span(p));

  switch (p.unit ?? 'native') {
    case 'int':
      return String(Math.round(held));
    case 'time':
      return Math.abs(held) < 1000
        ? `${fixed(held, held === Math.round(held) ? 0 : 1)} ms`
        : `${fixed(held / 1000, 2)} s`;
    case 'hertz':
      return Math.abs(held) < 1000
        ? `${fixed(held, decimalsFor(1000))} Hz`
        : `${fixed(held / 1000, 2)} kHz`;
    case 'decibel':
      return Number.isFinite(held) ? `${fixed(held, 1)} dB` : '-inf dB';
    case 'percent':
      return `${fixed(held, 0)} %`;
    case 'pan':
      return panText(p, held);
    case 'semitones':
      return `${held > 0 ? '+' : ''}${fixed(held, 0)} st`;
    case 'midi':
      return noteName(held);
    case 'custom': {
      const pattern = p.customUnit ?? '';
      if (/%[-0-9.]*[dfs]/.test(pattern)) return sprintf(pattern, held);
      return pattern ? `${fixed(held, decimals)} ${pattern}` : fixed(held, decimals);
    }
    case 'float':
    case 'native':
    default:
      return p.kind === 'int' ? String(Math.round(held)) : fixed(held, decimals);
  }
}
