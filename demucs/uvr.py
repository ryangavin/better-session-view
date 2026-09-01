#!/usr/bin/env python
"""Run the UVR catalogue's vocal models over a track, and measure them like the rest.

Demucs v4 is 2022 architecture. What came after it — Band-Split and Mel-Band RoFormer,
MDX23C — is reachable through `audio-separator`, which keeps a catalogue of community
checkpoints with their vocal SDR. These are two-stem models: vocals and instrumental,
nothing finer. Install them with `uv sync --extra roformer`.

    uv run uvr.py track.m4a -s 15 -d 60
    uv run uvr.py track.m4a --models melband-kim bs-roformer-1296
    uv run uvr.py --catalogue          # everything on offer, ranked by vocal SDR

Checkpoints land in models/ and are a few hundred MB each.
"""

import argparse
import os
import subprocess
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("TQDM_DISABLE", "1")

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

from pulse import activity, measure  # noqa: E402

# short name -> checkpoint, with the vocal SDR the catalogue claims for it.
MODELS = {
    "melband-kim":        ("vocals_mel_band_roformer.ckpt", 12.6),
    "melband-big-beta4":  ("melband_roformer_big_beta4.ckpt", 12.5),
    "melband-kim-ft":     ("mel_band_roformer_kim_ft_unwa.ckpt", 12.4),
    "bs-roformer-1296":   ("model_bs_roformer_ep_368_sdr_12.9628.ckpt", 12.1),
    "mdx23c":             ("MDX23C-8KFFT-InstVoc_HQ.ckpt", 10.6),
}
DEFAULT = ["melband-kim", "melband-big-beta4", "bs-roformer-1296", "mdx23c"]

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


def ensure_instrumental(folder: Path) -> None:
    """Demucs gives four stems; sum the three that aren't the voice, so a four-stem model
    can be scored against a two-stem one on the same footing."""
    if (folder / "instrumental.wav").exists():
        return
    parts = [sf.read(folder / f"{n}.wav", dtype="float32", always_2d=True)[0]
             for n in ("drums", "bass", "other") if (folder / f"{n}.wav").exists()]
    if not parts:
        return
    _, sr = sf.read(folder / "vocals.wav", dtype="float32", always_2d=True)
    n = min(len(p) for p in parts)
    sf.write(folder / "instrumental.wav", sum(p[:n] for p in parts), sr, subtype="FLOAT")


def tidy(folder: Path) -> None:
    """audio-separator names files after the track and model; give them stem names. The
    second stem is variously called instrumental, other or no_vocals depending on who
    trained the checkpoint — whatever it is, it's everything that isn't the voice."""
    for f in folder.glob("*.wav"):
        if f.name in ("vocals.wav", "instrumental.wav"):
            continue
        stem = "vocals" if "(vocals)" in f.name.lower() else "instrumental"
        f.replace(folder / f"{stem}.wav")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("track", type=Path, nargs="?")
    p.add_argument("-s", "--start", type=float, default=None)
    p.add_argument("-d", "--duration", type=float, default=None)
    p.add_argument("--models", nargs="+", default=DEFAULT, choices=list(MODELS))
    p.add_argument("--baseline", type=Path, default=None,
                   help="a folder of demucs stems to score alongside, for reference")
    p.add_argument("--catalogue", action="store_true", help="list what audio-separator offers")
    args = p.parse_args()

    if args.catalogue:
        subprocess.run(["audio-separator", "--list_models"], check=False)
        return
    if args.track is None:
        p.error("a track is required unless you asked for --catalogue")

    from audio_separator.separator import Separator

    out = ROOT / "separated/uvr" / args.track.stem
    out.mkdir(parents=True, exist_ok=True)

    source = decoded(args.track, out)
    if args.start is not None or args.duration is not None:
        source = out / "excerpt.wav"
        cut = ["ffmpeg", "-v", "error", "-y", "-i", str(args.track)]
        if args.start is not None:
            cut += ["-ss", str(args.start)]
        if args.duration is not None:
            cut += ["-t", str(args.duration)]
        subprocess.run(cut + ["-c:a", "pcm_s16le", str(source)], check=True)

    timing = {}
    for short in args.models:
        checkpoint, _ = MODELS[short]
        folder = out / short
        folder.mkdir(exist_ok=True)
        separator = Separator(output_dir=str(folder), model_file_dir=str(ROOT / "models"),
                              output_format="WAV", log_level=40)
        separator.load_model(model_filename=checkpoint)
        began = time.monotonic()
        separator.separate(str(source))
        timing[short] = time.monotonic() - began
        tidy(folder)
        print(f"  {short} in {timing[short]:.0f}s")

    rows = [(s, out / s, timing[s], MODELS[s][1]) for s in args.models]
    if args.baseline and args.baseline.exists():
        ensure_instrumental(args.baseline)
        rows.insert(0, (f"demucs {args.baseline.name}", args.baseline, float("nan"), 10.8))

    reference = activity(rows[0][1])
    print(f"\n{'model':<20} {'SDR':>5} {'wall':>6} {'bleed':>7} {'duck':>7}")
    for name, folder, wall, sdr in rows:
        r = measure(folder, stem="vocals", masker="instrumental", reference=reference)
        clock = "     —" if np.isnan(wall) else f"{wall:>5.0f}s"
        print(f"{name:<20} {sdr:>5.1f} {clock} {r['bleed']:>+7.2f} {r['duck']:>+7.2f}")


if __name__ == "__main__":
    main()
