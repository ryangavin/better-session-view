#!/usr/bin/env python
"""Compare the stems a preview sweep produced, model against model.

    uv run compare.py "separated/preview/<track>"
    uv run compare.py "separated/preview/<track>" --stem drums --reference htdemucs

For each model it prints the level of one stem and how far that stem sits from the same
stem out of a reference model — correlation of the two waveforms, since every model is
separating the same seconds of the same mix. A model that agrees with the reference is
making the same call about what belongs in the stem; a low number means it is putting the
material somewhere else, which is what you go and listen for.
"""

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf


def load(path: Path) -> np.ndarray:
    wav, _ = sf.read(path, dtype="float32", always_2d=True)
    return wav.mean(1)


def db(x: np.ndarray) -> float:
    return 20 * np.log10(max(float(np.sqrt((x**2).mean())), 1e-9))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("folder", type=Path, help="a separated/preview/<track> folder")
    p.add_argument("--stem", default="vocals")
    p.add_argument("--reference", default="htdemucs_ft")
    args = p.parse_args()

    models = sorted(d for d in args.folder.iterdir() if d.is_dir())
    stems = {}
    for d in models:
        found = list(d.glob(f"{args.stem}.*"))
        if found:
            stems[d.name] = load(found[0])

    if not stems:
        raise SystemExit(f"no {args.stem} stem under {args.folder}")

    reference = stems.get(args.reference)
    print(f"{args.stem}, against {args.reference}\n")
    print(f"{'model':<14} {'level':>8} {'agreement':>10}")
    for name, wav in stems.items():
        if reference is None or name == args.reference:
            agreement = "—"
        else:
            n = min(len(wav), len(reference))
            a, b = wav[:n], reference[:n]
            r = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
            agreement = f"{r:.3f}"
        print(f"{name:<14} {db(wav):7.1f} dB {agreement:>10}")


if __name__ == "__main__":
    main()
