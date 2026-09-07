import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUDIO_DEFAULTS, prepareAudioContexts, readAudioSettings, saveAudioSettings } from './audioSettings.ts';
const made: Context[] = [];
class Context {
  sampleRate: number;
  close = vi.fn(async () => {});
  async setSinkId(id: string) { if (id === 'missing') throw new Error('Device unavailable'); }
  constructor(readonly options: AudioContextOptions) { this.sampleRate = options.sampleRate ?? 44100; made.push(this); }
}
beforeEach(() => { const values = new Map<string,string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key,value) }); });
afterEach(() => { vi.unstubAllGlobals(); made.length = 0; });
it('remembers only supported machine-local preferences and tolerates damaged storage', () => {
  expect(readAudioSettings()).toEqual(AUDIO_DEFAULTS);
  const settings = { deviceId: 'interface', sampleRate: 48000, latency: 'balanced' as const };
  saveAudioSettings(settings); expect(readAudioSettings()).toEqual(settings);
  localStorage.setItem('mix.audio.v1', '{broken'); expect(readAudioSettings()).toEqual(AUDIO_DEFAULTS);
  localStorage.setItem('mix.audio.v1', JSON.stringify({ ...settings, sampleRate: -1 })); expect(readAudioSettings()).toEqual(AUDIO_DEFAULTS);
});
it('prepares both engines on the requested device and rate before returning either', async () => {
  vi.stubGlobal('AudioContext', Context);
  const pair = await prepareAudioContexts({ deviceId: 'interface', sampleRate: 96000, latency: 'playback' });
  expect(pair).toHaveLength(2);
  for (const context of made) {
    expect(context.options).toMatchObject({ sampleRate: 96000, latencyHint: 'playback', sinkId: 'interface' });
    expect(context.close).not.toHaveBeenCalled();
  }
});
it('closes staged contexts when the output fails, leaving live engines untouched', async () => {
  vi.stubGlobal('AudioContext', Context);
  await expect(prepareAudioContexts({ ...AUDIO_DEFAULTS, deviceId: 'missing' })).rejects.toThrow('Device unavailable');
  expect(made[0].close).toHaveBeenCalledOnce();
});
it('rejects explicit output selection on unsupported hosts instead of silently routing elsewhere', async () => {
  vi.stubGlobal('AudioContext', class {});
  await expect(prepareAudioContexts({ ...AUDIO_DEFAULTS, deviceId: 'interface' })).rejects.toThrow('cannot select');
});
it('closes both staged contexts if the second engine cannot use the requested rate', async () => {
  vi.stubGlobal('AudioContext', class extends Context {
    constructor(options: AudioContextOptions) { super(options); if (made.length === 2) this.sampleRate = 44100; }
  });
  await expect(prepareAudioContexts({ ...AUDIO_DEFAULTS, sampleRate: 48000 })).rejects.toThrow('sample rate is unavailable');
  expect(made).toHaveLength(2); expect(made.every(context => context.close.mock.calls.length === 1)).toBe(true);
});
