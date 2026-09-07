/** Shared, machine-local output preferences for Prep and Play. */
export interface AudioSettings {
  deviceId: string;
  sampleRate: number;
  latency: AudioContextLatencyCategory;
}
export const AUDIO_DEFAULTS: AudioSettings = { deviceId: '', sampleRate: 0, latency: 'interactive' };
export const validSampleRate = (rate: unknown): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0;
const KEY = 'mix.audio.v1';
type OutputContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };
export function readAudioSettings(): AudioSettings {
  try {
    const held = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!held || typeof held.deviceId !== 'string' || !validSampleRate(held.sampleRate) || !['interactive','balanced','playback'].includes(held.latency)) return {...AUDIO_DEFAULTS};
    return {deviceId:held.deviceId,sampleRate:held.sampleRate,latency:held.latency};
  } catch { return {...AUDIO_DEFAULTS}; }
}
export function saveAudioSettings(settings: AudioSettings) { localStorage.setItem(KEY,JSON.stringify(settings)); }
export function createAudioContext(settings = readAudioSettings()): AudioContext {
  if (settings.deviceId && typeof (AudioContext.prototype as OutputContext).setSinkId !== 'function') throw new Error('This browser cannot select an audio output. Choose System default in Settings.');
  const options: AudioContextOptions & { sinkId: string } = {latencyHint:settings.latency,...(settings.sampleRate ? {sampleRate:settings.sampleRate} : {}),sinkId:settings.deviceId};
  return new AudioContext(options);
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
