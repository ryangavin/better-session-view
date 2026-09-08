/** Shared, machine-local output preferences for Prep and Play. */
export interface AudioSettings {
  deviceId: string;
  sampleRate: number;
  latency: AudioContextLatencyCategory;
  /**
   * Which stereo pair carries the mix, and which carries the headphone cue,
   * counted in pairs from zero: 0 is outputs 1/2, 6 is 13/14.
   *
   * Pairs rather than channels because both destinations are stereo and a
   * mixer's outputs are labelled in pairs. An interface with more than four
   * outputs has no convention about which pair is the booth, so the choice
   * belongs to the person in front of it rather than to this file.
   */
  mainPair: number;
  cuePair: number;
}
export const AUDIO_DEFAULTS: AudioSettings = { deviceId: '', sampleRate: 0, latency: 'interactive', mainPair: 0, cuePair: 1 };
/** Every stereo pair an output of this width can carry, as pair indices. */
export const outputPairs = (channels: number): number[] => Array.from({ length: Math.max(0, Math.floor(channels / 2)) }, (_, pair) => pair);
/** How a pair is labelled on the back of an interface: pair 6 is `13/14`. */
export const pairLabel = (pair: number): string => `${pair * 2 + 1}/${pair * 2 + 2}`;
/** The channel count a pair needs the destination to carry. */
export const pairReach = (pair: number): number => pair * 2 + 2;
const validPair = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 128;
export const validSampleRate = (rate: unknown): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0;
const KEY = 'mix.audio.v1';
type OutputContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };
export function readAudioSettings(): AudioSettings {
  try {
    const held = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!held || typeof held.deviceId !== 'string' || !validSampleRate(held.sampleRate) || !['interactive','balanced','playback'].includes(held.latency)) return {...AUDIO_DEFAULTS};
    // Pairs arrived after the first stores; one written without them keeps the rest.
    const mainPair = validPair(held.mainPair) ? held.mainPair : AUDIO_DEFAULTS.mainPair;
    const cuePair = validPair(held.cuePair) ? held.cuePair : AUDIO_DEFAULTS.cuePair;
    return {deviceId:held.deviceId,sampleRate:held.sampleRate,latency:held.latency,mainPair,cuePair};
  } catch { return {...AUDIO_DEFAULTS}; }
}
export function saveAudioSettings(settings: AudioSettings) { localStorage.setItem(KEY,JSON.stringify(settings)); }
export function createAudioContext(settings = readAudioSettings()): AudioContext {
  if (settings.deviceId && typeof (AudioContext.prototype as OutputContext).setSinkId !== 'function') throw new Error('This browser cannot select an audio output. Choose System default in Settings.');
  const options: AudioContextOptions & { sinkId: string } = {latencyHint:settings.latency,...(settings.sampleRate ? {sampleRate:settings.sampleRate} : {}),sinkId:settings.deviceId};
  return new AudioContext(options);
}
/**
 * How many output channels the chosen device actually has.
 *
 * `maxChannelCount` describes the device a context was *opened on*, and the
 * running context was opened on whatever was default at the time — so asking it
 * about a device the person has only just picked answers about the old one.
 * A throwaway context, opened on the candidate and closed straight away, is the
 * only way to know before Apply. It never starts a source and stays suspended.
 */
export async function probeOutputChannels(settings: AudioSettings): Promise<number> {
  const ctx = createAudioContext({ ...settings, sampleRate: 0 }) as OutputContext;
  try {
    if (ctx.setSinkId) await ctx.setSinkId(settings.deviceId);
    return ctx.destination.maxChannelCount;
  } finally { await ctx.close().catch(() => {}); }
}
/** Validate the device before changing either live graph. Never starts a source. */
export async function prepareAudioContexts(settings: AudioSettings): Promise<[AudioContext,AudioContext]> {
  const made: AudioContext[]=[];
  try {
    for (let i=0;i<2;i++) {
      const ctx=createAudioContext(settings) as OutputContext;made.push(ctx);
      if (ctx.setSinkId) await ctx.setSinkId(settings.deviceId);
      if (settings.sampleRate && ctx.sampleRate !== settings.sampleRate) throw new Error('The requested sample rate is unavailable.');
    }
    return made as [AudioContext,AudioContext];
  } catch (error) { await Promise.all(made.map(ctx=>ctx.close().catch(()=>{})));throw error; }
}
