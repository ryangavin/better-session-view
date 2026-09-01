#!/usr/bin/env python
"""Separate a track through the Python API and build mixes from the stems.

The CLI writes one file per source and stops there. Going through `demucs.api`
keeps the stems as tensors, so anything you can do to a tensor — sum a subset,
gain one source, drop another — happens before the encode:

    uv run stems.py audio/test.mp3
    uv run stems.py audio/test.mp3 --model htdemucs_6s --shifts 2

Everything lands in separated/api/<track>/.
"""

import argparse
import os
import time
from pathlib import Path

# Any op Metal is missing runs on the CPU instead of raising.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import torch  # noqa: E402
from demucs.api import Separator, save_audio  # noqa: E402

# Mixes summed from the stems the model gives us. A source that the chosen model
# doesn't have is skipped, so these hold for the 4- and the 6-source models alike.
MIXES = {
    "instrumental": ["drums", "bass", "other", "guitar", "piano"],
    "rhythm": ["drums", "bass"],
}


def device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("track", type=Path)
    p.add_argument("--model", default="htdemucs", help="htdemucs, htdemucs_ft, htdemucs_6s, hdemucs_mmi, mdx_extra")
    p.add_argument("--shifts", type=int, default=1, help="average over N random time shifts; N times slower")
    p.add_argument("--segment", type=int, default=None, help="seconds per chunk; htdemucs caps at 7")
    p.add_argument("--device", default=device())
    p.add_argument("--float32", action="store_true", help="write 32-bit float wavs instead of int16")
    args = p.parse_args()

    print(f"{args.model} on {args.device}, shifts={args.shifts}")
    separator = Separator(
        model=args.model,
        device=args.device,
        shifts=args.shifts,
        segment=args.segment,
        progress=True,
    )

    started = time.monotonic()
    origin, stems = separator.separate_audio_file(args.track)
    wall = time.monotonic() - started
    seconds = origin.shape[-1] / separator.samplerate
    print(f"\n{wall:.1f}s for {seconds:.1f}s of audio ({seconds / wall:.2f}x realtime)")

    out = Path(__file__).parent / "separated/api" / args.track.stem
    out.mkdir(parents=True, exist_ok=True)

    def write(name: str, wav: torch.Tensor) -> None:
        path = out / f"{name}.wav"
        shown = path.relative_to(Path.cwd()) if path.is_relative_to(Path.cwd()) else path
        save_audio(wav, path, samplerate=separator.samplerate, as_float=args.float32,
                   bits_per_sample=32 if args.float32 else 16)
        db = 20 * torch.log10(wav.pow(2).mean().sqrt().clamp(min=1e-9))
        print(f"  {shown}  {db:6.1f} dB RMS")

    for name, wav in stems.items():
        write(name, wav)

    for name, sources in MIXES.items():
        present = [stems[s] for s in sources if s in stems]
        write(name, torch.stack(present).sum(0))

    # The stems sum back to the input; the residual is what the model couldn't place.
    residual = origin - torch.stack(list(stems.values())).sum(0)
    write("residual", residual)


if __name__ == "__main__":
    main()
