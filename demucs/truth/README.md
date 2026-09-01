# Reference stems go here

One folder per song, one wav per stem, named as the separators name them:

    truth/<song>/vocals.wav
    truth/<song>/drums.wav
    truth/<song>/bass.wav
    truth/<song>/other.wav

Then build the mix by summing them here rather than bouncing it from the DAW, so the
mixture is exactly the sum of the references and the ground truth is exact:

    uv run python -c "
    import soundfile as sf, numpy as np, sys
    from pathlib import Path
    d = Path(sys.argv[1]); stems = sorted(d.glob('*.wav'))
    xs = [sf.read(f, dtype='float32', always_2d=True)[0] for f in stems]
    n = min(map(len, xs)); sr = sf.info(stems[0]).samplerate
    sf.write(d/'mixture.wav', sum(x[:n] for x in xs), sr, subtype='FLOAT')
    " "truth/<song>"

Then separate `mixture.wav` and score it:

    uv run hybrid.py "truth/<song>/mixture.wav"
    uv run truth.py --reference "truth/<song>" --estimate "separated/hybrid/mixture" --trigger drums
