import type { LinkClock } from './linkAudioTypes.ts';

/** The SDK timeline correlated to Web Audio's hardware presentation clock. */
export interface LinkTimeline extends LinkClock { contextTime: number }
export const linkBeatAt = (timeline: LinkTimeline, contextTime: number): number =>
  timeline.beat + (contextTime - timeline.contextTime) * timeline.tempo / 60;
export const linkTimeAt = (timeline: LinkTimeline, beat: number): number =>
  timeline.contextTime + (beat - timeline.beat) * 60 / timeline.tempo;
export const linkMicrosAt = (timeline: LinkTimeline, contextTime: number): number =>
  Math.round(timeline.micros + (contextTime - timeline.contextTime) * 1e6);

/** Ignore capture-clock noise; corrections smaller than 3ms are not musical drift. */
export function needsLinkCorrection(actual: number, expected: number, tempoChanged: boolean): boolean {
  return tempoChanged || Math.abs(actual - expected) > 0.003;
}
