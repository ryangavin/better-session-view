import { describe, expect, it } from 'vitest';
import { linkBeatAt, linkMicrosAt, linkTimeAt, needsLinkCorrection, type LinkTimeline } from './linkTiming.ts';

const timeline: LinkTimeline = { token: 1, micros: 2000000, contextTime: 10, tempo: 120,
  beat: -1.5, peers: 1, playing: false, playingMicros: 0, startMicros: 0 };
describe('Link clock mapping', () => {
  it('maps pickup beats and scheduled starts through the hardware clock in both directions', () => {
    expect(linkTimeAt(timeline, 0)).toBe(10.75);
    expect(linkBeatAt(timeline, 10.75)).toBe(0);
    expect(linkMicrosAt(timeline, 10.75)).toBe(2750000);
  });
  it('uses the new shared slope after tempo changes, including the full Link tempo range', () => {
    for (const tempo of [20, 137.35, 999]) {
      const changed = { ...timeline, tempo };
      expect(linkBeatAt(changed, linkTimeAt(changed, 8))).toBeCloseTo(8, 10);
    }
  });
  it('corrects a late tempo update without chasing insignificant clock noise', () => {
    expect(needsLinkCorrection(10, 10.002, false)).toBe(false);
    expect(needsLinkCorrection(10, 10.008, false)).toBe(true);
    expect(needsLinkCorrection(10, 10, true)).toBe(true);
  });
});
