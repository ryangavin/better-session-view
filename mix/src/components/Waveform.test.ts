import { describe, expect, it } from 'vitest';
import { drawingOf } from './Waveform.tsx';

/**
 * The handover is the part of a zoom that can go wrong quietly.
 *
 * Get it late and the lane is a picture being enlarged — a waveform that grows
 * blockier the closer you look, which reads as the separation having lost the
 * detail rather than the drawing having run out of it. Get it early and every
 * wheel tick walks millions of samples in six lanes.
 */

/** A four-minute stem at 44.1 kHz, drawn into a lane about 900px wide. */
const SAMPLES = 240 * 44100;
const COLUMNS = 9000;
const LANE = 900;

/** The fraction of the track on screen at a given zoom. */
const span = (zoom: number) => 1 / zoom;

describe('which drawing a lane earns', () => {
  it('draws peaks for the whole track', () => {
    expect(drawingOf(COLUMNS, SAMPLES, 1, LANE)).toBe('peaks');
  });

  it('is still peaks while a column of them is finer than a pixel', () => {
    // 9000 columns across a 900px lane is ten times before a column is wider
    // than a pixel, and up to there the peaks are an exact summary of what is
    // on screen.
    expect(drawingOf(COLUMNS, SAMPLES, span(9), LANE)).toBe('peaks');
  });

  it('goes to the audio itself as soon as they are not', () => {
    expect(drawingOf(COLUMNS, SAMPLES, span(11), LANE)).toBe('envelope');
  });

  it('draws the sample points once there are fewer of them than pixels', () => {
    // The bottom of the zoom: a couple of hundred samples across the lane.
    expect(drawingOf(COLUMNS, SAMPLES, 192 / SAMPLES, LANE)).toBe('points');
  });

  it('stays an envelope while there is still something to summarise', () => {
    // A couple of samples to a pixel is the last view where a column means
    // anything; below that a summary is summarising one number.
    expect(drawingOf(COLUMNS, SAMPLES, (LANE * 2.5) / SAMPLES, LANE)).toBe('envelope');
    expect(drawingOf(COLUMNS, SAMPLES, (LANE * 1.5) / SAMPLES, LANE)).toBe('points');
  });
});

describe('when there is nothing to hand over to', () => {
  it('draws peaks at any depth without audio', () => {
    // The stems decode a moment after the manifest is read, and a lane that
    // demanded samples in that window would draw nothing at all.
    expect(drawingOf(COLUMNS, 0, span(1000), LANE)).toBe('peaks');
  });

  it('goes straight to the audio when there are no peaks yet', () => {
    expect(drawingOf(0, SAMPLES, 1, LANE)).toBe('envelope');
  });

  it('answers for a lane with nothing in it at all', () => {
    // No peaks and no audio is the state between opening a track and its stems
    // being decoded, and the answer has to be the drawing that copes with
    // having no data rather than the one that indexes into it.
    expect(drawingOf(0, 0, 1, LANE)).toBe('peaks');
  });

  it('answers for a lane that has not been laid out', () => {
    expect(drawingOf(COLUMNS, SAMPLES, 1, 0)).toBe('peaks');
  });
});
