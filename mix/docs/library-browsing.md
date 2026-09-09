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
- Keep one-line grouped rows, full-credit tooltips, collaborator suffixes and
  track-ID drag payloads. Give the sort selector enough room to show its chosen name.
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
