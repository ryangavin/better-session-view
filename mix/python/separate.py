#!/usr/bin/env python
"""The separation worker: one track in, one directory of stems out, and a
running commentary on stdout that a parent process can actually read.

Run as::

    uv run --project <workspace> python separate.py \
        --input track.wav --out /scratch/dir --model htdemucs_ft

`mix/electron/separate.ts` is the parent. Every line on **stdout** is one JSON
object and nothing else is ever printed there, so the parent splits on newlines
and parses; stderr stays human, because that is where torch's warnings and a
stack trace go and they are for a person reading a log.

Deliberately **not** the demucs CLI. The CLI reports progress as a tqdm bar,
which is a picture of a number rather than a number, and reconstructing one from
carriage returns and block glyphs is a parser that breaks whenever the bar's
width changes. `demucs.api` takes a callback that is handed the real quantities,
so this reports what the model is actually doing.

The two output rules here are the ones `demucs/README.md` measured and neither is
a preference:

* **float32, with clipping protection off.** Every stem rescaled independently
  to avoid clipping is four stems that no longer sum to the mix: measured, that
  is -13.8 dB of error against -23.6 dB, and the second number is the model's own.
  Anything that fades stems against each other needs the second one.
* **the residual is measured and reported**, so the sidecar records how well
  this particular separation summed rather than asserting that it did.
"""

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

# Any op Metal is missing runs on the CPU instead of raising. Set before torch
# is imported, which is why the imports below sit under it.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
# The bar we are deliberately not parsing. Off, so nothing writes to stderr at
# sixty lines a second while a job runs.
os.environ.setdefault("TQDM_DISABLE", "1")


def say(event: str, **fields: object) -> None:
    """One JSON object, one line, flushed.

    Flushing matters more than it looks: stdout to a pipe is block-buffered, so
    without this the parent would receive a job's whole progress history in one
    burst as the process exited, which is the same as no progress at all.
    """
    print(json.dumps({"event": event, **fields}), flush=True)


def db(value: float) -> float:
    """Decibels, floored rather than infinite — JSON has no -inf."""
    return round(20 * math.log10(max(value, 1e-12)), 2)


