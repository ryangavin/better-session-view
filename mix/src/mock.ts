/**
 * What a source is, what the models are, and what a slice is.
 *
 * This used to hold an invented library too, and does not any more: the library
 * is a real folder on disk now, read through `electron/library.ts`. What is
 * left here is domain rather than mock — six sources demucs actually emits,
 * three models it actually ships, and the shape of a slice.
 *
 * The audio is still invented, in `peaks.ts`, because nothing has decoded a
 * file yet.
 */

export interface Stem {
  id: string;
  name: string;
  /** The CSS custom property this stem is painted with. */
  ink: string;
  /**
   * One letter, for the library's badge strip.
   *
   * Six three-letter badges is a second line of text on every row; six letters
   * in a joined strip is a shape you read without reading — which is what a
   * list of a hundred and thirty tracks needs it to be.
   */
  glyph: string;
}

/**
 * Demucs's own six sources, in the order it emits them.
 *
 * Guitar and piano are only separated by a six-source model; a four-source one
 * folds both back into Other, which is why `Model.sources` is a list rather
 * than a count.
 */
export const STEMS: readonly Stem[] = [
  { id: 'vocals', name: 'Vocals', ink: 'var(--stem-vocals)', glyph: 'V' },
  { id: 'drums', name: 'Drums', ink: 'var(--stem-drums)', glyph: 'D' },
  { id: 'bass', name: 'Bass', ink: 'var(--stem-bass)', glyph: 'B' },
  { id: 'guitar', name: 'Guitar', ink: 'var(--stem-guitar)', glyph: 'G' },
  { id: 'piano', name: 'Piano', ink: 'var(--stem-piano)', glyph: 'P' },
  { id: 'other', name: 'Other', ink: 'var(--stem-other)', glyph: 'O' },
];

export const stemOf = (id: string): Stem => STEMS.find((s) => s.id === id) ?? STEMS[5];

const FOUR = ['vocals', 'drums', 'bass', 'other'];
const SIX = STEMS.map((s) => s.id);

export interface Model {
  id: string;
  label: string;
  sources: readonly string[];
  /** Against the clock, from `demucs/README.md`'s bench on this machine. */
  speed: string;
  blurb: string;
}

export const MODELS: readonly Model[] = [
  {
    id: 'htdemucs_ft',
    label: 'demucs ft · 6',
    sources: SIX,
    speed: '~0.6× realtime',
    blurb:
      'Four fine-tuned checkpoints, one per source. The cleanest vocal of the three, and the one to leave running while you do something else.',
  },
  {
    id: 'htdemucs',
    label: 'demucs · 4',
    sources: FOUR,
    speed: '~4.9× realtime',
    blurb:
      'Base Demucs, one transformer pass. Fast enough to audition a whole crate; guitar and piano stay folded into Other.',
  },
  {
    id: 'htdemucs_6s',
    label: 'demucs · 6',
    sources: SIX,
    speed: '~2.5× realtime',
    blurb:
      'Adds guitar and piano to the base model. The guitar is usable; the piano bleeds badly and is worth checking before you trust it.',
  },
];

export const modelOf = (id: string): Model => MODELS.find((m) => m.id === id) ?? MODELS[0];

/**
 * A slice is a span of bars with a name — what becomes one Session row when the
 * pack is written.
 *
 * Not called a scene or a cue, deliberately. Both already mean something exact
 * in Live and neither is this: a scene is a row you fire, a cue is a locator in
 * the Arrangement, and a slice is a cut this app made in a file it separated.
 * The word only has to survive contact with set[flow], where the other two are
 * load-bearing.
 */
export interface Slice {
  /** The bar it starts on, counting from zero. */
  bar: number;
  name: string;
}

const SLICE_NAMES = ['Intro', 'Verse A', 'Build', 'Drop', 'Break', 'Verse B', 'Lift', 'Outro'];

export const BARS = 64;

export const slicesFor = (count: number): Slice[] =>
  Array.from({ length: count }, (_, i) => ({
    bar: Math.round((i * BARS) / count),
    name: SLICE_NAMES[i % SLICE_NAMES.length],
  }));
