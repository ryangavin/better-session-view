#!/usr/bin/env python
"""Measure why an isolated stem pulses in time with the track.

Two things make a vocal stem throb on a four-to-the-floor mix, and they are opposite
failures of the same decision:

  bleed   the masker's rhythm leaking into the stem — measured where the stem isn't
          sounding, as correlation between the two levels. Positive and large means the
          drums are audible inside the vocal.
  duck    the stem losing its own energy wherever the masker is loud — measured where the
          stem IS sounding. Negative and large means the voice dips on every hit, because
          those time-frequency bins were given to the other source.

Both are reported per band, because they don't happen in the same one: ducking lands on
sibilance and air, bleed arrives as hats and claps. Summing the stems back hides both,
which is why a full mix sounds fine and the solo doesn't.

    uv run pulse.py "separated/htdemucs/<track>"
    uv run pulse.py "separated/preview/<track>/mdx_extra" --masker other
"""

import argparse
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf

N, HOP = 2048, 512
BANDS = [(0, 200), (200, 800), (800, 3000), (3000, 8000), (8000, 20000)]


def spectrogram(path: Path) -> tuple[np.ndarray, np.ndarray]:
    wav, sr = sf.read(path, dtype="float32", always_2d=True)
    x = wav.mean(1)
    frames = 1 + (len(x) - N) // HOP
    strided = np.lib.stride_tricks.as_strided(
        x, (frames, N), (x.strides[0] * HOP, x.strides[0])
    )
    mag = np.abs(np.fft.rfft(strided * np.hanning(N), axis=1))
    return mag, np.fft.rfftfreq(N, 1 / sr)


def correlate(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a - a.mean(), b - b.mean()
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def activity(folder: Path, stem: str = "vocals") -> np.ndarray:
    """Frame energy of one stem, to score every model on the same frames."""
    S, _ = spectrogram(sorted(folder.glob(f"{stem}.*"))[0])
    return S.sum(1)


def measure(folder: Path, stem: str = "vocals", masker: str = "drums",
            reference: Optional[np.ndarray] = None) -> dict:
    """`reference` is frame energy from `activity()`. Pass one when comparing several
    models: without it each model picks its own idea of where the vocal is, and the two
    figures stop being about the same seconds."""

    def find(name: str) -> Path:
        hits = sorted(folder.glob(f"{name}.*"))
        if not hits:
            raise SystemExit(f"no {name} stem in {folder}")
        return hits[0]

    S, freqs = spectrogram(find(stem))
    M, _ = spectrogram(find(masker))
    n = min(len(S), len(M))
    S, M = S[:n], M[:n]

    total = S.sum(1) if reference is None else reference[:n]
    singing = total > np.percentile(total, 70)
    resting = total < np.percentile(total, 25)

    per_band = {}
    for lo, hi in BANDS:
        sel = (freqs >= lo) & (freqs < hi)
        s = 20 * np.log10(np.maximum(S[:, sel].sum(1), 1e-9))
        m = 20 * np.log10(np.maximum(M[:, sel].sum(1), 1e-9))
        per_band[(lo, hi)] = (correlate(s[resting], m[resting]),
                              correlate(s[singing], m[singing]))

    # Headline figures: the worst band of each kind, which is what you hear.
    bleed = max(b for b, _ in per_band.values())
    duck = min(d for _, d in per_band.values())
    return {"bands": per_band, "bleed": bleed, "duck": duck}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("folder", type=Path, help="a folder of stems from one model")
    p.add_argument("--stem", default="vocals")
    p.add_argument("--masker", default="drums")
    args = p.parse_args()

    r = measure(args.folder, args.stem, args.masker)
    print(f"{args.folder}\n{args.stem} against {args.masker}\n")
    print(f"{'band':<14} {'bleed':>7} {'duck':>7}")
    for (lo, hi), (bleed, duck) in r["bands"].items():
        print(f"{lo:>5}-{hi:<8} {bleed:>+7.2f} {duck:>+7.2f}")
    print(f"\nworst bleed {r['bleed']:+.2f}, worst duck {r['duck']:+.2f}")


if __name__ == "__main__":
    main()
