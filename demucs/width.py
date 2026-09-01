#!/usr/bin/env python
"""Collapse a stem's stereo width above a crossover, and put what you removed back.

The separators' worst rhythmic artifact on this material lives in the side channel: the
left/right split of the voice flickers at a sixteenth-note rate that isn't in the mix.
The side channel is the difference of two large, nearly equal estimates, so a small error
in each shows up there many times larger. A lead vocal is usually centred anyway, so
narrowing it above a few kHz removes the flicker and costs only the air's width.

The side content that comes off the voice is added to `other`, so the four stems still sum
to the mix.

    uv run width.py "separated/hybrid/<track>" --above 3000
    uv run width.py "separated/hybrid/<track>" --above 0     # fully mono voice
"""

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf


def crossover(side: np.ndarray, sr: int, cutoff: float) -> tuple[np.ndarray, np.ndarray]:
    """Split the side channel at `cutoff` — below stays, above goes."""
    if cutoff <= 0:
        return np.zeros_like(side), side
    spectrum = np.fft.rfft(side)
    freqs = np.fft.rfftfreq(len(side), 1 / sr)
    # A gentle raised-cosine crossover an octave wide, so nothing rings.
    keep = np.clip((np.log2(np.maximum(freqs, 1) / cutoff)), 0, 1)
    keep = 0.5 * (1 + np.cos(np.pi * keep))
    low = np.fft.irfft(spectrum * keep, n=len(side))
    return low, side - low


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("folder", type=Path, help="a folder of four stems")
    p.add_argument("--above", type=float, default=3000, help="crossover in Hz")
    p.add_argument("--stem", default="vocals")
    p.add_argument("--into", default="other", help="which stem absorbs the removed side")
    args = p.parse_args()

    voice, sr = sf.read(args.folder / f"{args.stem}.wav", dtype="float32", always_2d=True)
    other, _ = sf.read(args.folder / f"{args.into}.wav", dtype="float32", always_2d=True)
    n = min(len(voice), len(other))
    voice, other = voice[:n], other[:n]

    mid = voice.mean(1)
    side = (voice[:, 0] - voice[:, 1]) / 2
    kept, removed = crossover(side, sr, args.above)

    narrowed = np.stack([mid + kept, mid - kept], axis=1)
    displaced = np.stack([removed, -removed], axis=1)

    out = args.folder / "narrowed"
    out.mkdir(exist_ok=True)
    sf.write(out / f"{args.stem}.wav", narrowed, sr, subtype="FLOAT")
    sf.write(out / f"{args.into}.wav", other + displaced, sr, subtype="FLOAT")
    for f in args.folder.glob("*.wav"):
        if f.stem not in (args.stem, args.into):
            sf.write(out / f.name, sf.read(f, dtype="float32", always_2d=True)[0][:n], sr, subtype="FLOAT")

    def level(x):
        return 20 * np.log10(max(np.sqrt((x ** 2).mean()), 1e-9))
    print(f"side above {args.above:.0f} Hz moved out of {args.stem}: "
          f"{level(removed) - level(mid):+.1f} dB relative to its centre")
    print(f"{out}")


if __name__ == "__main__":
    main()
