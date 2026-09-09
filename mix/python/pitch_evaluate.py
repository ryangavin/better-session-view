"""Reproducible bass-pitch baseline, or evaluation against an independent reference.

python pitch_evaluate.py --suite --out /tmp/bass-pitch
python pitch_evaluate.py --input bass.wav --reference reference.json --out /tmp/real-bass

The suite is generated audio with exact oscillator truth, not real bass ground truth.
Reference JSON uses sourceHash, provenance, kind and frames [{time, hz}]. Zero Hz is
unvoiced; null is unannotated. The same file imports in the app's Bass pitch lab.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from pitch_map import file_hash


def evaluate(held, reference):
    if reference["sourceHash"] != held["source"]["hash"]:
        raise ValueError("reference and analyzed source hashes differ")
    voiced = unvoiced = detected = false_voiced = correct = octave = 0
    errors = []
    by_confidence = [{"from": lo, "to": lo + 0.2, "frames": 0, "correct50": 0} for lo in [0, .2, .4, .6, .8]]
    previous = -1
    for f in reference["frames"]:
        time, truth = f["time"], f["hz"]
        if not np.isfinite(time) or time <= previous or (truth is not None and (not np.isfinite(truth) or truth < 0)):
            raise ValueError("reference frames must be finite and strictly increasing")
        previous = time
        if truth is None or time < 0 or time >= held["seconds"]:
            continue
        i = int(np.floor(time / held["step"] + .5))
        if i >= len(held["hz"]):
            continue
        estimated = held["state"][i] == "voiced" and held["hz"][i] is not None
        if truth == 0:
            unvoiced += 1
            false_voiced += int(estimated)
            continue
        voiced += 1
        if not estimated:
            continue
        detected += 1
        cents = abs(1200 * np.log2(held["hz"][i] / truth))
        errors.append(float(cents))
        correct += int(cents <= 50)
        octave += int(round(cents / 1200) >= 1 and abs(cents - round(cents / 1200) * 1200) <= 50)
        b = by_confidence[min(4, max(0, int((held["smoothedPeriodicity"][i] or 0) * 5)))]
        b["frames"] += 1
        b["correct50"] += int(cents <= 50)
    return {"voicedReferenceFrames": voiced, "unvoicedReferenceFrames": unvoiced,
            "detectedVoicedFrames": detected, "falseVoicedFrames": false_voiced,
            "correct50Cents": correct, "octaveErrors": octave,
            "medianAbsoluteCentsJointlyVoiced": float(np.median(errors)) if errors else None,
            "p95AbsoluteCentsJointlyVoiced": float(np.percentile(errors, 95)) if errors else None,
            "periodicityBins": by_confidence}


def suite(out):
    import soundfile as sf
    sr, duration = 16000, 4.0
    t = np.arange(int(sr * duration)) / sr
    active = (t >= .4) & (t < 3.6)
    envelope = np.minimum(1, np.maximum(0, (t - .4) / .02)) * np.minimum(1, np.maximum(0, (3.6 - t) / .02))
    midi = np.full_like(t, 40.0)
    cases = [
        ("E1-harmonics", np.full_like(t, 28.), [1, .5, .25]),
        ("B0-below-model-floor", np.full_like(t, 23.), [1, .5, .25]),
        ("missing-fundamental", midi, [0, 1, .5, .25]),
        ("detuned-23-cents", midi + .23, [1, .5, .25]),
        ("slide-one-octave", 28 + 12 * np.clip((t - .4) / 3.2, 0, 1), [1, .5, .25]),
        ("legato-step", np.where(t < 2, 33., 40.), [1, .5, .25]),
        ("vibrato", midi + .35 * np.sin(2 * np.pi * 5 * t), [1, .5, .25]),
        ("distorted-bass", midi, [1, .5, .25]),
        ("noise-unvoiced", midi, []),
        ("silence", midi, []),
    ]
    results = []
    for name, pitches, harmonics in cases:
        hz = 440 * 2 ** ((pitches - 69) / 12)
        phase = 2 * np.pi * np.cumsum(hz) / sr
        signal = sum((weight * np.sin((i + 1) * phase) for i, weight in enumerate(harmonics)), np.zeros_like(t))
        if name == "distorted-bass": signal = np.tanh(4 * signal)
        if name == "noise-unvoiced": signal = np.random.default_rng(0).normal(0, .3, len(t))
        signal = .3 * signal / max(1, float(np.max(np.abs(signal)))) * envelope
        file = out / f"{name}.wav"
        sf.write(file, signal, sr, subtype="FLOAT")
        frames = [{"time": round(i / sr, 5), "hz": float(hz[i]) if active[i] and harmonics else 0} for i in range(0, len(t), 160)]
        reference = {"sourceHash": file_hash(file), "provenance": f"pitch_evaluate.py deterministic oscillator suite v1: {name}", "kind": "synthetic", "frames": frames}
        ref = out / f"{name}.reference.json"
        ref.write_text(json.dumps(reference))
        results.append((file, ref))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", action="store_true")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    if not args.suite and not (args.input and args.reference): parser.error("use --suite or --input and --reference")
    args.out.mkdir(parents=True, exist_ok=True)
    cases = suite(args.out) if args.suite else [(args.input.resolve(), args.reference.resolve())]
    results = []
    for source, ref in cases:
        dest = args.out / source.stem
        cached = dest / "pitch-map.json"
        if not cached.exists():
            command = [sys.executable, str(Path(__file__).with_name("transcribe.py").resolve()),
                       "--input", str(source.resolve()), "--out", str(dest.resolve()), "--device", args.device]
            ran = subprocess.run(command, capture_output=True, text=True, cwd=Path(__file__).parent)
            if ran.returncode: raise RuntimeError(ran.stdout + ran.stderr)
            (dest / "worker.jsonl").write_text(ran.stdout)
        held = json.loads(cached.read_text())
        reference = json.loads(ref.read_text())
        if held["source"]["hash"] != file_hash(source): raise ValueError("stale cached audio; use a fresh output directory")
        result = {"case": source.stem, "truth": reference["kind"], "sourceHash": held["source"]["hash"],
                  "engine": held["engine"], "metrics": evaluate(held, reference)}
        # Report boundary zones separately; sustained-note scores must not hide transitions.
        if source.stem in ["legato-step", "E1-harmonics"]:
            centres = [2.0] if source.stem == "legato-step" else [.4, 3.6]
            boundary = {**reference, "frames": [f for f in reference["frames"] if any(abs(f["time"] - c) <= .1 for c in centres)]}
            result["boundary100ms"] = evaluate(held, boundary)
        results.append(result)
        print(json.dumps(result), flush=True)
    (args.out / "report.json").write_text(json.dumps({"suite": "oscillator-v1" if args.suite else "external-reference", "results": results}, indent=2))


if __name__ == "__main__": main()
