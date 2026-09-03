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
 * A song's sources in the order the lanes draw them.
 *
 * The lanes walk `STEMS` and keep the ones the model made, so that — not the
 * order the manifest happens to list them in — is the order anything showing
 * or writing a stem per line has to follow. Anything the models grow later and
 * `STEMS` has not caught up with trails the known ones rather than vanishing.
 */
export const laneOrder = (sources: readonly string[]): string[] => [
  ...STEMS.filter((stem) => sources.includes(stem.id)).map((stem) => stem.id),
  ...sources.filter((id) => !STEMS.some((stem) => stem.id === id)),
];
