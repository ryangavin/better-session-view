# Library browsing release review

Reviewed 2026-09-09. Implementation: `src/credits.ts`, `src/listing.ts`,
`src/components/Library.tsx`, and the library state in `src/state.ts`.
Behavior reference: [the library rail](window.md#the-library-rail).

## What established libraries solve

- [Serato DJ Pro's library guide](https://support.serato.com/hc/en-us/articles/203015464-Sorting-and-browsing-your-library)
  separates narrowing a library through browsing/search from ordering its results.
  It supports Artist, Album and Added columns, reversible column sorting and a
  secondary sort. The useful principle here is predictable retrieval while the
  decks remain available, rather than copying a wide column table into a narrow rail.
- [rekordbox's workflow overview](https://rekordbox.com/en/feature/overview/)
  describes Collection Filter by date, genre, artist and album, a hierarchy for
  playlists/folders, and a second browser for managing collections. Collections
  answer a different question from artist grouping: a chosen set of tracks can
  cross artists and albums. They deserve a portable membership model if added later.
- [Apple Music's metadata guide](https://support.apple.com/en-ie/guide/music/mus2561f46f8/mac)
  distinguishes a track's Artist from Album Artist, offers compilation grouping,
  track numbers and custom sorting fields. A displayed credit is not a reliable
  canonical artist or album identity. Keep full billing even when browsing groups it.

These sources inform the scope; none specifies mix[flow]'s lead-credit heuristic.

## Visual study: density and hierarchy

The first review concentrated on retrieval behavior. That did not establish a coherent
visual design, and the subsequent stacked-label revision made the rail too tall.
The following references were inspected as images, not inferred from feature lists:

| Reference | Visible design choices | Application in this rail |
| --- | --- | --- |
| [Serato DJ Pro 4 overview](https://support.serato.com/hc/en-us/articles/14173738028175-Software-Overview-Serato-DJ-Pro-4-0) | A dense single-line track table below the decks; one column-label row; aligned metadata; restrained neutral rows and a clear selection stripe. | One header for Track / Stems / BPM; constant fact columns; single-line grouped tracks; alternating row shading; selection retains the app's amber edge. |
| [Traktor browser](https://docs.native-instruments.com/ni-tech-manuals/traktor-pro-manual/en/traktor-overview#browser) | Navigation hierarchy occupies a narrow left tree; tracks have regular rows, small covers and aligned numerical facts. Hierarchy and track facts use distinct spatial roles. | Artist bands and indented album covers identify the outline; track titles occupy the flexible column and facts stay aligned at the right. |

These are qualitative observations from official screenshots. The reference row heights
were not measured. The implemented sizes are specific to this app: 24px grouped tracks,
26px artist/album headings, 16px album covers, 36px flat rows. A 15-track artist with one
album occupies 412px including its two headings, instead of adding three text lines per
collaboration. All typography and surfaces use existing palette tokens.

The app has a narrow rail rather than these products' wide tables. Showing six labeled
stem cells, full collaborators, title and tempo simultaneously steals the title column.
The rail therefore uses a stem count with named hover details, shows collaborator suffixes
inline only from 400px, and keeps complete credits in the hover hint and search. Below
270px it hides the stems column. BPM never contains a filename extension or musical key;
those remain in the metadata tooltip. Small inline Artist / Album labels, weight and
indentation distinguish headings without large cards, repeated units or extra gaps.

The hierarchy is regular — artist, record, track — so indentation alone carries the
level. Tracks the catalogue never gave an album gather under a standing-in **No album**
record rather than floating beside the named ones. The rail's indent scale is one set of
custom properties (`--rail-pad`, `--step`, `--caret`, `--cover`, `--gap`), and a track's
title starts in the same column as the album name above it because both are computed from
those. Nothing draws a connecting guide or branch marks: a ladder into a list whose
indentation is already regular is decoration competing with the covers and the facts.

The Track / Stems / BPM header sits **inside** the scrolling list as a sticky row rather
than above it. Outside, it was laid out over the rail's full width while every row it
labels was laid out inside a scroller a scrollbar narrower, so the labels stood a
scrollbar's width right of the numbers under them. Sticky offsets follow from that: the
header holds the top, an artist rests below it, a record below the artist. The fact columns are
ruled, so a number on the right belongs to a column rather than floating at the end of a
widened rail. The rules are painted on the row as gradient stops off the same `--stems`
and `--bpm` widths the grid is laid out from, which is what keeps them on the column
edges as the rail is dragged; a stretched cell background would have cost the row its
ellipsis. Every row background is set with `background-color` rather than the shorthand,
or it would drop them. Nothing shades alternate rows: with the columns ruled, a second
alternation was noise on top of a list that already had covers, indentation and a
selection edge to read.

## The cut the rail renders in

The rail read as a foreign panel for a reason that was not layout. Every row and heading
in it is a `<button>`, and both carried `font: inherit` — the `font` shorthand resets
`font-variation-settings` to `normal`, so the whole rail rendered at Recursive's default
axes while the rest of the window renders at `CASL 0.38`. The rail was in a colder cut of
the same typeface than everything beside it, which is exactly the sort of difference that
is obvious and hard to name.

Measured against the running app, the suite's rule is **words proportional, figures
monospaced**: `Hot cue`, `Empty deck`, `Next bar` and `Trim` are all `MONO 0`, while
`0.0 dB`, `100 %` and the clock are `MONO 1`. The rail now states both explicitly rather
than inheriting either by accident — names, headings and the Artist label take
`--sans-axes`, and the stem count, tempo, heading counts and footer take `--mono-axes`.
Anywhere a button interrupts inheritance, the axes are restated on it.

Two things follow from that measurement. An artist heading no longer needs a bar to be
found: it keeps a single `border-top` where it had one above and below, since the doubled
rule was what made the rail read as a stack of strips rather than a list. And the `Album`
chip is gone — the suite labels a *region* once, the way `.mf-cap` does, and a record is
already told apart by its indent, its cover and its weight. Rows sit on `--ctl-h`, the
suite's control height, rather than on a number of their own.

## Project constraints and diagnosis

The manifest has title, artist, album and import time, but no album artist, track
number or collection membership. Import currently uses filenames and optional
catalogue enrichment, not embedded audio tags. Alphabetical album contents therefore
must not be presented as original album running order. Missing album metadata stays
missing; grouping never edits the manifest or source music.

The existing Claude Code work introduced Artist/Added/Title orders, collapsed headings,
compact grouped rows and corroborated lead-credit grouping. This review preserves that
work. The lead rule can consolidate collaborations when the folder also contains a
plain lead credit. It cannot prove identities from punctuation: a band can contain a
separator, and a collaborator billed later remains searchable rather than receiving a
duplicate row. Do not describe this as general artist canonicalization.

The configured library was inspected via the location in mix's settings and its
manifest, then through the running app. Its repeated lead credits exercise the intended
grouping, and incomplete album fields exercise the loose-track path. No metadata was
changed to make the examples work.

Four release issues were identified in the initial implementation:

1. A multi-word query had to fit entirely inside a single field. An artist plus a
   song title could return nothing even though the track existed.
2. Album eligibility was recalculated from search results, losing the heading when
   only one song matched.
3. Sticky headings were siblings in one scroll container, so an old album heading
   could remain above another artist's tracks.
4. Search exposed collapsed tracks but retained collapsed indicators and active
   toggles, allowing hidden changes to browsing state.

## Implemented scope

- Match every whitespace-separated query word across title, full credit and album,
  without regard to case or word order. Preserve the selected sort.
- Build album and artist identity before filtering; prune empty groups and show
  matching counts. Search temporarily expands results and disables collapse controls.
  Clear or Escape returns to the existing browsing state.
- Bound sticky artist and album headings by nested sections containing their tracks.
- Keep full-credit tooltips, collaborator credits and track-ID drag payloads.
  Give the sort selector enough room to show its chosen name. Use the compact outline
  and aligned facts described in the visual study below.
- Preserve the exact full credit even if the grouping parser trims outer whitespace.

Playlist editing, reverse/secondary sorts, embedded tags, album artist and track-number
metadata are follow-up product work. They require storage and interaction decisions;
adding incomplete versions here would expand this release fix without resolving the
observed retrieval defects.

## Verification

- All 70 mix test files / 806 tests passed, including search across fields, single-result
  album identity, matching counts, unchanged full credits, collapse indicators,
  bounded sections and library-to-deck track IDs.
- The isolated UI uses the running app's actual preload/IPC bridge through a temporary
  local review proxy; it does not use stand-in library data. The normal harness at
  port 5673 was opened first; the review UI is on 5674 to preserve the running checkout.
- Full repository typecheck passed after linking the worktree to the installed root
  and visuals dependencies. No package manifests or dependency versions changed.
- Live checks: corroborated collaborations appear under one lead heading; a combined
  artist/title query returns the expected single track with its album; collaborator
  plus album search expands a previously collapsed group; Escape restores that
  collapse state. Added and Title retain flat rows and the expected ordering.
- A filtered result was dragged onto deck A, finished decoding with its real waveform
  and enabled deck controls, and remained paused. This checks loading, not audio quality.
- At 1280×720 and a shorter scroll stress viewport, album headings stayed within
  their artist sections. The previous artist's album left the viewport before the
  next artist's tracks reached the top. Temporary viewport overrides were reset.
