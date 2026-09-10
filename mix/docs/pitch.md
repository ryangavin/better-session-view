# Bass pitch evidence

`python/pitch_map.py`, `python/pitch_evaluate.py`, `electron/pitchMap.ts`,
`src/pitchMap.ts`, and `src/debug/pitch/`.

The **Bass pitch** experiment in the existing debug workspace compares a separated
bass recording with continuous model evidence. It is a verification workbench, not a
claim that transcription is now accurate. The existing tab/MIDI note segmentation
remains in place; its loss of slides and legato motion is visible against the frame map.

## One inference, separate evidence and interpretation

Every new transcription writes `pitch-map.json` beside `transcription.json`. The model's
unsnapped Hz estimates and raw periodicity are retained, alongside median-filtered
periodicity and 64 ms window RMS. The frame clock follows torchcrepe's actual integer
hop after resampling to 16 kHz; padded frames at or beyond the audio end are excluded.
Frequency is not rounded to MIDI or constrained to EADG. Note names and cents are views
of Hz against A440, not an estimate of the recording's tuning.

Each frame is `voiced`, `unvoiced`, `silent`, or `invalid`. The research voicing policy
uses the existing 0.21 periodicity floor plus a −60 dBFS silence floor; neither threshold
is a calibrated probability or a user-approved accuracy target. Rejected estimates are
still inspectable. The map records source SHA-256/bytes, actual engine version/model,
range, hop, decoder, batch size and seed. Seed 0 makes decoder dithering reproducible
within the runtime; cross-device bit identity is not promised.

The sidecar holds only a map reference, SHA-256 and frame count. The lab requests the
frame arrays on demand through `transcribe.pitchMap(trackId)`; main resolves the file
from the current manifest and verifies source hash, map checksum, shape and clock.
Library rows never load pitch arrays. Layout changes keep the map byte-for-byte and
retain the existing separate global octave correction. No per-frame manual edits exist
yet, and imported reference annotations never overwrite model output.

Legacy note-only caches remain useful to tab/MIDI. **Analyze bass** explicitly requests
continuous evidence and upgrades a legacy cache once; a complete valid map is then
reused. A failed/cancelled worker cannot publish its partial map. Corrupt or stale maps
produce a missing-evidence state rather than plausible curves. The upgrade preserves
an existing octave correction. New evidence does not require another separation.

## Inspection and audition

Choose a separated track, then **Analyze bass** if its map is absent. The shared scope
aligns the mono waveform actually analyzed, Hz-derived pitch, derived notes,
periodicity and key hypotheses on source time. Green marks voiced frames, pink rejected
estimates, amber derived notes (including the saved octave correction), and white an
imported reference. Clicking pitch shows exact time, Hz, nearest note/cents, raw and
smoothed periodicity, and RMS. Pitch range is independent of instrument tuning.

Scroll pans; Shift-scroll zooms. Shift-drag the ruler selects a passage. **Frame selection**
zooms it; numeric **From/To** fields also set the passage. **Play comparison** plays the
selection, or visible range, with source audio and derived-note triangle synthesis on
one Web Audio clock (`player.ts`). Choose separated bass or the original full song;
each has an independent level and mute relative to MIDI. **Loop** repeats the passage.
Clicking pitch seeks during playback. Notes sustaining over a seek or loop boundary are
clipped and retriggered. Stop, changing selection/source/track, and leaving the lab cancel
scheduled audio and notes. Leaving also cancels a transcription the lab started.
The synth renders the existing derived segments with saved transpose, not continuous
pitch bends or independent ground truth. Original audio is decoded only when selected.

**Create mix[flow] Bass port** creates an opt-in macOS CoreMIDI source directly visible
in Live's MIDI inputs, without IAC or Web MIDI permission. In Live enable **Track** for
that input, choose it on a MIDI instrument track, and set Monitor **In** (or Auto and arm).
Close the port to remove it. `native/bass-midi.cpp` is compiled at build time by
`tools/bass-midi.ts` and shipped/signed with the app. Its note-only queue uses a monotonic
clock; epoch deadlines crossing IPC are converted to relative delays. IPC and device
latency can add timing error, so the offset remains available. It releases active notes
and deletes the source on close/EOF or five seconds without a heartbeat. One lab owns
the source at a time; the service accepts no arbitrary MIDI or hardware destination.

