#!/usr/bin/env python
"""The transcription worker: one bass stem in, a MIDI file and a note list out.

Run as::

    uv run --project <workspace> python transcribe.py \
        --input bass.wav --out /scratch/dir

`mix/electron/transcribe.ts` is the parent — see `mix/docs/transcribe.md` — and
this still runs standalone the same way `separate.py` can. Same stdout contract
as `separate.py`: one JSON object
per line and nothing else, so a parent can split on newlines and parse; stderr
stays human, for torch's warnings and a stack trace.

Bass is close enough to monophonic that this leans on a **monophonic** pitch
tracker (CREPE, via `torchcrepe` — a PyTorch port, which is why it is torch
rather than a second ML runtime) instead of a general-purpose polyphonic
transcription model. CREPE is a CNN over raw audio rather than an
autocorrelation method, which is what makes it robust to the "missing
fundamental" problem a bass's low, harmonic-poor fundamental runs into.

Note *boundaries* come from the same onset-detection technique already
implemented and tested in `mix/src/warp.ts` (`riseOf`, `hitsOf`) — ported here
rather than reached for a second onset detector (e.g. librosa's spectral
flux), so a bass line only ever gets one reading of where its attacks are. See
`mix/docs/transcribe.md` for the reasoning `mix/docs/playback.md` already
states for the grid: two detectors on one stem would not be evidence about
anything if they disagreed.

**What this does not do yet**, honestly: it does not split a note on a
sustained pitch step that arrives without a new onset — a slide, a hammer-on,
a pull-off. Those come out as one long note at whichever pitch the segment's
median lands on. Worth fixing once the onset-driven segmentation itself has
been checked against real playing.
"""

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np


def say(event: str, **fields: object) -> None:
    print(json.dumps({"event": event, **fields}), flush=True)


# ---------------------------------------------------------------------------
# Onsets: `riseOf` and `hitsOf` from `mix/src/warp.ts`, ported rather than
# reimplemented from a different idea of what an onset is. `warp.ts` runs this
# on a *column* envelope — the loudest sample in each 512-sample span, about
# twelve milliseconds at 44.1k — and so does this, on the bass stem's own
# full-band envelope rather than the kick-filtered one `bandsOf` builds for
# drums: a pluck is not a kick, and there is no drum kit here to filter out.
# ---------------------------------------------------------------------------

HOP = 512


def envelope_of(mono: np.ndarray, hop: int = HOP) -> np.ndarray:
    """The loudest sample in each column. `bandsOf`'s `wide`, without the kit."""
    n = len(mono) // hop
    if n == 0:
        return np.zeros(0, dtype=np.float64)
    trimmed = np.abs(mono[: n * hop]).reshape(n, hop)
    return trimmed.max(axis=1).astype(np.float64)


def rise_of(level: np.ndarray, per: float) -> np.ndarray:
    """Onset strength: the rise in energy, less the rise around it.

    Port of `riseOf` in `mix/src/warp.ts` — the subtraction is what keeps a
    loud chorus from out-voting a whole quiet verse; what is left is how much
    a moment stood out from its own neighbours, four hundred milliseconds
    either side.
    """
    n = len(level)
    raw = np.zeros(n, dtype=np.float64)
    raw[1:] = np.maximum(0.0, level[1:] - level[:-1])
    cum = np.concatenate(([0.0], np.cumsum(raw)))
    half = max(1, round(0.2 / per))
    out = np.zeros(n, dtype=np.float64)
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        out[i] = max(0.0, raw[i] - (cum[hi] - cum[lo]) / (hi - lo))
    return out


MIN_ONSET_GAP = 0.08


