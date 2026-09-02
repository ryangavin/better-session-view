/**
 * What a file is called, read as an artist and a title.
 *
 * Nothing that arrives in this library brings metadata with it. A WAV bounced
 * out of a DAW has none at all, and a YouTube rip has a *filename* that is
 * usually the whole answer — `Artist - Title (Official Music Video)` — wrapped
 * in the noise a video platform puts around it. So the filename is the source,
 * and this is the reading of it.
 *
 * **A guess, and it says so by being separate from the manifest.** What comes
 * out of here is written as the track's title and artist on import, and the
 * separation screen shows both in fields you can correct. The alternative was
 * leaving every row named `01_bounce_final_FINAL` and asking a person to type
 * six hundred of them.
 *
 * No `electron` and no network: this is the half that can be tested with a
 * string, and `art.ts` is the half that cannot.
 */

/**
 * Words that mean a bracket is packaging rather than part of the name.
 *
 * A deny-list rather than stripping every bracket, and the difference is the
 * whole reason this list exists: `(Official Video)` is noise and
 * `(feat. Rosalía)`, `(Remix)`, `(Live at Massey Hall)` and `(Acoustic)` are
 * the name of the recording. Dropping every bracket would silently merge four
 * different tracks into one title.
 */
const NOISE =
  /^(official|officiel|lyrics?|lyric|audio|video|visuali[sz]er|mv|hd|hq|4k|1080p|720p|full|complete|free|download|explicit|clean|uncensored|remaster(ed)?|hq audio|high quality|music video|colou?r coded|sub(titulado|bed)?|letra|legendado)\b/i;

/** The dashes a person or a platform actually uses between an artist and a title. */
const DASH = /\s+[-–—]{1,2}\s+/;

/** `01. `, `01 - `, `01_`, `1) ` — a position in a folder, not part of the name. */
const TRACK_NUMBER = /^\s*\d{1,3}\s*[-–—._)\]]\s*/;

/**
 * What a Topic channel appends to every artist it uploads.
 *
 * Removed before the split rather than after it: `Artist - Topic - Title` has
 * a dash the reading would otherwise take as *the* dash, which puts `Topic` at
 * the front of the title and leaves it there.
 */
const TOPIC = /\s*[-–—]\s*topic\b(?=\s*[-–—]|\s*$)/i;

/**
 * The eleven-character video id `yt-dlp` is told to append.
 *
 * `mix/electron/youtube.ts` names its downloads `%(title)s [%(id)s].%(ext)s`,
 * so every YouTube import arrives with one of these on the end. It is not
 * bracketed *noise* — it matches no word in the list and never will — it is a
 * known suffix this app put there itself.
 */
const VIDEO_ID = /\s*\[[A-Za-z0-9_-]{11}\]\s*$/;

/**
 * Brackets whose contents are packaging, removed; the rest left alone.
 *
 * Both shapes, because `[Official Video]` and `(Official Video)` are the same
 * thing and a platform picks between them by mood.
 */
const unwrap = (text: string): string =>
  text
    .replace(/[([{]([^)\]}]*)[)\]}]/g, (whole, inside: string) =>
      NOISE.test(inside.trim()) ? ' ' : whole,
    )
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Underscores become spaces only when the name has none of its own.
 *
 * `Artist_-_Title` is a name that lost its spaces to a filesystem somewhere and
 * wants them back. `Some Track_v2` is a name with an underscore in it, and
 * turning that into `Some Track v2` is inventing a different name.
 */
const spaced = (text: string): string =>
  text.includes(' ') ? text : text.replace(/_+/g, ' ');

/** Straight and curly, at either end, plus the whitespace behind them. */
const unquoted = (text: string): string => text.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');

export interface Guess {
  title: string;
  /** Null rather than an empty string: nobody has said who this is by. */
  artist: string | null;
}

/**
 * Read a file's base name — no directory, no extension — as a track.
 *
 * The split is on the *first* dash, so `Artist - Title - Live` keeps the live
 * as part of the title rather than throwing it away or making it the artist.
 * A name with no dash in it is all title, because the one thing worse than not
 * knowing the artist is inventing one.
 */
export function guess(name: string): Guess {
  const bare = spaced(name).replace(VIDEO_ID, '').replace(TRACK_NUMBER, '');
  const cleaned = unquoted(unwrap(bare).replace(TOPIC, ''));
  if (!cleaned) return { title: name.trim() || 'track', artist: null };

  const at = cleaned.search(DASH);
  if (at < 0) return { title: cleaned, artist: null };

  const artist = unquoted(cleaned.slice(0, at));
  const title = unquoted(cleaned.slice(at).replace(DASH, ''));
  // A dash with nothing on one side of it is punctuation rather than a split.
  if (!artist || !title) return { title: cleaned, artist: null };
  return { title, artist };
}

/**
 * The two facts as one search term.
 *
 * Artist first, which is the order every catalogue's relevance ranking expects
 * — and no punctuation between them, because a dash in a query is a token the
 * search has to explain away rather than a hint.
 */
export const term = (found: Guess): string =>
  found.artist ? `${found.artist} ${found.title}` : found.title;
