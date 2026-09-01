"""Fast checks for the note-boundary logic; no model download is involved."""

import unittest

import numpy as np

from transcribe import hits_of, segment_notes


class OnsetTests(unittest.TestCase):
    def test_nearby_attack_peaks_collapse_to_the_strongest(self) -> None:
        rise = np.zeros(30)
        rise[5] = 0.7
        rise[8] = 1.0
        rise[20] = 0.5

        hits = hits_of(rise, 0.01)

        self.assertEqual([round(hit) for hit in hits], [8, 20])


class SegmentTests(unittest.TestCase):
    def fixture(self, voiced: bool) -> list[dict]:
        frame_times = np.arange(0, 2, 0.01)
        periodicity = np.zeros_like(frame_times)
        if voiced:
            periodicity[3:20] = 0.9
        level = np.zeros(200)
        level[:20] = 1.0
        return segment_notes(
            [0.0],
            2.0,
            frame_times,
            np.full_like(frame_times, 4000.0),
            periodicity,
            level,
            0.01,
            0.21,
        )

    def test_silence_after_a_pitched_attack_does_not_extend_the_note(self) -> None:
        notes = self.fixture(voiced=True)
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["pitch"], 40)
        self.assertLessEqual(notes[0]["end"], 0.21)

    def test_silence_after_an_unpitched_attack_does_not_become_a_long_mute(self) -> None:
        notes = self.fixture(voiced=False)
        self.assertEqual(len(notes), 1)
        self.assertTrue(notes[0]["muted"])
        self.assertLessEqual(notes[0]["end"], 0.21)


if __name__ == "__main__":
    unittest.main()
