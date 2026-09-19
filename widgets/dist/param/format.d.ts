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
import { type Param } from './param.ts';
/** The MIDI note number as Live names it, where 60 is C3. */
export declare function noteName(value: number): string;
export declare function format(p: Param, value: number): string;
/**
 * The longest reading the parameter has, in characters.
 *
 * Fixed decimals stop a number jittering as it counts, but they don't stop the
 * box around it changing size: `C` and `50L` are the same pan knob, 20px apart.
 * A control that sizes itself to what it currently reads therefore drags its
 * neighbours around for the whole of a drag, so every control reserves its
 * longest reading up front instead and never moves again.
 *
 * It samples rather than reasoning, because the extremes are not reliably the
 * longest: `-9.5 dB` is shorter than `-70.0 dB`, and `999 Hz` is longer than
 * `1.00 kHz`. An int is sampled at every value it holds, so a `C#-2` two notes
 * off the bottom of the range can't be missed.
 */
export declare function widestText(p: Param): number;
