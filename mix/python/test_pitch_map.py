import unittest
import numpy as np
from pitch_map import make_map, frame_step
from pitch_evaluate import evaluate


class PitchMapTests(unittest.TestCase):
    def test_preserves_motion_and_rejected_values_with_explicit_silence(self):
        mono = np.ones(1600, dtype=np.float32)
        hz = np.linspace(41.2, 50, 11)
        confidence = np.full(11, .9)
        confidence[4] = .1
        held = make_map(mono, 16000, 160, hz, confidence, confidence, .21)
        self.assertEqual(len(held['hz']), 10)  # padded endpoint is not source audio
        self.assertEqual(held['hz'][4], hz[4])
        self.assertEqual(held['state'][4], 'unvoiced')
        silent = make_map(mono * 0, 16000, 160, hz, confidence, confidence, .21)
        self.assertEqual(set(silent['state']), {'silent'})

    def test_uses_actual_resampled_clock(self):
        self.assertEqual(frame_step(22050, 220), 159 / 16000)

    def test_separates_octave_voicing_and_unknown_reference(self):
        held = {'source': {'hash': 'abc'}, 'seconds': .04, 'step': .01,
                'hz': [110, 55, 55, 55], 'state': ['voiced', 'unvoiced', 'voiced', 'voiced'],
                'smoothedPeriodicity': [.9] * 4}
        ref = {'sourceHash': 'abc', 'frames': [{'time': i * .01, 'hz': hz} for i, hz in enumerate([55, 55, 0, None])]}
        score = evaluate(held, ref)
        self.assertEqual(score['octaveErrors'], 1)
        self.assertEqual(score['falseVoicedFrames'], 1)
        self.assertEqual(score['voicedReferenceFrames'], 2)
        self.assertEqual(score['detectedVoicedFrames'], 1)


if __name__ == '__main__': unittest.main()
