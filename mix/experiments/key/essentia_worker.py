"""Local experiment, consumes the same decoded mono 44.1kHz float32 as libkeyfinder."""
import sys, json
import essentia
if len(sys.argv) == 2 and sys.argv[1] == '--version':
    from importlib.metadata import version
    print(version('essentia'))
else:
    import numpy as np
    from essentia.standard import KeyExtractor
    audio = np.fromfile(sys.argv[1], dtype='<f4')
    if not audio.size or not np.isfinite(audio).all():
        raise ValueError('Empty or non-finite PCM')
    if np.max(np.abs(audio)) < 1e-8:
        print(json.dumps({'label': 'Unknown', 'score': None}))
    else:
        key, scale, strength = KeyExtractor(sampleRate=44100, profileType='bgate', frameSize=4096, hopSize=4096, hpcpSize=12)(audio)
        print(json.dumps({'label': key + ' ' + scale, 'score': float(strength)}, allow_nan=False))
