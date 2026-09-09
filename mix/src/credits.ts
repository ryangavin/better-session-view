/**
 * Who a track is filed under, when the credit names more than one person.
 *
 * A library of dance records is mostly collaborations, and a catalogue writes
 * them out in full: iTunes hands back `artistName` as `Skrillex`,
 * `Skrillex & Rick Ross` and `Skrillex, Fred again.. & Flowdan` for three
 * records by the same person (`mix/electron/art.ts` is what asks it, and
 * `enrich` in `electron/library.ts` is what writes the answer down). Filed on
 * the whole string those are three artists, and the rail grows a heading for
 * each — which is the thing this file exists to stop.
 *
 * **The stored credit is never touched.** `full` is the manifest's string,
 * character for character; `lead` is only where the rail *files* it. Nothing
 * here writes, and the track details still edit the whole credit by hand.
 *
 * **Only the lead is read, never the whole list.** Splitting a credit into its
 * members means deciding what every separator in it meant; deciding only where
 * the *first* one is means being right about one. A record billed
 * `Boys Noize & Skrillex` files under Boys Noize, which is what the billing
 * says and what a person looking for it expects.
 *
 * **A separator is only believed when the library already knows the name it
 * makes.** This is the whole guard, and it is the difference between this and
 * splitting on punctuation. `Above & Beyond`, `Tyler, The Creator`,
 * `Earth, Wind & Fire`, `Florence + The Machine` and `Simon & Garfunkel` are
 * single names that contain a join, and no list of exceptions will ever be
 * complete.
 * So the library itself is the evidence: `Skrillex & Rick Ross` files under
 * Skrillex because *Skrillex* is already a credit in this folder on its own,
 * and `Above & Beyond` files under `Above & Beyond` because `Above` is not.
 * A library that grows a solo record later starts grouping the collaborations,
 * which is the right way round — the wrong way round would need somebody to
 * maintain a list of bands with an ampersand in their name.
 *
 * `feat.` and its spellings are the exception that needs no evidence: nobody
 * is called `feat.`, so that join is always a join.
 *
 * There is a second guard on the ambiguous joins, and it is worth its line:
 * **a join followed by `the` is a band's name and not a list.** `Nick Cave and
 * the Bad Seeds`, `Florence + The Machine`, `Sly and the Family Stone` and
 * `Tyler, The Creator` all have a first half that a library may well hold on
 * its own, and corroboration alone would file the band under the person. A
 * second *artist* whose name opens with `The` exists, so this loses the
 * occasional real collaboration — in the direction of leaving it alone.
 */

/** One credit, read. Nothing in here is stored; the manifest keeps `full` alone. */
export interface Credit {
  /** Exactly what the manifest holds. */
  full: string;
  /** The name the rail files it under — `full` itself where there is one name. */
  lead: string;
  /** Everyone else, as they were written: `feat. Sirah`, `& Rick Ross`. Null where there is no one else. */
  others: string | null;
}

/**
 * Joins that are never part of a name, so they are believed on sight.
 *
 * `w/` is here because a filename uses it. `presents` is not: `Sasha presents
 * Xpander` is how a record is titled, and the alias is the point of it.
 */
const FEATURING = /\s+(?:feat\.|feat|ft\.|ft|featuring|w\/)\s+/i;

/**
 * Joins that are usually a list and sometimes somebody's name.
 *
 * Every one of these needs the library to vouch for the name in front of it.
 * The comma carries no surrounding space requirement because a catalogue
 * writes `A, B & C`; the rest do, so `Fred again..` keeps its full stops and
 * `Skrillex` is not split at its own x.
 */
const LISTING = /\s*,\s*|\s+&\s+|\s+\+\s+|\s+x\s+|\s+vs\.?\s+|\s+versus\s+|\s+and\s+|\s+with\s+/i;

/** One artist however the shift key went, matching how `listing.ts` bunches. */
const key = (name: string): string => name.trim().toLowerCase();

/** The credit if it names one artist and no one else, or null if any join is in it. */
const alone = (credit: string): string | null =>
  credit.search(FEATURING) < 0 && credit.search(LISTING) < 0 ? credit : null;

/** Where the earliest join of each kind falls, or `Infinity` for one that is not there. */
const found = (credit: string, join: RegExp): number => {
  const at = credit.search(join);
  return at < 0 ? Infinity : at;
};

/**
 * Split at `at`, keeping the separator on the second half.
 *
 * A leading comma is dropped and every other join is kept, because `& Rick
 * Ross` and `feat. Sirah` read as billing and `, Fred again..` reads as a typo.
 */
function apart(credit: string, at: number): Credit {
  const lead = credit.slice(0, at).trim();
  const rest = credit.slice(at).replace(/^\s*,\s*/, '').trim();
  return { full: credit, lead, others: rest || null };
}

/** Whether what follows the join at `at` opens with `the`, which makes the whole a band. */
function bandName(credit: string, at: number): boolean {
  const join = credit.slice(at).match(LISTING);
  return join ? /^the\b/i.test(credit.slice(at + join[0].length)) : false;
}

/** How a credit reads. Built once for a library, because the library is the evidence. */
export type Reading = (artist: string | null | undefined) => Credit | null;

/**
 * Read every credit in a library against every other one.
 *
 * Two passes, and the first is what makes the second work. Pass one collects
 * the names that stand on their own anywhere in the folder — a credit with no
 * join in it, and the lead of one whose only join is a `feat.`, since that one
 * is believed without evidence. Pass two is then allowed to believe an
 * ampersand exactly when it leaves behind a name pass one saw.
 *
 * The result is memoised per credit string: a library is thousands of rows and
 * a few hundred distinct credits, and the rail re-reads all of them on every
 * keystroke in the filter box.
 */
export function credits(artists: Iterable<string | null | undefined>): Reading {
  const written = [...artists].map((artist) => artist?.trim() ?? '').filter(Boolean);

  const known = new Set<string>();
  for (const credit of written) {
    const solo = alone(credit);
    if (solo) {
      known.add(key(solo));
      continue;
    }
    const at = found(credit, FEATURING);
    if (at === Infinity) continue;
    const lead = credit.slice(0, at).trim();
    if (alone(lead)) known.add(key(lead));
  }

  const read = (credit: string): Credit => {
    const featuring = found(credit, FEATURING);
    const listed = found(credit, LISTING);
    if (listed < featuring) {
      const split = apart(credit, listed);
      if (split.lead && known.has(key(split.lead)) && !bandName(credit, listed)) return split;
    }
    if (featuring !== Infinity) return apart(credit, featuring);
    return { full: credit, lead: credit, others: null };
  };

  const held = new Map<string, Credit>();
  return (artist) => {
    const credit = artist?.trim() ?? '';
    if (!credit) return null;
    const full = artist!;
    const was = held.get(full);
    if (was) return was;
    const now = { ...read(credit), full };
    held.set(full, now);
    return now;
  };
}
