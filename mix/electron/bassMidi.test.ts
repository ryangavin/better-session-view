import { expect, it } from 'vitest';
import { validMidiNote, BassMidiService } from './bassMidi.ts';

it('limits the native boundary to three-byte note messages', () => {
  expect(validMidiNote([0x90, 36, 100])).toBe(true);
  expect(validMidiNote([0x8f, 127, 0])).toBe(true);
  for (const value of [[0xb0, 123, 0], [0xf0, 1, 0xf7], [0x90, 128, 1], [0x90, 1, NaN], [0x90, 1], null]) expect(validMidiNote(value)).toBe(false);
});
it('rejects malformed events and stale owners without opening a port', async () => {
  const service = new BassMidiService('/not-started');
  await expect(service.send('stale', [0x90, 30, 90], Date.now())).rejects.toThrow('closed');
  await expect(service.send('stale', [0xb0, 30, 90], Date.now())).rejects.toThrow('Invalid');
  await expect(service.send('stale', [0x90, 30, 90], Date.now() + 700000)).rejects.toThrow('ahead');
  await expect(service.ping('stale')).rejects.toThrow('closed');
  await service.close('stale'); service.stop();
});
