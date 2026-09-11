# Original-song keys

`src/keyDetection.ts`, `electron/keyDetection.ts`, `src/components/LibraryKey.tsx`,
`tools/keyfinder.ts`, `native/keyfinder.cpp`.

The default is libkeyfinder 2.2.8 on the complete original recording. It produces one
primary major/minor key or Unknown. This is a useful guess, not a promise about every
passage; no modulation or certainty is fabricated. The library shows the plain key
without a question-mark badge. The optional bass estimator and Essentia remain research
comparisons under Debug → Key detection → Compare detectors · experiments.

## Editing and running

Click the key in a library row to choose a correction, including Unknown. Save key
writes `Track.key` through the existing narrow metadata edit API. **Use detected**
clears that override (`null`); it does not delete the detector evidence. **Detect from
original** runs/checks that song and refreshes the library. Manual corrections always
win and survive detection, import enrichment and new separation. The editor is a shared
Modal with visible button labels and does not load a deck or audition audio. Its width
is independent of the table; the Key column can shrink to 80 px and retains saved widths
and reorder behavior.

New file/YouTube imports attempt key detection after copying/enrichment and before the
updated library is returned. A per-song detection failure leaves the audio imported
and reports a retryable pending-key message. An occupied engine never gets canceled
or stolen; retry from the editor or library update once it finishes. Browsing/reading
metadata never starts detection, promotes experimental data or loads pitch maps.

Debug → Key detection → **Update library keys** checks all songs using the canonical
libkeyfinder path. The current record or an exactly matching experimental result is
reused, so updating this library does not imply running the algorithm again. Advanced
library controls retain missing-only preview, inclusion of existing records, progress,
per-song errors and stop-after-current. The standalone CLI is:

```sh
node tools/mix-key-backfill.ts                 # preview
node tools/mix-key-backfill.ts --run           # missing canonical keys
node tools/mix-key-backfill.ts --run --reanalyze # check all; valid results reused
```

Opening the debug panel never starts analysis. **Analyze library** inside the optional
comparison dashboard saves experimental results only. It is not the canonical update.

## Identity and migration

`Track.keyDetection` version 1 records original relative file path/SHA-256, algorithm,
libkeyfinder version, complete decode/profile configuration, result, date and provisional
status. A promoted result also records the experimental run id. The IPC generation is
4; old bass-only native handlers fail closed in the new controls until rebuilt/restarted.

The original is decoded to mono 44.1 kHz float32 with the bundled LGPL FFmpeg and handed
to the independent helper as a filename. The helper emits only JSON label/score, with
null score because this API has no calibrated confidence. It is not linked into Electron
or FFmpeg. The shared local-engine lease also covers canonical detection. Before saving,
the original hash is checked again and the manifest reread so current manual metadata
survives. New stems do not invalidate an original-song result.

Legacy `keyAnalysis` bass records remain as diagnostic evidence but are no longer the
library’s automatic key/filter source. They do not masquerade as current original-song
results. Explicit update accepts an experimental libkeyfinder result only if original
SHA/file, detector 2.2.8, input type, full config and successful single-key/Unknown shape
all match. Stale, corrupted, wrong-version or mismatched-profile evidence is not promoted.
No key record is rewritten merely to remove the former question-mark badge.

Enharmonic spellings normalize to a consistent key name; raw experimental labels remain
in details. Major, minor and Dorian are not interchangeable. Manual editing currently
offers major/minor and Unknown; unsupported mode text is rejected rather than coerced.

## Build, licensing and platform

`mix/tools/prepare.ts` calls `prepareKeyfinder` before the app build. It downloads
checksum-pinned official libkeyfinder and FFTW 3.3.11 source archives and builds a
standalone helper at `mix/bin/keyfinder`, with both libraries statically linked into
that command. Builders need clang, make and CMake; installed users need none of these,
Homebrew, the experiment venv or a runtime download. The app’s existing `bin/**` package
rule includes/signs the Mach-O plus `keyfinder-source/**`. It loads only system dylibs.
The helper build targets macOS 13+ arm64; the whole app’s existing platform/engine
requirements still apply. Intel/Windows/Linux packaging is not implemented here.

The root application remains MIT. The independent helper is GPL-3.0-or-later, and its
corresponding source archives, helper source, build recipe, licenses and reconstruction
instructions ship in `bin/keyfinder-source/`. This is the separate-command distribution
boundary, not permission to link libkeyfinder into MIT-only application binaries or to
omit GPL source obligations. FFmpeg remains the existing separately built LGPL decoder.
See [libkeyfinder’s license](https://github.com/mixxxdj/libkeyfinder),
[FFTW licensing](https://www.fftw.org/faq/section1.html#isfftwfree) and the bundled notices.
