/**
 * The library, the models and the slices — invented, and obviously so.
 *
 * mix[flow] has a window before it has a job runner, which is the right way
 * round: the layout is the thing worth arguing about, and arguing about it
 * against six lorem tracks is faster than arguing about it against a
 * separation that takes four minutes. Every number here is derived from an
 * index rather than random, so the picture is the same on every launch and a
 * screenshot means something.
 *
 * When `electron/demucs.ts` grows a job runner this file is what it replaces,
 * and the shapes below are the contract it will have to satisfy.
 */

export interface Stem {
  id: string;
  name: string;
  /** The CSS custom property this stem is painted with. */
  ink: string;
  /** Three letters, for the library's badges. */
  badge: string;
}

/**
 * Demucs's own six sources, in the order it emits them.
 *
 * Guitar and piano are only separated by a six-source model; a four-source one
 * folds both back into Other, which is why `Model.sources` is a list rather
 * than a count.
 */
export const STEMS: readonly Stem[] = [
  { id: 'vocals', name: 'Vocals', ink: 'var(--stem-vocals)', badge: 'VOX' },
  { id: 'drums', name: 'Drums', ink: 'var(--stem-drums)', badge: 'DRM' },
  { id: 'bass', name: 'Bass', ink: 'var(--stem-bass)', badge: 'BAS' },
  { id: 'guitar', name: 'Guitar', ink: 'var(--stem-guitar)', badge: 'GTR' },
  { id: 'piano', name: 'Piano', ink: 'var(--stem-piano)', badge: 'PNO' },
  { id: 'other', name: 'Other', ink: 'var(--stem-other)', badge: 'OTH' },
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

export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  length: string;
  format: string;
  /** Which sources are on disk. Empty means nothing has been separated yet. */
  separated: readonly string[];
  model: string;
}

const CATALOGUE: readonly [string, string, number, string][] = [
  ['Nightcrawler', 'Kaia Reyn', 124, 'F min'],
  ['Shelter Belt', 'Odd Harvest', 118, 'A min'],
  ['Copper Wire', 'Vale & Nim', 126, 'C maj'],
  ['Slow Rotor', 'Petra Kline', 120, 'D min'],
  ['Grand Palais', 'Sonder Unit', 122, 'G min'],
  ['Half Light', 'Amara Vex', 128, 'E min'],
  ['Wax Season', 'The Longwave', 110, 'B♭ maj'],
  ['Terrazzo', 'Junia', 130, 'F♯ min'],
  ['Dust Off The Kilns', 'Marek Osei', 116, 'C min'],
  ['Blue Hour Sequence', 'Nils Auber', 121, 'A maj'],
  ['Riverine', 'Cove Party', 125, 'D maj'],
  ['Two Doors Down', 'Halsey Grove', 114, 'E♭ maj'],
  ['Fever Map', 'Ilse Brandt', 132, 'G min'],
  ['Loading Bay', 'Quiet Cartel', 127, 'B min'],
  ['Undertow Radio', 'Sena Mori', 119, 'F maj'],
  ['Paper Anniversary', 'The Fold', 108, 'A♭ maj'],
  ['Sodium Lamps', 'Ryde', 129, 'C♯ min'],
  ['Cold Open', 'Nine Palms', 123, 'E maj'],
];

/** Which of them already have stems, and by which model. */
const ON_DISK: Record<number, string> = {
  0: 'htdemucs_ft',
  2: 'htdemucs',
  5: 'htdemucs_ft',
  9: 'htdemucs_6s',
  13: 'htdemucs',
};

const duration = (i: number): string => {
  const seconds = 168 + ((i * 37) % 120);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const LIBRARY: readonly Song[] = CATALOGUE.map(([title, artist, bpm, key], i) => ({
  id: `song-${i}`,
  title,
  artist,
  bpm,
  key,
  length: duration(i),
  format: i % 3 === 0 ? 'wav' : 'mp3',
  separated: ON_DISK[i] ? modelOf(ON_DISK[i]).sources : [],
  model: ON_DISK[i] ?? 'htdemucs_ft',
}));

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
