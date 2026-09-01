# Bass transcription

`mix/python/transcribe.py`, `mix/electron/transcribeJob.ts`,
`mix/electron/transcribe.ts`, and `mix/src/tab.ts`.

The bass stem can become two useful, deliberately different artifacts:

- `bass.mid` is the pitched notes, at their measured times and velocities.
- `bass.tab.txt` places those notes on an explicitly named instrument. Muted or
  unpitched attacks are `x`; a pitched note outside that tuning's playable range is `?`.

Neither is written beside the source audio. They live under the portable library:

```
<library>/transcriptions/<track-id>/<separation-model>/
  bass.mid
  bass.tab.txt
  transcription.json
```

The separation model is part of the path because the input is that model's `bass.wav`.
Changing models is changing the audio being heard, not merely changing a setting.

## Why a monophonic pitch tracker

A separated bass line is close enough to monophonic that a polyphonic piano or guitar
transcriber solves a larger, less constrained problem and brings its errors with it.
Simple autocorrelation is cheap, but bass is exactly where a weak or missing fundamental
lets a harmonic win. CREPE is a convolutional pitch tracker over raw audio, and
`torchcrepe` runs it through the same pinned PyTorch and MPS environment Demucs already
uses. It adds no second ML runtime.

The full CREPE model runs at a 10 ms hop. Frames below the pinned periodicity threshold
remain unvoiced; the worker does not force every sound onto a chromatic note.

**Onsets and pitches answer different questions.** Pitch frames say what frequency is
present. The onset envelope says when a new pluck happened. `transcribe.py` ports the
rise detector in `src/warp.ts`, then keeps the strongest peak in each 80 ms neighbourhood
so one pluck's first few cycles do not become a run of tiny notes. Within each onset
window it uses only the contiguous supported signal; silence after a note cannot turn
the whole gap before the next pluck into one enormous mute.

The pitch of a voiced segment is a periodicity-weighted median. That is intentionally
less responsive than reading every frame as a new note: vibrato and the attack's pitch
settling are not twelve MIDI notes. A sustained slide, hammer-on or pull-off with no new
onset is therefore one current limitation — it remains one note at the segment median.

## Uncertainty stays visible

There are three outcomes for an onset:

| worker found | MIDI | tab |
|---|---|---|
| enough periodic frames for one pitch | a note | a fret |
| an attack, but not a defensible pitch | omitted | `x` |
| a pitch the supplied tuning cannot play | a note | `?` |

Dropping the second row would make a sparse result look clean by hiding what the model
did not know. Guessing it would be worse. MIDI cannot represent an instrument-independent
muted pluck usefully, so those events remain in `transcription.json` and tab rather than
being invented as notes.

**CREPE's true floor is C1, 32.70 Hz.** Its 360 pitch bins begin there. Passing a lower
`fmin` does not extend the model; measured here, it corrupts periodicity across the whole
file. An open five-string B0 is about 30.87 Hz, just below that floor, and can alias near
C1. A five-string tuning is valid input and higher notes lay out correctly, but its open
B is a known weak edge. The sidecar records the exact engine, model, range, hop and
threshold so a later tracker can invalidate the cache rather than silently changing it.

## Tuning is required, low to high

The bass lane starts with an empty tuning field. It accepts note names with octaves,
separated by spaces or commas:

```
E1 A1 D2 G2
B0 E1 A1 D2 G2
Db1 Gb1 B1 E2
```

There is no default. Standard four-string tuning is common, not universal, and a tab
that quietly assumes it is confidently wrong for a five-string, drop tuning, or a
detuned live instrument. Strings must ascend from low to high.

`src/tab.ts` enumerates every playable string/fret position up to fret 24 and uses a
dynamic program across the whole phrase. Large hand-position jumps cost most, needless
string changes cost a little, and very high frets carry a small steady cost. That makes
the path a musical phrase rather than a cheapest decision made independently per note.

## The grid is either trusted or absent

An automatically fitted tempo and downbeat let tab snap onsets to the nearest sixteenth
and print four-bar blocks. A tempo typed into the header without a measured phase does
not. In that case tab prints every event with its exact onset time.

This distinction matters because tidy tab a sixteenth late for an entire song looks more
authoritative than timestamped tab and is less true. The MIDI always keeps the original
measured times; grid choice only changes the text layout.

## One expensive inference, many cheap layouts

`transcription.json` holds every pitched and muted event and a cache key made from:

- the SHA-256 of the exact `bass.wav`;
- torchcrepe and full-model versions;
- pitch range, hop, and periodicity threshold.

Tuning and grid are deliberately not in that key. Once pitch inference exists, pressing
Transcribe again with another tuning or a newly fitted grid rewrites only
`bass.tab.txt`. MIDI and the detected notes are reused.

Fresh work goes into `<model>.writing` and is renamed only after MIDI, sidecar and tab
all exist. Cancellation or a failed worker cannot land a partial transcription in the
library. Separation and transcription share `electron/work.ts`'s single lease: both use
the same local torch/MPS engine, so neither can begin while the other owns it. A late
cancel names both track and kind and cannot kill the next job.

The renderer supplies a track id, tuning, and an optional grid. The main process reloads
the manifest and derives the bass path and separation model itself; the isolated page
never gets an arbitrary filesystem path through the context bridge.

## What was checked on real stems

The spike sampled three separated bass stems. The first passes exposed too many nearby
attack peaks and silence-spanning muted events; those failures produced the 80 ms peak
suppression and contiguous-signal rule above. On the corrected 333.63-second sample,
the full path ran on MPS in 36.86 seconds and wrote:

| | |
|---|---:|
| all onset events | 1,542 |
| pitched notes | 968 |
| explicit muted attacks | 574 |
| pitched density | 2.9 / second |
| pitch range | MIDI 24–32 |

The resulting MIDI's median pitched duration was 129.5 ms and median pitched-onset
spacing was 290.9 ms. Those figures are evidence that the earlier 40–60 ms fragmentation
is gone; they are not a claim that every note is correct. The same file then exercised
the Electron cache path: changing the grid rewrote tab from the cached event list in
114 ms without running CREPE again.

Unit tests cover event decoding, cache identity and reuse, tuning parsing, fret-path
choice, grid-aware and timestamped tab, the shared worker lease, nearby-onset suppression,
and silence after pitched and muted attacks. Model accuracy itself still needs listening
against each song; it is a transcription aid, not a score recovered from ground truth.