External MIDI defaults to **Off**. **Find MIDI outputs** explicitly requests Web MIDI
without SysEx; selecting an output and channel enables notes during Play. Future events stay in a cancellable browser queue; Chromium outputs need not expose
an OS queue-clear method. Missing API, denied access and
disconnection have visible states. Output/channel/offset changes stop playback; mute,
stop, seek, loop restart and unmount clear pending messages and release this player's
notes. External notes release 2 ms early to keep same-pitch retriggers ordered across
clock rounding. Browser timer/IPC jitter means this is not sample-accurate hardware MIDI. No MIDI clock, transport, program changes or all-channel resets are sent. Use a
dedicated synth channel because MIDI 1.0 cannot identify independent same-pitch voices.
The MIDI level scales new external note velocities; it does not alter already sounding
hardware voices. Triangle synthesis can be switched off independently. A ±100 ms offset
adjusts external scheduling relative to the audio output clock for hardware latency.
Mock-port tests cover message pairing/cancellation; physical MIDI output has not been
verified. The [Web MIDI specification](https://www.w3.org/TR/webmidi/) defines timestamped
send and queue clearing.

A future hybrid arrangement could replace selected stem passages with synthesized
fundamentals. This lab provides comparison and evidence; it does not yet edit, replace,
or export such arrangements.

**Import reference JSON** expects:

```json
{
  "sourceHash": "SHA-256 of the exact bass WAV",
  "kind": "human",
  "provenance": "who annotated what, how, and any limitations",
  "frames": [{"time": 0.00, "hz": 0}, {"time": 0.01, "hz": null}]
}
```

Kinds are `human`, `synthetic`, and `resynthesized`. Zero Hz means explicitly unvoiced;
null means unannotated and is excluded. Times must increase. Wrong-source references
are rejected. Dense time/Hz references can express bends and slides; note labels alone
cannot independently establish their continuous intonation. Visible-range scores report
within-50-cent frames, voicing recall, false voicing, octave errors, and median absolute
cents on jointly voiced frames. These are different denominators, shown as counts.
**Next disagreement** selects a short passage around the next error within the visible
range. A 50-cent scoring tolerance is a diagnostic convention, not release acceptance.

## Bass-first key regions

`keyRegions` consumes voiced frame Hz directly, not tab frets or the most frequent note.
It measures duration in each pitch class over 4/8/16/32-second windows, then compares
coverage of all 12 major and 12 natural-minor scales. The tuning-cents control adjusts
only this interpretation; raw frequency remains unchanged. Frames more than 35 cents
from a semitone after that adjustment do not vote, preserving slides without treating
every intermediate frequency as a note.

Research defaults require 50% usable time coverage, four pitch classes exceeding 3%
of voiced duration each, and 90% scale coverage. Candidates within 2.5 percentage points
of the best remain tied; more than four candidates becomes Unknown. Equal neighbouring
windows merge. These are explicit heuristic defaults, not validated musical decisions.
Relative major/minor scales have identical membership and deliberately remain ambiguous.
Pedals, sparse phrases and chromatic material can remain Unknown. Modal and harmonic/
melodic-minor interpretations are not yet modeled. Boundaries have window-level precision;
different candidate sets are not automatically proof of modulation. Click a candidate
region to select it for listening. The lab itself does not write these suggestions into library key tags. The explicit
library analysis below publishes a separate, source-bound estimate.

## Reproducible evidence

Run from the Python directory (the repository's `coverage/` output directory can otherwise
shadow the optional Python coverage package when Numba imports it):

```sh
cd mix/python
./.venv/bin/python -m unittest test_transcribe test_pitch_map
./.venv/bin/python pitch_evaluate.py --suite --out /tmp/bass-pitch
./.venv/bin/python pitch_evaluate.py --input /path/bass.wav --reference /path/reference.json --out /tmp/bass-real
```

The evaluator retains generated WAVs, source-hashed references, maps, worker logs, and
`report.json`. Existing outputs are reused only for identical source bytes; use a new
output folder to compare a changed algorithm. It reports pitch and voicing separately,
confidence-bin counts, and 100 ms boundary zones for step and onset fixtures. Its
generated oscillator suite is deterministic and needs no remote files or model downloads
once the existing environment is provisioned. It is not a replacement for real bass.

[pitch-baseline.json](pitch-baseline.json) records the initial CPU baseline on 2026-09-09
(Python 3.13.3, torch 2.13.0, torchcrepe 0.0.24 full). Four-second cases took 8.5–15.7 s
inside the worker, excluding interpreter/import startup. E1, missing fundamental,
detuning, slide, legato, vibrato and distortion cases scored 315–319/320 voiced frames
within 50 cents. Median error ranged 7.0–18.0 cents. There were no octave errors in those
cases; four had one false-voiced boundary frame. Noise and silence had zero false-voiced
frames. **Low B0 scored 0/320 accepted voiced frames**, exposing the model floor. These
results do not validate real instruments, separation artifacts, polyphonic bleed or keys.

## Independent real evidence still needed

The [IDMT bass dataset](https://www.idmt.fraunhofer.de/en/publications/datasets/bass.html)
contains real bass playing techniques and pitches; its evaluation license is CC BY-NC-ND
4.0. [IDMT Bass Lines](https://www.idmt.fraunhofer.de/en/publications/datasets/bass_lines.html)
offers real phrases. Dataset downloads from Zenodo timed out in this session, so no real
annotation scores are reported. No dataset audio is redistributed here.
[MedleyDB's pitch subset](https://zenodo.org/records/2620624) has manually annotated solo
stems but restricted audio access. [MDB-bass-synth](https://synthdatasets.weebly.com/mdb-bass-synth.html)
offers continuous reference pitch for resynthesized bass, which must be labelled as such.

The next accuracy milestone needs independent real bass annotations, both isolated and
after separation, covering low tuning, legato, slides, distortion, synth bass and bleed.
Pitch/cents, octave errors, voicing, and onset/transition timing must stay separate.
Until that evidence exists, the lab is useful for finding and documenting errors, not
for calling either the frame map or its key hypotheses verified.

## Real pipeline smoke check

Cached maps were produced through the app for SOFI Needs a Ladder (33,363 frames,
333.63 s, 38.05 s MPS pitch work) and Sandstorm (23,234 frames, 232.34 s, 25.90 s).
These verify inference, persistence and interactive loading, not accuracy. Sandstorm's
default key consumer remained Unknown, with 31% usable pitch coverage. No independent
annotations were available for either recording.

The desktop and in-app browser auditions were exercised on a selected passage with
separated bass and original audio. CoreMIDI enumeration confirmed `mix[flow] Bass`; an
independent native input listener captured channel-1 note-on/off pairs from a four-second
Sandstorm passage. Live instrument routing and physical devices remain unverified.

## Persisted library keys

The library's **Analyze key / Reanalyze key** action uses the selected song's bass stem.
It reuses a valid continuous map, or explicitly runs the existing bass transcription
worker to obtain one. Ordinary browsing loads only the manifest: no inference, audio
decoding, or frame-array reads. The shared work lease prevents parallel inference.

`src/key.ts` evaluates stable voiced pitch duration against all major/natural-minor
scales. Whole-song analysis tolerates rests (10% coverage) but requires ten seconds of
usable pitch, four classes each exceeding 3%, and 90% scale support. Scales within 2.5
percentage points remain alternatives. A compatible tonic carrying at least 20% of
usable duration and twice the next compatible tonic's duration can become a provisional
primary candidate; otherwise up to four choices remain ambiguous. More choices or
insufficient evidence is Unknown. This bass-root heuristic is useful for DJ inspection,
not independently calibrated. Relative modes can remain ambiguous; a strong bass root
can favor one without proving its harmony. Confidence is a qualitative evidence tier,
never a probability. No indiscriminate quantization or full-mix inference is used.

Sixteen-second compatibility regions retain the stricter lab policy. Different supported
region labels yield **Multiple / possible changes**, never an unqualified global key.
Unknown regions remain in the details even when the global histogram supports a guess.
Alternative scale matches, region times and coverage are available in **Key evidence and
regions**; row titles carry the same summary. Single guesses carry an estimate marker.

`electron/keyAnalysis.ts` verifies bass bytes and map checksum, computes once, then
re-reads the manifest before publishing. Optional `Track.keyAnalysis` stores version,
algorithm, date, bass hash, map hash, separation identity, tonic/mode candidates,
alternatives, confidence, coverage and regions. Existing `Track.key` is treated as a
manual override and never overwritten. New separation invalidates automatic evidence;
manual metadata survives. Version/model/path mismatches read as Unknown. Out-of-band
changes to the same bass path are checked on explicit reanalysis, not every browse.

Artist → Album → Key lists filter together, then full-text search narrows songs. A song
with paired candidates is available under either candidate and **Ambiguous**; possible
changes are available under their regional candidates and **Multiple / possible changes**.
Unanalyzed, stale and insufficient results remain browseable under **Unknown**. Reset
filters clears all three lists. Manual keys use their existing literal metadata labels.
