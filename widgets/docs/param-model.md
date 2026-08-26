# The parameter model

What a control is, before anything draws it. `src/param/param.ts` and `format.ts`.

## Why this is the foundation and the knob isn't

Every control on an Ableton device is a rendering of one of four things. That isn't a
guess about Ableton's design — it's published twice, in two places that agree:

- **Max for Live's parameter inspector** offers exactly Int, Float, Enum and Blob, plus
  range, unit style, exponential scaling, steps, initial value, and clip-modulation mode.
- **The LOM's `DeviceParameter`** exposes `value`, `min`, `max`, `default_value`,
  `is_enabled` and `str_for_value` — the same object seen from the other side.

So the widget list is downstream of this, not the other way round. Deciding "we need a
knob, a slider and a number box" and giving each its own notion of a value produces three
incompatible controls; deciding what a parameter is produces one model that any number of
widgets can draw. **Adding a widget should not require adding anything to this file.**

The four kinds are Live's, named in lower case: `float`, `int`, `enum`, `blob`. `blob` is
a list and is not automatable; nothing draws one yet, and it's here so the model isn't
quietly missing a quarter of Live's vocabulary.

## Range, taper and steps

Three separate ideas that a naïve control conflates.

**Range** is `min`/`max`, and it is not 0–1. A pan runs −1 to 1, a filter runs 20 to
20000. `fractionOf` maps a value onto the control (0 at `min`, 1 at `max`) and `valueAt`
maps back. Everything that draws — an arc, a fill, a thumb — asks for the fraction and
never touches the raw number.

**Taper** is `exponent`, Max's "Exponential Scaling". Above 1, the low end gets more of
the control: `value = min + span × fraction^exponent`. On a frequency this is the whole
difference between a usable knob and one where everything interesting lives in the first
eighth of a turn. It applies to the *position*, so the range's ends are untouched.

**Steps** is quantization, and its arithmetic has a trap. Steps count *reachable values*,
not intervals, so the divisor is `steps − 1`: Max's own worked example is a 0–64 range
with 4 steps reaching 0, 21.33, 42.66 and 64. Snapping happens on the **linear** position
rather than the tapered one, so the reachable values stay evenly spaced however the
control is curved — a stepped, tapered parameter has evenly spaced values that are
unevenly spaced on screen, which is correct and is what Live does.

An `int` or `enum` parameter rounds whether or not it declares steps.

`stepSize` is the keyboard's business: a quantized parameter moves by exactly one of its
own values, so the arrow keys can reach every setting and can never land between two.
Everything else gets a hundredth of its range, or a thousandth held fine.

## Spelling a value, and who gets to

`format` implements Max's eleven built-in unit styles — `time`, `hertz`, `decibel`,
`percent`, `pan`, `semitones`, `midi`, `custom` and the three plain numeric ones — because
those are Ableton's own vocabulary for how a device parameter reads. Pan spells a distance
from center (`50L`, `C`, `25R`), MIDI notes are named with 60 as C3, and `custom` takes
either a bare symbol or a sprintf-style pattern, exactly as `live.numbox` does.

**But it is a fallback, and the direction matters.** Where a real engine is behind the
control, the engine owns the text: Live's `str_for_value` *is* the string Live is showing,
and a second conversion maintained here would eventually disagree with it. So every widget
takes an optional `display` that wins outright, and `format` runs only when there is
nothing to defer to — the bench, a preview, an engine of our own. This is why
`set/src/lib/liveParam.ts` deliberately sets no `unit`: the app always has Live's string.

Two smaller decisions inside it:

- **Decimals are fixed, not trimmed, and chosen from the range.** A readout that drops its
  trailing zeros changes width as it counts, so the number slides sideways under the
  pointer for the whole of a drag — which is exactly when someone is reading it.
- **`-0` is printed as `0`**, because `(-0).toFixed(2)` is `"-0.00"`, which reads as a
  negative value that isn't one.

## Edges

`clamp` refuses `NaN` and returns `min`, but lets an infinity clamp like any other number,
so a decibel parameter whose floor is silence keeps reading `-inf` instead of being pulled
up to a finite minimum. `span` never returns zero, so a degenerate parameter divides by 1
rather than producing `NaN` all the way to the DOM.
