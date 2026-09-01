#!/usr/bin/env python
"""Sweep the knobs that plausibly affect stem artifacts, and measure what each one did.

Runs one track through a matrix of models and inference settings, writes every result to
separated/tune/<track>/<label>/, and reports the bleed and duck figures from pulse.py so
the settings can be compared on something other than memory of the last playback.

The last row is an ensemble: the mean of several models' stems. Different architectures
make different mistakes in different places, so averaging them cancels some of what any
one of them got wrong — this is how the challenge submissions were built.

    uv run tune.py track.m4a -s 15 -d 60
    uv run tune.py track.m4a                # the whole thing, and it will take a while
"""

import argparse
import os
import subprocess
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import torch  # noqa: E402
from demucs.api import Separator, save_audio  # noqa: E402

from pulse import activity, measure  # noqa: E402

# label, model, shifts, overlap
CONFIGS = [
    ("htdemucs", "htdemucs", 1, 0.25),
    ("ft", "htdemucs_ft", 1, 0.25),
    ("ft-overlap", "htdemucs_ft", 1, 0.75),
    ("ft-shifts5", "htdemucs_ft", 5, 0.25),
    ("ft-both", "htdemucs_ft", 5, 0.75),
    ("6s", "htdemucs_6s", 1, 0.25),
    ("mmi", "hdemucs_mmi", 1, 0.25),
    ("mdx_extra", "mdx_extra", 1, 0.25),
]
ENSEMBLE = ["ft", "htdemucs", "mmi", "mdx_extra"]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("track", type=Path)
    p.add_argument("-s", "--start", type=float, default=None)
    p.add_argument("-d", "--duration", type=float, default=None)
    p.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    args = p.parse_args()

    root = Path(__file__).parent
    out = root / "separated/tune" / args.track.stem
    out.mkdir(parents=True, exist_ok=True)

    source = args.track
    if args.start is not None or args.duration is not None:
        source = out / "excerpt.wav"
        cut = ["ffmpeg", "-v", "error", "-y", "-i", str(args.track)]
        if args.start is not None:
            cut += ["-ss", str(args.start)]
        if args.duration is not None:
            cut += ["-t", str(args.duration)]
        subprocess.run(cut + ["-c:a", "pcm_s16le", str(source)], check=True)

    stems: dict[str, dict[str, torch.Tensor]] = {}
    timing: dict[str, float] = {}
    separator = None
    loaded = None

    for label, model, shifts, overlap in CONFIGS:
        if model != loaded:
            separator = Separator(model=model, device=args.device, progress=False)
            loaded = model
        separator.update_parameter(shifts=shifts, overlap=overlap)
        began = time.monotonic()
        _, sources = separator.separate_audio_file(source)
        timing[label] = time.monotonic() - began
        stems[label] = sources
        write(out / label, sources, separator.samplerate)
        print(f"  {label} in {timing[label]:.0f}s")

    # The ensemble: average whatever sources all its members agree on having.
    members = [stems[m] for m in ENSEMBLE if m in stems]
    shared = set.intersection(*(set(m) for m in members))
    length = min(t.shape[-1] for m in members for t in m.values())
    averaged = {
        name: torch.stack([m[name][..., :length] for m in members]).mean(0)
        for name in shared
    }
    write(out / "ensemble", averaged, separator.samplerate)
    timing["ensemble"] = sum(timing[m] for m in ENSEMBLE if m in timing)
    print(f"  ensemble of {', '.join(ENSEMBLE)}")

    # One activity mask for every config, so the figures are about the same frames.
    reference = activity(out / CONFIGS[1][0])

    print(f"\n{'config':<12} {'wall':>6} {'bleed':>7} {'duck':>7}   worst band")
    for label in [c[0] for c in CONFIGS] + ["ensemble"]:
        r = measure(out / label, reference=reference)
        worst = min(r["bands"].items(), key=lambda kv: kv[1][1])[0]
        print(f"{label:<12} {timing[label]:>5.0f}s {r['bleed']:>+7.2f} {r['duck']:>+7.2f}"
              f"   {worst[0]}-{worst[1]} Hz")


def write(folder: Path, sources: dict, samplerate: int) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for name, wav in sources.items():
        # float32 with no clip protection, so the stems still sum back to the mix exactly.
        save_audio(wav, folder / f"{name}.wav", samplerate=samplerate,
                   clip="none", bits_per_sample=32, as_float=True)


if __name__ == "__main__":
    main()
