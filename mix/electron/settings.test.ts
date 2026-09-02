import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { patchSettings, readSettings } from './settings.ts';

describe('settings', () => {
  let folder = '';
  const file = () => path.join(folder, 'settings.json');

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-settings-'));
  });
  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it('reads nothing at all as nothing set, rather than throwing', async () => {
    expect(await readSettings(file())).toEqual({});
  });

  it('reads a file that is not JSON as nothing set', async () => {
    await fs.writeFile(file(), 'not json');
    expect(await readSettings(file())).toEqual({});
  });

  it('keeps the other keys when one is written', async () => {
    await patchSettings(file(), { library: '/music/library' });
    await patchSettings(file(), { exports: '/music/mixflow' });
    expect(await readSettings(file())).toEqual({
      library: '/music/library',
      exports: '/music/mixflow',
    });
  });

  it('overwrites the key it is given', async () => {
    await patchSettings(file(), { library: '/one' });
    const after = await patchSettings(file(), { library: '/two' });
    expect(after.library).toBe('/two');
  });
});
