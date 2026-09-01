#!/usr/bin/env python
"""Score a separation against stems you actually have, instead of against a proxy.

Everything else in this workspace measures separations against each other, because no
reference exists. Given real stems, the questions stop being comparative: how much of the
voice came back, where exactly it was lost, and whether a dip on every hi-hat is the
record's compressor or the model's mistake.

Point it at a folder of reference stems and a folder of estimates, using the same
filenames:

    uv run truth.py --reference truth/song --estimate "separated/hybrid/song"
    uv run truth.py --reference truth/song --estimate "separated/api/song" --trigger drums

`--trigger` names the stem whose onsets to average around: with the true voice known, the
gain the model applied at each hit is a measurement rather than an inference.
"""

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf

N, HOP = 512, 128
BANDS = [(200, 800), (800, 3000), (3000, 6000), (6000, 16000)]


def read(path: Path) -> tuple[np.ndarray, int]:
    wav, sr = sf.read(path, dtype="float64", always_2d=True)
    return wav, sr


def chunked_sdr(ref: np.ndarray, est: np.ndarray, sr: int, seconds: float = 1.0) -> float:
    """The signal-to-distortion ratio used by the demixing challenges: computed per
    chunk and taken as a median, so one loud passage can't carry the score."""
    n = min(len(ref), len(est))
    ref, est = ref[:n], est[:n]
    size = int(seconds * sr)
    scores = []
    for start in range(0, n - size, size):
        r, e = ref[start:start + size], est[start:start + size]
        energy = (r ** 2).sum()
        if energy < 1e-9:
            continue                      # silence has no ratio worth reporting
        scores.append(10 * np.log10(energy / max(((r - e) ** 2).sum(), 1e-12)))
    return float(np.median(scores)) if scores else float("nan")


def spectrogram(x: np.ndarray) -> np.ndarray:
    m = x.mean(1)
    frames = 1 + (len(m) - N) // HOP
    S = np.lib.stride_tricks.as_strided(m, (frames, N), (m.strides[0] * HOP, m.strides[0]))
    return np.abs(np.fft.rfft(S * np.hanning(N), axis=1))


def band_gain(ref: np.ndarray, est: np.ndarray, sr: int) -> dict:
    """What the model did to each band, in dB, where the true stem is sounding. This is
    the honest version of `duck` — a gain against a known reference, not a correlation."""
    R, E = spectrogram(ref), spectrogram(est)
    n = min(len(R), len(E))
    freqs = np.fft.rfftfreq(N, 1 / sr)
    out = {}
    for lo, hi in BANDS:
        sel = (freqs >= lo) & (freqs < hi)
        r, e = R[:n, sel].sum(1), E[:n, sel].sum(1)
        live = r > np.percentile(r, 70)
        gain = 20 * np.log10(np.maximum(e[live], 1e-9) / np.maximum(r[live], 1e-9))
        out[(lo, hi)] = (float(np.median(gain)), float(np.percentile(gain, 5)))
    return out


def triggered_gain(ref: np.ndarray, est: np.ndarray, trigger: np.ndarray, sr: int,
                   lo: float = 6000, hi: float = 16000) -> tuple[np.ndarray, np.ndarray]:
    """The gain the model applied, averaged around every onset of the trigger stem. A
    compressor in the record cannot appear here: the reference carries it too, so it
    divides out. Whatever is left is the separation."""
    R, E, T = spectrogram(ref), spectrogram(est), spectrogram(trigger)
    n = min(len(R), len(E), len(T))
    freqs = np.fft.rfftfreq(N, 1 / sr)
    sel = (freqs >= lo) & (freqs < hi)
    r, e, t = R[:n, sel].sum(1), E[:n, sel].sum(1), T[:n, sel].sum(1)
    gain = 20 * np.log10(np.maximum(e, 1e-9) / np.maximum(r, 1e-9))
    gain[r < np.percentile(r, 40)] = np.nan        # no voice, no gain worth reading

    rate = sr / HOP
    thr = np.percentile(t, 80)
    onsets = [i for i in range(1, n) if t[i] > thr and t[i - 1] <= thr]
    onsets = [o for i, o in enumerate(onsets) if i == 0 or o - onsets[i - 1] > 0.07 * rate]
    pre, post = int(0.05 * rate), int(0.28 * rate)
    segs = [gain[o - pre:o + post] for o in onsets if o - pre >= 0 and o + post < n]
    curve = np.nanmean(np.array(segs), axis=0)
    return (np.arange(pre + post) - pre) / rate, curve - np.nanmean(curve[:pre])


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reference", type=Path, required=True, help="folder of true stems")
    p.add_argument("--estimate", type=Path, required=True, help="folder of separated stems")
    p.add_argument("--stems", nargs="+", default=None, help="which to score; default is all that match")
    p.add_argument("--trigger", default=None, help="stem whose onsets to average the gain around")
    args = p.parse_args()

    names = args.stems or sorted(
        f.stem for f in args.reference.glob("*.wav") if (args.estimate / f.name).exists()
    )
    if not names:
        raise SystemExit(f"no stems in common between {args.reference} and {args.estimate}")

    label = lambda lo, hi: f"{lo/1000:g}-{hi/1000:g}k"
    print(f"{'stem':<14} {'SDR':>7} {'side SDR':>9}   " +
          " ".join(label(lo, hi).rjust(11) for lo, hi in BANDS))
    print(f"{'':14} {'':>7} {'':>9}   " + " ".join("med / worst".rjust(11) for _ in BANDS))
    for name in names:
        ref, sr = read(args.reference / f"{name}.wav")
        est, _ = read(args.estimate / f"{name}.wav")
        n = min(len(ref), len(est))
        ref, est = ref[:n], est[:n]
        sdr = chunked_sdr(ref.mean(1), est.mean(1), sr)
        side = chunked_sdr((ref[:, 0] - ref[:, 1]) / 2, (est[:, 0] - est[:, 1]) / 2, sr)
        gains = band_gain(ref, est, sr)
        cells = " ".join(f"{m:+5.1f}/{w:+5.1f}" for m, w in gains.values())
        print(f"{name:<14} {sdr:>6.1f}dB {side:>8.1f}dB   {cells}")

    if args.trigger:
        ref, sr = read(args.reference / "vocals.wav")
        est, _ = read(args.estimate / "vocals.wav")
        trig, _ = read(args.reference / f"{args.trigger}.wav")
        t, curve = triggered_gain(ref, est, trig, sr)
        print(f"\ngain applied to the voice's 6-16 kHz around every {args.trigger} onset, dB")
        marks = [0, 0.01, 0.03, 0.06, 0.09, 0.12, 0.18, 0.25]
        print("  " + "".join(f"{m*1000:>8.0f}" for m in marks) + "  ms")
        print("  " + "".join(f"{curve[np.argmin(np.abs(t-m))]:>+8.1f}" for m in marks))
        print("\n  A flat line means the model left the voice alone and whatever pumping you")
        print("  hear was printed in the stem. A dip is the separator's, and this is its depth.")


if __name__ == "__main__":
    main()
