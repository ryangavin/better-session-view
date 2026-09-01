#!/usr/bin/env python
"""Four stems, with the voice taken from the best model that exists for voices.

The Roformer checkpoints beat Demucs on vocals by around 2 dB SDR, but they are two-stem
models: voice and everything else. Demucs is still the way to get drums, bass and other.
So take the voice from one and the rest from the other, and put the difference between the
two vocal estimates back into `other`, so the four stems still add up to the mix — which
matters if you are going to fade them against each other in a DAW.

    uv run hybrid.py track.m4a
    uv run hybrid.py track.m4a --vocal-model bs-roformer-1296 --demucs htdemucs_6s

Writes separated/hybrid/<track>/.
"""

import argparse
import os
import subprocess
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("TQDM_DISABLE", "1")

import soundfile as sf  # noqa: E402
import torch  # noqa: E402
from demucs.api import Separator, save_audio  # noqa: E402

from uvr import MODELS, tidy  # noqa: E402

ROOT = Path(__file__).parent

# audio-separator reads through libsndfile, which doesn't know m4a, mp3 or ogg. Demucs
# reads them all, so decode once up front and hand both engines the same wav.
READABLE = {".wav", ".flac", ".aiff", ".aif"}


def decoded(track: Path, into: Path) -> Path:
    if track.suffix.lower() in READABLE:
        return track
    wav = into / "_input.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(track),
                    "-c:a", "pcm_s16le", str(wav)], check=True)
    return wav


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("track", type=Path)
    p.add_argument("--vocal-model", default="melband-kim", choices=list(MODELS))
    p.add_argument("--demucs", default="htdemucs_ft")
    p.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    args = p.parse_args()

    out = ROOT / "separated/hybrid" / args.track.stem
    out.mkdir(parents=True, exist_ok=True)

    from audio_separator.separator import Separator as UVRSeparator

    source = decoded(args.track, out)

    scratch = out / "_voice"
    scratch.mkdir(exist_ok=True)
    began = time.monotonic()
    uvr = UVRSeparator(output_dir=str(scratch), model_file_dir=str(ROOT / "models"),
                       output_format="WAV", log_level=40)
    uvr.load_model(model_filename=MODELS[args.vocal_model][0])
    uvr.separate(str(source))
    tidy(scratch)
    print(f"  {args.vocal_model} vocals in {time.monotonic() - began:.0f}s")

    began = time.monotonic()
    demucs = Separator(model=args.demucs, device=args.device, progress=False)
    _, stems = demucs.separate_audio_file(source)
    print(f"  {args.demucs} in {time.monotonic() - began:.0f}s")

    voice, sr = sf.read(scratch / "vocals.wav", dtype="float32", always_2d=True)
    voice = torch.tensor(voice.T)
    if sr != demucs.samplerate:
        raise SystemExit(f"sample rates differ: {sr} vs {demucs.samplerate}")

    n = min(voice.shape[-1], *(s.shape[-1] for s in stems.values()))
    stems = {k: v[..., :n] for k, v in stems.items()}
    voice = voice[..., :n]

    # Whatever demucs called voice and the Roformer didn't has to go somewhere, or the
    # stems stop summing to the mix.
    stems["other"] = stems["other"] + (stems["vocals"] - voice)
    stems["vocals"] = voice

    for name, wav in stems.items():
        save_audio(wav, out / f"{name}.wav", samplerate=sr,
                   clip="none", bits_per_sample=32, as_float=True)
    for f in scratch.glob("*"):
        f.unlink()
    scratch.rmdir()
    if source != args.track:
        source.unlink()
    print(f"\n{out}")


if __name__ == "__main__":
    main()
