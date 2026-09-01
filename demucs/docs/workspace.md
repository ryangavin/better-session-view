# The workspace

How to run what's in here, and everything the investigation measured. The findings and where
this is going are in [`../README.md`](../README.md); this file is the reference.

A scratch workspace for stem separation. It started on [Demucs v4](https://github.com/adefossez/demucs)
— Hybrid Transformer separation, four stems — and grew a second engine, because Demucs is 2022
architecture and vocals have moved on since. Nothing here is part of open[flow]; it's a place to
try the models and listen to what they give back.

Pinned to demucs **4.1.0** (released 11/07/2026 — checkpoints now come from Hugging Face and
the inference install no longer drags in the training stack). `uv sync` builds `.venv`;
`uv.lock` resolves for this machine only, Apple silicon, so torch arrives with a working
Metal backend.

## Running it

```bash
bin/sep audio/track.wav              # 4 stems → separated/htdemucs/track/
bin/sep -n htdemucs_6s audio/*.wav   # guitar and piano as well
bin/sep --two-stems=vocals track.wav # vocals + everything else, karaoke style
bin/sep --mp3 --mp3-bitrate 320 t.wav
uv run demucs --help                 # the real CLI; bin/sep just sets defaults
```

`bin/sep` runs on the GPU with `htdemucs` and always writes under this folder's `separated/`,
so it works from any directory — input paths are relative to wherever you are. Every argument is
passed straight through, and a repeated flag wins, so `bin/sep -d cpu -n mdx_extra track.wav`
overrides both defaults.

Drop input in `audio/` (ignored by git, apart from the 20-second `test.mp3` from upstream,
which is the quickest way to prove the rig still works). Anything ffmpeg can open works;
wav, flac, mp3, ogg and aac are read natively by sphn.

## The models

`bin/bench audio/test.mp3` times them all. On this machine, 20 seconds of audio, cold
process each time:

| model | sources | 20s clip | |
|---|---|---|---|
| `htdemucs` | 4 | 4.1s (4.9x) | the default, one transformer pass |
| `htdemucs_ft` | 4 | 31.1s (0.6x) | four fine-tuned checkpoints, one per source — the best of these |
| `htdemucs_6s` | 6 | 8.0s (2.5x) | adds guitar and piano; guitar is decent, piano bleeds badly |
| `hdemucs_mmi` | 4 | 17.0s (1.2x) | Demucs v3, retrained — no transformer |
| `mdx`, `mdx_extra` | 4 | not benched | the MDX-challenge models, v3 era |
| `mdx_q`, `mdx_extra_q` | 4 | not benched | quantised, smaller download — needs `uv sync --extra quantized` |

`bin/models` pre-downloads checkpoints so a run doesn't stall on the network. They cache in
`~/.cache/huggingface`, not in here.

## Auditioning them all

`bin/preview` puts one track through every model and writes 320k mp3s under
`separated/preview/<track>/<model>/`, one folder per model to flick between:

```bash
bin/preview -s 65 -d 30 track.m4a    # 30 seconds from 1:05 — the way to do this
bin/preview track.m4a                # full length, and mdx_q alone will take ~12 minutes
bin/preview track.m4a htdemucs mdx_extra
```

Pick the excerpt where there's the most to get wrong — vocal over a full arrangement, not
an intro. Every model sees the same seconds, cut once up front.

`compare.py` then reads that folder back and says how far each model's stem sits from a
reference model's, as waveform correlation — they're separating identical audio, so a low
number means a model is putting that material somewhere else:

```bash
uv run compare.py "separated/preview/<track>" --stem vocals
uv run compare.py "separated/preview/<track>" --stem other --reference htdemucs
```

It narrows down where to listen. It doesn't tell you which is better — nothing here has a
ground truth to score against.

## Why a solo'd stem pulses

A vocal pulled out of a four-to-the-floor mix throbs on the beat, and it stops throbbing the
moment you put the other stems back. Two separate failures cause it, and `pulse.py` measures
both — in the bands where they happen, because they don't happen in the same one:

- **duck** — the voice losing its own energy wherever another source is loud. Measured while
  the vocal is sounding, as correlation between its level and the masker's. It lands on
  sibilance and air, 3 kHz up.
- **bleed** — the other source's rhythm arriving inside the vocal stem. Measured in the gaps,
  where nothing should be. Hats and claps.

Both are beat-locked, and both disappear on summing, because the stems add back to the mix:
energy taken out of one is sitting in another.

```bash
uv run pulse.py "separated/htdemucs_ft/<track>"
uv run pulse.py "separated/preview/<track>/mdx_extra" --masker other
```

`tune.py` runs the settings that might plausibly move those numbers and prints what each one
did, so this is a measurement rather than a memory of the last playback:

```bash
uv run tune.py track.m4a -s 15 -d 60
```

On one EDM track, a 60-second excerpt, vocals against drums — **inference settings do not
move it**, and model choice trades one failure against the other:

| config | wall | bleed | duck |
|---|---|---|---|
| `htdemucs` | 5s | +0.41 | −0.36 |
| `htdemucs_ft` | 18s | **+0.04** | −0.46 |
| `htdemucs_ft`, `overlap=0.75` | 47s | +0.22 | −0.48 |
| `htdemucs_ft`, `shifts=5` | 77s | +0.30 | −0.46 |
| `htdemucs_ft`, both | 223s | +0.33 | −0.47 |
| `htdemucs_6s` | 5s | +0.15 | −0.51 |
| `hdemucs_mmi` | 5s | +0.56 | −0.58 |
| `mdx_extra` | 12s | +0.55 | **−0.34** |
| ensemble of four | 40s | +0.31 | −0.38 |

Twelve times the compute moved duck by 0.02. `shifts` and `overlap` are about chunk seams and
memory, not about how the model splits energy it finds ambiguous — that decision is in the
weights. What does move it is the model, and the fine-tuned one is the cleanest in the gaps
while ducking the hardest. Averaging several models' stems gets some of both back.

### Where it actually was: the stereo image

Every metric above sums to mono, and the artifact that started this was not in mono. In the
**side** channel (L−R) of the 3–16 kHz band, all three separators put a sixteenth-note-rate
peak on the voice that the original mix does not have — modulation at 8.4 Hz on a 126 bpm
track, as a multiple of the median:

| signal | side-channel modulation at 16ths |
|---|---|
| original mix | 1.3x |
| vocals, `htdemucs` | 5.6x |
| vocals, `htdemucs_ft` | 3.0x |
| vocals, MelBand RoFormer | 6.3x |

The side channel is the difference of two large, nearly equal estimates, so a small error in
each shows up there many times over. The mix has no such peak, which makes this the model's,
not the record's — and it is why the artifact vanishes on summing, and why every mono
measurement in this file came back empty.

How much of this you get depends on the file you feed it. Running the same music as FLAC and as
its own 128 kbps AAC transcode — identical mix, only the codec differing — the Roformer's
artifact roughly doubles on the lossy copy while Demucs barely moves:

| | beat | 8th | 16th |
|---|---|---|---|
| source itself, FLAC → 128k | 1.0 → 2.1 | 4.3 → 4.3 | 2.1 → 2.1 |
| vocals `htdemucs_ft`, FLAC → 128k | 8.1 → 6.0 | 9.5 → 5.3 | 0.9 → 1.2 |
| vocals MelBand, FLAC → 128k | 6.3 → 7.6 | 4.7 → 9.6 | **1.8 → 4.2** |

The newer model is the more delicate one: it resolves detail a 128 kbps codec has already
thrown away, and invents rhythm in the stereo image where that detail should have been. On
lossless sources it is the better model by every measure here. On YouTube rips it is the one
with more to lose, and Demucs is the steadier choice.

`width.py` narrows the voice above a crossover and hands the removed side content to `other`,
so the stems still sum. On this track it took that peak from 6.3x to 2.7x, and what came off
the voice was 28 dB below its centre:

```bash
uv run width.py "separated/hybrid/<track>" --above 3000
```

### On sidechaining, and how to check

A second thing this material does, unrelated to the above: `duck` does not distinguish a model
taking energy away from a producer having taken it away.
Dance records are sidechained: the mix itself pumps, and a *correct* stem pumps with it. Averaging
each stem's level around every kick tells them apart, because a compressor has a shape — a sharp
drop and a slow recovery — and a separation artifact doesn't. On the track this was written
against, relative to the level just before the kick:

| stem | 0 ms | 50 ms | 100 ms | 200 ms |
|---|---|---|---|---|
| bass | −17.1 | −20.8 | −4.1 | +7.5 |
| other | −2.7 | −5.1 | −0.5 | +5.8 |
| vocals, `htdemucs_ft` | −0.9 | −0.3 | −1.4 | +1.9 |
| vocals, MelBand RoFormer | −0.1 | +6.3 | +1.3 | +5.4 |

The bass is ducked 20 dB on every kick and recovers over 150 ms. That is the record, not the
model — and it is why a solo'd bass stem pumps no matter what you separate it with. The voice
is barely sidechained. This explains a pumping *bass* stem; it does not explain the vocal,
which is at a sixteenth-note rate and carries on through sections with no drums at all.

## Past Demucs: the UVR catalogue

`uv sync --extra roformer` installs [audio-separator](https://pypi.org/project/audio-separator/),
which is a front end to the checkpoints the source-separation community actually uses —
Band-Split and Mel-Band RoFormer, MDX23C, the UVR and MDX-Net models. It knows about 77 vocal
checkpoints and lists the SDR of each. These are **two-stem** models: voice, and everything
else. For drums and bass you still want Demucs.

```bash
uv run uvr.py --catalogue                     # everything on offer
uv run uvr.py track.m4a -s 15 -d 60           # the top four, measured like the rest
uv run uvr.py track.m4a --models melband-kim
```

Vocal SDR as the catalogue reports it, so directly comparable:

| model | vocal SDR |
|---|---|
| MelBand RoFormer (Kim) | 12.6 |
| MelBand RoFormer big beta4 | 12.5 |
| BS-RoFormer 1296 | 12.1 |
| **`htdemucs_ft`** | **10.8** |
| MDX23C InstVoc HQ | 10.6 |

Checkpoints download to `models/` and run a few hundred MB each.

`hybrid.py` is the practical combination: the voice from a RoFormer, drums, bass and other from
Demucs, with the difference between the two vocal estimates folded back into `other` so the four
stems still sum to the mix.

```bash
uv run hybrid.py track.m4a
uv run hybrid.py track.m4a --vocal-model bs-roformer-1296 --demucs htdemucs_6s
```

## Flags worth knowing

- `--shifts N` — average N predictions at random time offsets. N times slower, worth up to
  ~0.2 dB SDR. Cheap enough on the GPU for a track you care about.
- `--overlap` — window overlap, default `0.25`. Down to `0.1` for speed.
- `--segment N` — seconds per chunk, and the memory knob. The transformer models cap at 7.8.
- `--float32` / `--int24` — output depth; the default is int16.
- `--clip-mode` — **this one bites if you sum the stems back up in a DAW.** By default each
  stem is independently rescaled to avoid clipping, so they no longer add back to the mix: on
  a loud master the four default stems sum to within only −13.8 dB of the original. Writing
  `--clip-mode none --float32` takes that to −23.6 dB, which is the model's own error and
  nothing else. `tune.py` and `stems.py --float32` already write it that way.

## From Python

`stems.py` goes through `demucs.api` instead of the CLI, which keeps the stems as tensors long
enough to build mixes out of them — an instrumental, a drums+bass rhythm bed, and the residual
(input minus every stem, i.e. what the model couldn't place; it should be near silent).

```bash
uv run stems.py audio/test.mp3
uv run stems.py audio/test.mp3 --model htdemucs_6s --shifts 2 --float32
```

Output goes to `separated/api/<track>/`, with each file's RMS printed so you can see at a
glance which sources the model actually found.

## Hacking on the model itself

The pin in `pyproject.toml` is a release from PyPI. To edit the architecture or the inference
code, clone upstream and point at the checkout — there's a commented `[tool.uv.sources]` block
in `pyproject.toml` for both a git dependency and a local editable one:

```bash
git clone https://github.com/adefossez/demucs upstream   # ignored by git
# uncomment the editable source in pyproject.toml, then
uv sync
```

Training is a different install (`uv add "demucs[train]"`, plus a MUSDB dataset) and a
different machine — see [upstream's training docs](https://github.com/adefossez/demucs/blob/main/docs/training.md).

## Scoring against stems you actually have

Everything above compares separations to each other, because no reference exists. `truth.py`
is for when one does — a song whose stems you own, summed here rather than bounced from the
DAW so the mixture is exactly the sum of the references:

```bash
uv run hybrid.py "truth/<song>/mixture.wav"
uv run truth.py --reference "truth/<song>" --estimate "separated/hybrid/mixture" --trigger drums
```

It reports a real SDR per stem, the SDR of the side channel on its own, and the gain the model
applied to each band where the true stem is sounding — the honest version of `duck`, a gain
against a known reference rather than a correlation.

`--trigger` is the one that settles an argument. It averages that gain around every onset of
the named stem, and because the reference carries the record's own compression, a sidechain
printed into the stem divides out. A flat line means the model left the voice alone and the
pumping was always in the record. A dip is the separator's, and the number is its depth.

## Notes on source material

Separation quality follows the input, and a YouTube rip is a poor input. The track first tried
here is 129 kbps AAC: a hard brickwall at 15.8 kHz, and 25,244 samples pinned at full scale
from the master's own clipping. The band where the artifacts live — 8 kHz up — is exactly the
band that bitrate spends least on. Before reaching for flags, get a lossless copy.

## Notes

- MPS works. `PYTORCH_ENABLE_MPS_FALLBACK=1` is set by the scripts so any op Metal lacks
  drops to the CPU rather than raising. `-d cpu` is only about twice as slow here — 10.2s for the same clip against 4.1s on
  the GPU — so it's a fine fallback.
- `separated/`, `audio/`, `models/`, `.venv/` and `upstream/` are ignored; only the scripts are
  tracked. Stems are big: a 4-minute track is ~175 MB of wav per model, ~6 MB as preview mp3,
  and the RoFormer checkpoints are ~3.4 GB together.
