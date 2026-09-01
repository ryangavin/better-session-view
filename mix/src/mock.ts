/**
 * What a source looks like on screen, and what a slice is.
 *
 * This used to hold an invented library, and then the model list, and holds
 * neither now: the library is a real folder read through `electron/library.ts`,
 * and the models are `electron/models.ts`, answered over the bridge so that
 * what the window offers and what a job actually runs cannot drift apart. What
 * is left is presentation — an ink and a glyph per source — and the shape of a
 * slice.
 *
 * The audio is not invented any more: `audio.ts` decodes the stems the
 * separator wrote and `engine.ts` plays them. What is left in here that is made
 * up is the slice list, and it is the last of it.
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
 * folds both back into Other, which is why a model declares the sources it emits
 * rather than a count.
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

/**
 * `count` evenly spaced slices across `bars`.
 *
 * Still invented, and the last invented thing in the window: nothing detects an
 * arrangement, so this is a ruler with names on it rather than a reading of the
 * song. It takes the bar count now instead of owning a constant one, because a
 * track is however long it is — the 64 that used to live here was only ever
 * true of audio that was made up.
 */
export const slicesFor = (count: number, bars: number): Slice[] =>
  Array.from({ length: count }, (_, i) => ({
    bar: Math.round((i * bars) / count),
    name: SLICE_NAMES[i % SLICE_NAMES.length],
  }));
