import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUDIO_DEFAULTS, outputPairs, pairLabel, pairReach, prepareAudioContexts, readAudioSettings, saveAudioSettings } from './audioSettings.ts';
const made: Context[] = [];
class Context {
  sampleRate: number;
  close = vi.fn(async () => {});
  async setSinkId(id: string) { if (id === 'missing') throw new Error('Device unavailable'); }
  constructor(readonly options: AudioContextOptions) { this.sampleRate = options.sampleRate ?? 44100; made.push(this); }
}
beforeEach(() => { const values = new Map<string,string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key,value) }); });
afterEach(() => { vi.unstubAllGlobals(); made.length = 0; });
it('remembers valid machine-local preferences and tolerates damaged storage', () => {
  expect(readAudioSettings()).toEqual(AUDIO_DEFAULTS);
  const settings = { deviceId: 'interface', sampleRate: 48000, latency: 'balanced' as const, mainPair: 6, cuePair: 5 };
  saveAudioSettings(settings); expect(readAudioSettings()).toEqual(settings);
  // A store written before the pairs existed keeps its device and rate.
  localStorage.setItem('mix.audio.v1', JSON.stringify({ deviceId: 'interface', sampleRate: 48000, latency: 'balanced' }));
  expect(readAudioSettings()).toEqual({ ...settings, mainPair: AUDIO_DEFAULTS.mainPair, cuePair: AUDIO_DEFAULTS.cuePair });
  localStorage.setItem('mix.audio.v1', JSON.stringify({ ...settings, mainPair: -1 }));
  expect(readAudioSettings().mainPair).toBe(AUDIO_DEFAULTS.mainPair);
  localStorage.setItem('mix.audio.v1', '{broken'); expect(readAudioSettings()).toEqual(AUDIO_DEFAULTS);
  localStorage.setItem('mix.audio.v1', JSON.stringify({ ...settings, sampleRate: -1 })); expect(readAudioSettings()).toEqual(AUDIO_DEFAULTS);
});
it('retains rates supplied by a driver beyond the old fixed list', () => {
  for (const sampleRate of [32000, 176400, 192000, 768000]) {
    saveAudioSettings({...AUDIO_DEFAULTS, sampleRate});
    expect(readAudioSettings().sampleRate).toBe(sampleRate);
  }
});
it('prepares both engines on the requested device and rate before returning either', async () => {
  vi.stubGlobal('AudioContext', Context);
  const pair = await prepareAudioContexts({ ...AUDIO_DEFAULTS, deviceId: 'interface', sampleRate: 96000, latency: 'playback' });
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
it('counts stereo pairs an interface can carry and labels them as its outputs are', () => {
  expect(outputPairs(2)).toEqual([0]);
  expect(outputPairs(16)).toHaveLength(8);
  expect(outputPairs(0)).toEqual([]);
  expect(outputPairs(3)).toEqual([0]);
  expect(pairLabel(0)).toBe('1/2');
  expect(pairLabel(6)).toBe('13/14');
  expect(pairLabel(7)).toBe('15/16');
  expect(pairReach(6)).toBe(14);
  expect(outputPairs(16).map(pairLabel).at(-1)).toBe('15/16');
});
