# Whole-recording key experiments

Debug → Key detection → Compare detectors · experiments contains an explicit comparison of libkeyfinder and Essentia
on each track's **original file**, decoded once to mono 44.1 kHz float PCM. Stems are
not required. The optional bass baseline only reads an existing checksum-valid pitch
map; it never launches bass inference or updates the canonical key. The default library detector is now [libkeyfinder](keys.md); **Update library keys**
saves canonical results. The comparison controls continue to save only experiments.

Opening the panel reads availability and the library’s saved results/references only.
The dashboard shows analyzed tracks, usable reference coverage and per-detector match
counts over scored reference/result pairs, separate from reference coverage. With no
scored results it says Not evaluated rather than displaying zero accuracy. The song matrix shows large keys and text/symbol
badges for Match, Different, Uncertain, Unavailable and Not run. No result is invented
for an empty cell. Select a song in the matrix to inspect it without loading audio.

**Analyze library** is the primary action; **Analyze selected song** scopes it to one
recording. Progress and Stop after current appear only while running. Source links,
reference editing and full result evidence live under Sources & selected-song details.
Settings & diagnostics holds detector choices, refresh/download, custom batch and
logs. Canonical libkeyfinder controls live under Advanced · library key detection, with
Update library keys above the optional comparison.
All explicit batches run sequentially.
Stop, tab change or unmount stops scheduling after the current recording. Per-track
failures are logged and the remaining tracks continue. A changed library or occupied
engine stops the queue. `src/keyQueue.ts` is shared with canonical backfill, and
`electron/work.ts` provides the same exclusive worker slot. App shutdown cancels its
owned child; another client's job is never canceled by stopping this renderer queue.

The renderer requires version 1 of the experiment IPC. A missing or stale native
backend disables execution and asks for a safe rebuild/restart; HMR alone does not
install main/preload handlers. The standalone Node backend is also usable from tools
without Electron. Nothing runs automatically at import time as part of this experiment.

## Local tools and reproducibility

From the checkout, explicitly run:

```sh
node tools/mix-key-experiments-setup.ts
```

Everything installed is isolated in ignored `mix/.key-experiments/`; nothing enters
the shipping Python engine or package dependencies. libkeyfinder needs CMake, a C++
compiler, pkg-config and FFTW3. The adapter pins libkeyfinder 2.2.8 at
`c78e8372e0188c0a11b7b55a653ea0cbbbf70fa5`. Essentia pins 2.1b6.dev1438, NumPy 2.4.3,
six 1.17.0 and PyYAML 6.0.3 in a Python 3.14 venv. Setup requires uv and a compatible
binary wheel (the tested macOS wheel requires macOS 15+); there is no implicit source
build fallback. Setup records the Python freeze and reports each backend failure.
It does not restart the app or analyze the library.

[libkeyfinder](https://github.com/mixxxdj/libkeyfinder) is GPL-3.0-or-later and uses
FFTW. [Essentia licensing](https://essentia.upf.edu/licensing_information.html) describes
AGPL and commercial options. These dependencies are local opt-in research tools,
Essentia remains an unbundled experiment. The separately packaged default libkeyfinder
helper and its source distribution are documented in [keys.md](keys.md).

libkeyfinder uses its default `keyOfAudio` profile and exposes no confidence score.
Essentia uses [KeyExtractor](https://essentia.upf.edu/reference/std_KeyExtractor.html)
with bgate, frameSize/hopSize 4096 and hpcpSize 12; its strength is profile correlation,
not a probability. Bass support is scale membership and its coverage is separate.
Scores are never averaged or compared numerically across backends. Runtime includes
process startup and backend execution but excludes shared decode and version probes.
Each saved result records version, input, configuration, status, labels and score
semantics. Unknown, ambiguous, unavailable and error remain distinct outcomes.

## Persistence and references

Runs live at `LIBRARY/experiments/keys/<hex-track-id>/<run-id>.json`. Each is bound to
SHA-256 of the original audio; a file changed during inference rejects the run. No
manifest, manual key, saved key analysis, stems or transcription is rewritten.
`reference.json` beside runs stores separately verified/published keys and provenance.
Saving a person-verified reference is an explicit action. Download evidence exports
loaded runs and references; Refresh detectors & results rereads their sidecars.

`experiments/key/references-2026-09-11.json` is the inspectable source inventory for
all 24 current recordings. Only title, artist and version metadata was sent to web
search, with user authorization; no audio was uploaded. It preserves raw source values,
direct URLs and recording/version notes. No detector result or filename was used as
independent truth. Ten entries have published keys, nine have unresolved conflicts,
three need an exact-version match, and two have no published key. Published metadata
is fallible and is not a listening-verified gold standard.

```sh
node tools/mix-key-references.ts '/path/to/library' mix/experiments/key/references-2026-09-11.json
# Explicitly persist the previewed metadata; never overwrites a person-verified reference:
node tools/mix-key-references.ts '/path/to/library' mix/experiments/key/references-2026-09-11.json --write
```

Accuracy uses the latest run per track/backend, exact pitch class and mode, and accepts
enharmonic spelling and Camelot equivalence. Disputed, missing, version-unverified,
stale-hash and invalid references are unscored. Unknown/ambiguous predictions abstain
and stay in the denominator; unavailable/errors do not. Multiple accepted reference
keys require explicit documented ambiguity; conflicting publications are never silently
converted into multiple accepted answers. Detector agreement is not accuracy.

## Validation and limits

On 2026-09-11, native libkeyfinder 2.2.8 and Essentia 2.1b6.dev1438 both returned C major
for a 12-second synthetic C/F/G/C chord progression and Unknown for 12 seconds of
silence. Bass correctly reported unavailable without stems. Full output is in
[`../experiments/key/smoke-results.json`](../experiments/key/smoke-results.json).
libkeyfinder took about 28 ms per fixture; Essentia about 45 seconds, including process
startup. These are smoke checks, not real-library accuracy or full-song performance.
The user subsequently ran all 24 recordings: all paired results saved in about 39.4 s.
Median recorded backend times were 0.423 s for libkeyfinder (0.102–1.213 s) and
0.788 s for Essentia (0.732–0.972 s), including process startup but excluding shared
decode/version probes/hash/persistence. The earlier 45 s cold smoke invocation was
not representative; its cause was not established. Normalized detector agreement was
16/24, or 16/23 after excluding the spoken non-song. Published-reference agreement was
9/10 for libkeyfinder and 10/10 for Essentia; those ten references remain fallible.
The user chose libkeyfinder as the practical default; this is not proof it is more accurate. Native setup completed with zero failures.

Automated tests cover original-file selection, decode reuse, separate persistence,
manual-key preservation, lease conflict/release, unavailable tools, reference import,
normalization/scoring, explicit UI execution and stop-after-current behavior. The connected in-app harness was visually checked at its existing viewport: 24 songs,
10 usable references, both detectors ready, no runs, visible primary/selected actions,
and working row selection. No resize, native restart, playback or analysis was needed.
The comparison UI spec uses `.test.ts`, matching the project test discovery pattern.