def hits_of(rise: np.ndarray, per: float) -> list[float]:
    """Local maxima of the onset strength, placed between columns by parabola.

    Port of `hitsOf`. A column is twelve milliseconds and a note's start is
    judged in single ones, so rounding every hit to a column would put a floor
    under everything downstream.
    """
    loudest = float(rise.max()) if len(rise) else 0.0
    if loudest <= 0:
        return []
    least = loudest * 0.06
    candidates: list[int] = []
    for i in range(1, len(rise) - 1):
        b = rise[i]
        if b < least or b <= rise[i - 1] or b < rise[i + 1]:
            continue
        candidates.append(i)

    # A plucked string often makes several nearby amplitude rises as its first
    # few cycles settle. Keep the strongest one in an 80 ms neighbourhood,
    # rather than turning one attack into a run of 40–60 ms notes. At 128 BPM
    # even a thirty-second note is 59 ms, so this is deliberately a bass-line
    # boundary rather than a general-purpose onset detector.
    gap = max(1, round(MIN_ONSET_GAP / per))
    kept: list[int] = []
    for i in sorted(candidates, key=lambda at: float(rise[at]), reverse=True):
        if all(abs(i - other) >= gap for other in kept):
            kept.append(i)

    out: list[float] = []
    for i in sorted(kept):
        b = rise[i]
        a, c = rise[i - 1], rise[i + 1]
        bend = a - 2 * b + c
        shift = max(-0.5, min(0.5, (0.5 * (a - c)) / bend)) if bend < 0 else 0.0
        out.append(i + shift)
    return out


# ---------------------------------------------------------------------------
# Note segmentation
# ---------------------------------------------------------------------------

# Below this share of frames in a window actually pitched, the window is not
# a note — it is either silence or an attack with no clear fundamental.
VOICED_FRACTION = 0.3
VOICED_MIN = 3

# Skipped at the start of every window: CREPE's estimate is noisiest inside a
# pluck's own attack, and counting it would pull a note's pitch toward
# whatever the string was doing on the way up to it.
ATTACK_SKIP = 0.03

# Below this fraction of the track's peak envelope, a window with no pitch is
# silence rather than a muted hit — there was nothing to pluck.
MUTE_FLOOR = 0.12

# A later noise burst inside an onset-to-onset window is not the tail of the
# first note. Short holes in the envelope are allowed; a tenth of a second of
# no supported signal ends it.
SUPPORT_GAP = 0.10
SUPPORT_FLOOR = 0.06


def hz_to_midi_cents(hz: np.ndarray) -> np.ndarray:
    return 1200.0 * np.log2(np.maximum(hz, 1e-6) / 440.0) + 6900.0


def weighted_median(values: np.ndarray, weights: np.ndarray) -> float:
    order = np.argsort(values)
    values, weights = values[order], weights[order]
    cum = np.cumsum(weights)
    half = cum[-1] / 2.0
    return float(values[np.searchsorted(cum, half)])