def main() -> int:
    p = argparse.ArgumentParser(description="Separate one track into stems.")
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True, help="a scratch directory the parent renames")
    p.add_argument("--model", default="htdemucs")
    p.add_argument("--device", default="")
    # Pinned by the registry rather than offered to anybody. `demucs/README.md`
    # measured 13x the compute moving the result by 0.02 dB: these govern chunk
    # seams and memory, and they are not a quality knob.
    p.add_argument("--shifts", type=int, default=1)
    p.add_argument("--overlap", type=float, default=0.25)
    args = p.parse_args()

    import torch
    from demucs.api import Separator, save_audio

    device = args.device or (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )

    # First use of a checkpoint downloads it from Hugging Face, which is a few
    # hundred megabytes and no progress of its own. Saying so before it starts is
    # the difference between a slow first run and an apparently hung one.
    say("stage", stage="loading the model", model=args.model, device=device)
    opening = time.monotonic()
    separator = Separator(
        model=args.model,
        device=device,
        shifts=args.shifts,
        overlap=args.overlap,
        progress=False,
    )
    loaded = time.monotonic() - opening
    inner = separator._model
    bag = getattr(inner, "models", [inner])
    # A bag whose weights are an identity matrix is one fine-tuned checkpoint per
    # source — htdemucs_ft — and its bag index is therefore a source name. Any
    # other bag mixes every model into every source, and per-source progress
    # would be an invention. `None` says so rather than guessing.
    weights = getattr(inner, "weights", None)
    per_source = None
    if weights is not None and len(weights) == len(inner.sources):
        if all(
            all((w == 1.0) == (i == j) for j, w in enumerate(row))
            for i, row in enumerate(weights)
        ):
            per_source = list(inner.sources)

    say(
        "opened",
        # Timed separately from the separation, because they scale differently:
        # loading four fine-tuned checkpoints is a fixed cost a twenty-second
        # clip pays in full and a ten-minute track barely notices. An estimate
        # built from one figure covering both is wrong at one end or the other.
        load=round(loaded, 2),
        sources=list(inner.sources),
        samplerate=separator.samplerate,
        channels=separator.audio_channels,
        perSource=per_source,
    )

    say("stage", stage="reading the file")
    audio = separator._load_audio(args.input)
    seconds = audio.shape[-1] / separator.samplerate
    say("read", seconds=round(seconds, 2), samples=int(audio.shape[-1]))

    # How many chunk-completions this job will produce, worked out the same way
    # `demucs.apply` works out its offsets. Counting *completions* rather than
    # tracking the highest offset seen is load-bearing: the chunks run on a
    # thread pool and finish out of order, so an offset-derived percentage
    # would jump forwards and then back.
    segment = getattr(bag[0], "segment", 7.8)
    stride = int((1 - args.overlap) * int(separator.samplerate * segment))
    chunks = max(1, len(range(0, int(audio.shape[-1]), max(1, stride))))
    total = chunks * len(bag) * max(1, args.shifts)

    state = {"ended": 0, "sent": -1.0}

    def progress(info: dict) -> None:
        if info.get("state") != "end":
            return
        state["ended"] += 1
        done = min(1.0, state["ended"] / total)
        # One line per whole percent. At 44.1 kHz a four-minute track is a few
        # hundred chunks, and a line per chunk is noise the parent then has to
        # throttle at the other end.
        if done - state["sent"] < 0.01 and done < 1.0:
            return
        state["sent"] = done
        index = info.get("model_idx_in_bag", 0)
        say(
            "progress",
            done=round(done, 4),
            source=per_source[index] if per_source and index < len(per_source) else None,
        )

    separator.update_parameter(callback=progress)

    say("stage", stage=f"separating · {len(inner.sources)} sources")
    began = time.monotonic()
    origin, stems = separator.separate_tensor(audio, separator.samplerate)
    wall = time.monotonic() - began

    say("stage", stage="writing stems")
    args.out.mkdir(parents=True, exist_ok=True)
    summed = None
    written = []
    for name, wav in stems.items():
        summed = wav.clone() if summed is None else summed + wav
        # `clip="none"` and float32: see the module docstring. This is the pair
        # that makes the stems add back up to the mix.
        save_audio(
            wav,
            args.out / f"{name}.wav",
            samplerate=separator.samplerate,
            clip="none",
            bits_per_sample=32,
            as_float=True,
        )
        rms = float(wav.pow(2).mean().sqrt())
        written.append({"source": name, "file": f"{name}.wav", "rms": db(rms)})
        say("written", source=name, file=f"{name}.wav", rms=db(rms))

    # What the model could not place, as a level against the mix it was given.
    # This is the number that tells a bad stem from a bad source six months
    # later, so it goes in the sidecar rather than only into a log.
    residual = origin[..., : summed.shape[-1]] - summed
    quiet = db(float(residual.pow(2).mean().sqrt())) - db(float(origin.pow(2).mean().sqrt()))

    say(
        "done",
        residual=round(quiet, 2),
        load=round(loaded, 2),
        seconds=round(seconds, 2),
        wall=round(wall, 2),
        realtime=round(seconds / wall, 2) if wall > 0 else None,
        samplerate=separator.samplerate,
        channels=separator.audio_channels,
        bits=32,
        float=True,
        device=device,
        stems=written,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        # A cancelled job, which the parent asked for. Not a failure, and not
        # something to print a stack trace about.
        sys.exit(130)
    except Exception as why:  # noqa: BLE001 — the parent renders this to a person
        say("failed", says=f"{type(why).__name__}: {why}")
        sys.exit(1)
