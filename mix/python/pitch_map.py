"""Continuous evidence from bass inference, independent of instrument and note layout.

No pitch is snapped or corrected here. A rejected estimate is retained as evidence,
not presented as a voiced fundamental. Periodicity is not a probability of accuracy.
"""

import hashlib
import json
from pathlib import Path

import numpy as np

FORMAT = 1
FILE = "pitch-map.json"
SILENCE_DB = -60.0


def file_hash(file: Path) -> str:
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def frame_step(sample_rate: int, hop_length: int) -> float:
    """torchcrepe preprocess truncates the hop after resampling to 16 kHz."""
    return int(hop_length * 16000 / sample_rate) / 16000


def make_map(mono, sample_rate, hop_length, hz, periodicity, smoothed, threshold):
    step = frame_step(sample_rate, hop_length)
    if step <= 0 or len(hz) != len(periodicity) or len(hz) != len(smoothed):
        raise ValueError("invalid pitch frame clock or array lengths")
    duration = len(mono) / sample_rate
    # pad=True centers the first 64 ms model window on sample zero. Do not
    # keep a padded endpoint at or beyond the source's end.
    times = np.arange(len(hz)) * step
    keep = times < duration
    times, hz, periodicity, smoothed = times[keep], hz[keep], periodicity[keep], smoothed[keep]
    centres = np.rint(times * sample_rate).astype(int)
    half = round(0.032 * sample_rate)
    lo, hi = np.maximum(0, centres - half), np.minimum(len(mono), centres + half)
    energy = np.concatenate(([0.0], np.cumsum(np.square(mono, dtype=np.float64))))
    rms = np.sqrt(np.maximum(0, energy[hi] - energy[lo]) / np.maximum(1, hi - lo))
    db = 20 * np.log10(np.maximum(rms, 1e-12))
    finite = np.isfinite(hz) & (hz > 0) & np.isfinite(periodicity) & np.isfinite(smoothed)
    state = np.full(len(hz), "unvoiced", dtype=object)
    state[finite & (smoothed >= threshold)] = "voiced"
    state[db < SILENCE_DB] = "silent"
    state[~finite] = "invalid"

    def values(array):
        return [float(v) if np.isfinite(v) else None for v in array]

    return {
        "openflow": "mix-pitch-map", "version": FORMAT,
        "seconds": duration, "sampleRate": sample_rate,
        "start": 0, "step": step, "windowSeconds": 0.064,
        "policy": {"periodicityFloor": threshold, "silenceDb": SILENCE_DB},
        "hz": values(hz), "periodicity": values(periodicity),
        "smoothedPeriodicity": values(smoothed), "rmsDb": values(db),
        "state": state.tolist(),
    }


def save_map(out, source, source_hash, engine, **frames):
    held = make_map(**frames)
    held.update(source={"hash": source_hash or file_hash(source), "bytes": source.stat().st_size}, engine=engine)
    body = json.dumps(held, separators=(",", ":"), allow_nan=False).encode()
    out.mkdir(parents=True, exist_ok=True)
    (out / FILE).write_bytes(body)
    return {"file": FILE, "version": FORMAT, "frames": len(held["hz"]),
            "sha256": hashlib.sha256(body).hexdigest()}