def segment_notes(
    onset_times: list[float],
    duration: float,
    frame_times: np.ndarray,
    cents: np.ndarray,
    periodicity: np.ndarray,
    level: np.ndarray,
    level_per: float,
    confidence: float,
) -> list[dict]:
    """Onset to onset is a window; what is in it decides what kind of note it is."""
    voiced = periodicity >= confidence
    boundaries = [*onset_times, duration]
    peak_level = float(level.max()) if len(level) else 0.0
    frame_per = float(frame_times[1] - frame_times[0]) if len(frame_times) > 1 else 0.01
    frame_columns = np.clip((frame_times / level_per).astype(int), 0, max(0, len(level) - 1))
    frame_level = level[frame_columns] if len(level) else np.zeros_like(frame_times)

    notes: list[dict] = []
    for start, end in zip(boundaries, boundaries[1:]):
        lo = start + ATTACK_SKIP if end - (start + ATTACK_SKIP) > 0.01 else start
        from_col = int(start / level_per)
        to_col = max(from_col + 1, int(end / level_per))
        attack_to = min(to_col, from_col + max(1, round(0.20 / level_per)))
        local_peak = float(
            level[from_col:attack_to].max()
            if attack_to > from_col and from_col < len(level)
            else 0.0
        )
        attacked = peak_level > 0 and local_peak >= MUTE_FLOOR * peak_level
        if not attacked:
            continue

        # Judge pitch only while this attack has signal behind it. Using the
        # whole onset-to-onset window made a real note followed by twenty
        # seconds of silence look 99% unvoiced, then emitted the silence as one
        # enormous muted note.
        mask = (frame_times >= lo) & (frame_times < end)
        support = mask & (frame_level >= max(peak_level * 0.003, local_peak * SUPPORT_FLOOR))
        supported = np.flatnonzero(support)
        if len(supported) == 0:
            continue
        gaps = np.flatnonzero(np.diff(supported) * frame_per > SUPPORT_GAP)
        if len(gaps):
            supported = supported[: gaps[0] + 1]
        support = np.zeros_like(mask)
        support[supported] = True
        total = int(support.sum())
        voiced_mask = support & voiced
        vcount = int(voiced_mask.sum())
        note_end = min(end, float(frame_times[supported[-1]] + frame_per))

        if vcount >= max(VOICED_MIN, int(VOICED_FRACTION * total)):
            weight = periodicity[voiced_mask]
            note_cents = weighted_median(cents[voiced_mask], weight)
            pitch = int(round((note_cents - 6900.0) / 100.0 + 69.0))
            vel = int(np.clip(45 + 82 * min(1.0, float(level[from_col:to_col].max() / peak_level) if to_col > from_col and peak_level > 0 else 0), 1, 127))
            notes.append(
                {
                    "start": round(start, 4),
                    "end": round(note_end, 4),
                    "pitch": pitch,
                    "velocity": vel,
                    "confidence": round(vcount / total, 3),
                    "muted": False,
                }
            )
        elif attacked:
            notes.append(
                {
                    "start": round(start, 4),
                    "end": round(min(note_end, start + 0.25), 4),
                    "pitch": None,
                    "velocity": 80,
                    "confidence": 0.0,
                    "muted": True,
                }
            )
        # else: neither pitched nor attacked — silence between notes, not a note.
    return notes


MIN_NOTE = 0.04  # seconds. Shorter than this is noise in the segmentation, not a note.


def drop_short(notes: list[dict]) -> list[dict]:
    return [n for n in notes if n["end"] - n["start"] >= MIN_NOTE]


