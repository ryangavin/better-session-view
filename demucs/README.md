# Stem separation

**This is a research spike, not an engine.** It exists to answer one question — why an isolated
vocal pulses, and what to do about it — and the answer turned out to constrain how a real engine
should be built. Read this before writing any of that engine; the reference for running what's
already here is [`docs/workspace.md`](docs/workspace.md).

The folder is called `demucs/` for historical reasons. It runs two engines now, and the name
should change when something real is built out of it.

## What the investigation settled

Eight experiments across three source files and one session with the stems. Every number below
was measured here, on Apple silicon, and the working is in [`docs/workspace.md`](docs/workspace.md).

**Model choice is the only lever that matters, and it is worth a lot.** Scored against real
stems, MelBand RoFormer recovers a vocal at **12.1 dB SDR** against `htdemucs_ft`'s **8.2 dB**.
Nothing else moved a number that far.

**The RoFormer models are two-stem.** Voice and everything else — no drums, no bass. Four stems
means running two models and reconciling them, which is what `hybrid.py` does: RoFormer voice,
Demucs for the rest, and the difference between the two vocal estimates folded into `other` so
the stems still sum. **Any engine that wants four stems inherits this shape.**

**Inference settings are not a quality knob.** `shifts` and `overlap` at 13× the compute moved
the measurements by 0.02. They govern chunk seams and memory. Don't build a settings UI around
them; don't spend GPU on them.

**Source quality is a first-class input, and its damage is localised.** From lossless to 96 kbps,
MelBand's vocal SDR falls 12.1 → 9.7 dB and its 6–16 kHz gain slides −6.5 → −11.0 dB. Demucs
loses half as much and stays flat up top. An engine should record the source's provenance
alongside the stems, because the same model on the same song is a different result from a
different file.

**Stems must sum, and by default they don't.** Each stem is independently rescaled to avoid
clipping, so four default stems sum to within only −13.8 dB of the original. Writing float32
with clipping protection off takes that to −23.6 dB, which is the model's own error and nothing
else. **This is a correctness property, not a preference** — anything that fades stems against
each other is wrong without it.

**Artifacts hide in the stereo image.** Six mono measurements found nothing; the side channel
found a sixteenth-note-rate modulation the source doesn't have. Any quality metric that sums to
mono before measuring will report success on a stem that sounds wrong.

**Some of the pumping is in the record.** Against a known reference, Demucs adds essentially no
drum-synced ducking of its own and MelBand adds 3–5 dB. So a stem that pumps is not automatically
a bug, and a support answer of "that's in your source material" is sometimes correct.

## Direction

### First, decide what the engine is for

This is the open question and it is not mine to answer. The investigation says nothing about
whether stems are wanted for preparing a live set, for driving the visuals rig off something
other than the LOM, for a chart view, or as a standalone utility. **That decision changes the
architecture more than anything below** — a batch preparation tool and a real-time analysis
feed have almost nothing in common. Everything that follows holds either way.

### Then build these, in this order

1. **A job with a cache key.** `source → decode → separate → post-process → write`, keyed on
   the content hash of the source plus the model and its parameters. Separation is minutes of
   GPU per track and the inputs are immutable, so nothing should ever run twice. The cache key
   must include the source hash, not the path — the same song at two bitrates is two results.

2. **A model registry, pinned.** Each entry declares its checkpoint, the sources it emits, and
   its device. Checkpoints are ~3.3 GB together and download from Hugging Face on first use;
   an engine wants them resolved and verified up front, not mid-job. `uvr.py` has the shape of
   this already, as a dict from short name to checkpoint and claimed SDR.

3. **An output contract.** Stem names, sample rate, bit depth, and the sum-preservation
   guarantee above, plus a sidecar recording what produced them: model, version, source hash,
   source format, and the measured residual. Without the sidecar you cannot tell a bad stem
   from a bad source six months later, and that distinction is most of the support burden.

4. **A quality gate over a fixed corpus.** `truth.py` scores a separation against stems we own.
   Point it at a handful of songs, record the SDR per model, and fail the build when a change
   moves it. This is the same discipline as the rest of the repo: **pin the behaviour that was
   validated, so a regression is loud.** Two or three ground-truth songs are worth more than
   any amount of listening.

5. **Post-processing as declared steps, not defaults.** The width fix (`width.py`) halves the
   side-channel artifact for almost no cost, and it is still a judgement call, because it
   narrows the voice. Make it a step the caller asks for, recorded in the sidecar.

### Performance, as measured

`htdemucs_ft` runs a 4-minute track in ~62 s on MPS, MelBand in ~44 s; the hybrid is the sum of
both. A 10-minute track is ~4 minutes of wall clock. That is background-job territory, not
request/response — design for a queue with progress, and assume the first run of any model also
pays a download.

## What is still open

- **The drum-free claim.** The report from the chair is that the pulse survives in sections with
  no drums. The remix had only 25 s of those, too little to read. The 2008 mix has 100 s across
  four stretches and the stems are already rendered — this is the cheapest open question.
- **Ground truth in the right genre.** The one session we have is warped loops. A track with
  128 hats, a sidechained bass and a vocal printed both with and without its ducking would
  settle whether the remix vocal is ducked in the record, which is currently inference.
- **Ensembling.** Averaging several models' stems measurably helps and nobody has checked whether
  it survives a ground-truth score. Cheap to test now that `truth.py` exists.
- **Whether the width fix should be on by default.** Needs ears, not numbers.

## What's in here

| | |
|---|---|
| [`docs/workspace.md`](docs/workspace.md) | how to run all of it, and every measurement |
| `hybrid.py` | four stems, voice from a RoFormer — **the recipe an engine should start from** |
| `truth.py` | scores a separation against stems we own; the only honest metric here |
| `uvr.py` | the RoFormer catalogue, and the model registry in embryo |
| `stems.py` | Demucs through the Python API, with mixes built from the stems |
| `width.py` | the side-channel fix |
| `pulse.py`, `compare.py`, `tune.py` | proxy measurements, for when there is no reference |
| `bin/sep`, `bin/preview`, `bin/bench`, `bin/models` | CLI wrappers for auditioning |

## Traps

Each of these cost time here:

- **`audio-separator` imports `audioread` without declaring it.** Pinned in `pyproject.toml`.
- **libsndfile can't read m4a, mp3 or webm**, so `audio-separator` can't either. Demucs reads
  everything. Decode once up front and hand both engines the same wav.
- **Demucs resamples to 44.1 kHz** and writes there. A 48 kHz source comes back at 44.1, and a
  reference at 48 will not line up with it.
- **The `truth/` mapping is a judgement call.** A "full kit" loop with heavy sub is material a
  four-stem model reasonably splits between drums and bass, and scoring it as one or the other
  makes both look wrong. Only score stems whose mapping is unambiguous.
- **Individually mastered stems don't sum to the master.** Ours peaked at 2.2 before scaling.
  Sum the stems and separate that, rather than trusting a bounced mix to match.
- **`uv.lock` resolves for arm64 macOS only.** Deliberate — see `[tool.uv] environments`. Any
  other target needs the constraint lifted and the lock regenerated.