def main() -> int:
    p = argparse.ArgumentParser(description="Transcribe one bass stem to MIDI and a note list.")
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True, help="a scratch directory the parent renames")
    p.add_argument("--device", default="")
    p.add_argument("--model", default="full", choices=["full", "tiny"])
    # CREPE's own pitch grid is 360 bins spanning exactly six octaves from C1 —
    # 32.70 Hz — to B7. Anything below that is not a coarser estimate, it is a
    # broken one: an fmin under the model's true floor corrupts the probability
    # normalisation for *every* frame, not just the ones near the edge, and
    # periodicity comes back `-inf` across the whole track. Measured against
    # `stems/…/bass.wav` in the library — 30.0 Hz breaks it, 32.70 does not.
    #
    # A practical cost of that floor: a 5-string's open B sits at ~30.87 Hz,
    # just under it. Those notes alias to somewhere near C1 rather than being
    # found correctly — a real limitation of CREPE for a 5-string's lowest
    # string, not a bug in this worker.
    p.add_argument("--fmin", type=float, default=32.70, help="Hz — CREPE's true floor, C1")
    p.add_argument("--fmax", type=float, default=400.0, help="Hz — well above fretted range")
    p.add_argument("--hop-ms", type=float, default=10.0)
    p.add_argument("--batch-size", type=int, default=512)
    p.add_argument("--confidence", type=float, default=0.21, help="periodicity floor for a voiced frame")
    args = p.parse_args()

    import torch
    import torchcrepe
    import pretty_midi
    import soundfile as sf

    device = args.device or (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )

    say("stage", stage="reading the file", device=device)
    data, sr = sf.read(str(args.input), dtype="float32", always_2d=True)
    mono = data.mean(axis=1).astype(np.float32)
    seconds = len(mono) / sr
    say("read", seconds=round(seconds, 2), samples=int(len(mono)))

    say("stage", stage="tracking pitch")
    began = time.monotonic()
    hop_length = max(1, round(sr * args.hop_ms / 1000.0))
    audio_t = torch.from_numpy(mono).unsqueeze(0)
    pitch_t, periodicity_t = torchcrepe.predict(
        audio_t,
        sr,
        hop_length=hop_length,
        fmin=args.fmin,
        fmax=args.fmax,
        model=args.model,
        decoder=torchcrepe.decode.viterbi,
        return_periodicity=True,
        batch_size=args.batch_size,
        device=device,
        pad=True,
    )
    pitch_hz = pitch_t.squeeze(0).cpu().numpy()
    periodicity = periodicity_t.squeeze(0).cpu().numpy()
    # A light median filter on *confidence* only — smoothing the pitch itself
    # would blur exactly the note transitions segmentation is trying to find.
    try:
        periodicity_smoothed = (
            torchcrepe.filter.median(torch.from_numpy(periodicity).unsqueeze(0), 3)
            .squeeze(0)
            .numpy()
        )
    except Exception:
        periodicity_smoothed = periodicity
    cents = hz_to_midi_cents(pitch_hz)
    frame_times = np.arange(len(pitch_hz)) * (hop_length / sr)
    pitch_wall = time.monotonic() - began

    say("stage", stage="finding onsets")
    level = envelope_of(mono)
    level_per = HOP / sr
    rise = rise_of(level, level_per)
    onset_columns = hits_of(rise, level_per)
    onset_times = sorted(t * level_per for t in onset_columns)

    say("stage", stage="segmenting notes")
    notes = drop_short(
        segment_notes(
            onset_times, seconds, frame_times, cents, periodicity_smoothed, level, level_per, args.confidence
        )
    )

    say("stage", stage="writing midi")
    args.out.mkdir(parents=True, exist_ok=True)
    pm = pretty_midi.PrettyMIDI()
    program = pretty_midi.instrument_name_to_program("Electric Bass (finger)")
    inst = pretty_midi.Instrument(program=program, name="Bass")
    for n in notes:
        if n["muted"] or n["pitch"] is None:
            continue
        inst.notes.append(
            pretty_midi.Note(
                velocity=n["velocity"],
                pitch=n["pitch"],
                start=n["start"],
                end=max(n["end"], n["start"] + 0.02),
            )
        )
    pm.instruments.append(inst)
    pm.write(str(args.out / "bass.mid"))

    pitched = [n for n in notes if not n["muted"]]
    voiced_frac = float((periodicity_smoothed >= args.confidence).mean()) if len(periodicity_smoothed) else 0.0

    say(
        "done",
        notes=notes,
        noteCount=len(notes),
        pitchedCount=len(pitched),
        mutedCount=len(notes) - len(pitched),
        voicedFraction=round(voiced_frac, 3),
        medianPeriodicity=round(float(np.median(periodicity_smoothed)), 3) if len(periodicity_smoothed) else 0.0,
        pitchRange=[min((n["pitch"] for n in pitched), default=None), max((n["pitch"] for n in pitched), default=None)],
        model=args.model,
        fmin=args.fmin,
        fmax=args.fmax,
        confidence=args.confidence,
        device=device,
        seconds=round(seconds, 2),
        wall=round(time.monotonic() - began, 2),
        pitchWall=round(pitch_wall, 2),
        file="bass.mid",
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as why:  # noqa: BLE001 — the parent renders this to a person
        say("failed", says=f"{type(why).__name__}: {why}")
        sys.exit(1)
