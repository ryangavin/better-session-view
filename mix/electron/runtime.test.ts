import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { lastLine, places, ready, stageOf, stampOf, workerEnv } from './runtime.ts';

/**
 * What this protects is the decision to build an environment on somebody's
 * machine rather than ship one.
 *
 * The failure it is guarding against is not a crash. It is a build that decides
 * its environment is fine when it is a version behind — a torch that no longer
 * matches the worker, discovered as a stack trace in the middle of a
 * separation — or one that decides it is stale every time and reinstalls a
 * gigabyte on every launch.
 */

/**
 * What a bundle carries, from where a spec sits rather than from where esbuild
 * puts the main process. It is the same `mix/python/` either way.
 */
const SHIPPED = fileURLToPath(new URL('../python', import.meta.url));
/** The probe is about its decisions here; app preparation exercises the real binaries. */
const TOOLS = { uv: '/usr/bin/true', ffmpeg: '/usr/bin/true', ffprobe: '/usr/bin/true' };

const scratches: string[] = [];
const scratch = async (): Promise<string> => {
  const made = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-runtime-'));
  scratches.push(made);
  return made;
};

afterEach(async () => {
  for (const made of scratches.splice(0)) await fs.rm(made, { recursive: true, force: true });
});

describe('what a built environment is of', () => {
  it('is the same for the same lock and the same uv', () => {
    expect(stampOf('lock', 'uv 0.9.11')).toBe(stampOf('lock', 'uv 0.9.11'));
  });

  it('changes when the lock does, which is what makes an update reinstall', () => {
    expect(stampOf('lock', 'uv 0.9.11')).not.toBe(stampOf('lock — but torch moved', 'uv 0.9.11'));
  });

  it('changes when uv does, because it is the thing that built it', () => {
    expect(stampOf('lock', 'uv 0.9.11')).not.toBe(stampOf('lock', 'uv 0.10.0'));
  });

  it('cannot be fooled by the join between the two', () => {
    // Hashing a concatenation without a separator makes "ab" + "c" and "a" +
    // "bc" the same environment, which is the classic way a cache key lies.
    expect(stampOf('a', 'bc')).not.toBe(stampOf('ab', 'c'));
  });
});

describe('where everything lands', () => {
  it('keeps the whole engine under one directory, so deleting it is the reset', () => {
    const at = places('/Application Support/mix[flow]/runtime');
    for (const part of [at.env, at.python, at.cache, at.stamp]) {
      expect(part.startsWith('/Application Support/mix[flow]/runtime/')).toBe(true);
    }
  });

  it('keeps the four apart', () => {
    const at = places('/runtime');
    expect(new Set([at.env, at.python, at.cache, at.stamp]).size).toBe(4);
  });
});

describe('what uv is saying', () => {
  /**
   * Every line below was copied from a real frozen sync on a cold cache. That
   * matters more than it looks: a frozen sync prints **no** `Resolved` line,
   * because the point of shipping a lock is that nothing gets resolved — and a
   * stage map written against the ordinary output would have gone quiet for
   * exactly the minute that needed narrating.
   */
  it('names the package being downloaded, which is the minute that needs it', () => {
    expect(stageOf('Downloading torch (111.2MiB)')).toBe('downloading torch · 111.2MiB');
    expect(stageOf('Downloading numpy (20.8MiB)')).toBe('downloading numpy · 20.8MiB');
  });

  it('does not call fetching Python a package download', () => {
    // It arrives on the same shape of line and is a different thing to be
    // waiting for — and it is the one that happens before anything else.
    expect(stageOf('Downloading cpython-3.13.9-macos-aarch64-none (download) (16.2MiB)')).toBe(
      'installing python',
    );
    expect(stageOf('Using CPython 3.13.9')).toBe('installing python');
  });

  it('reads the phases a sync actually reports', () => {
    expect(stageOf('Creating virtual environment at: .venv')).toBe('making the environment');
    expect(stageOf('Prepared 32 packages in 6.74s')).toBe('installing the engine');
    expect(stageOf('Installed 32 packages in 241ms')).toBe('engine installed');
  });

  it('says nothing about the lines that are not a phase', () => {
    // A non-frozen sync lists every package it installed. Thirty-two of those
    // flashing through a stage line is noise pretending to be progress.
    expect(stageOf(' + torch==2.13.0')).toBeNull();
    expect(stageOf('warning: something about a keyring')).toBeNull();
    expect(stageOf('')).toBeNull();
  });

  it('finds the last thing said, for putting a reason on a failure', () => {
    expect(lastLine('warning: something\nerror: no space left on device\n\n')).toBe(
      'error: no space left on device',
    );
    expect(lastLine('')).toBe('');
  });
});

describe('the probe', () => {
  it('reports an engine that is not built without calling it a failure', async () => {
    // The ordinary first run. `ok` is about whether this build could separate
    // at all; `built` is about whether it has yet, and the window says so
    // rather than showing something broken.
    const answer = await ready(await scratch(), SHIPPED, TOOLS);
    expect(answer.ok).toBe(true);
    expect(answer.built).toBe(false);
    expect(answer.says).toMatch(/first separation/);
  });

  it('does not believe a stamp from a different lock', async () => {
    const where = await scratch();
    await fs.writeFile(places(where).stamp, JSON.stringify({ stamp: 'not-this-one' }));
    expect((await ready(where, SHIPPED, TOOLS)).built).toBe(false);
  });

  it('survives a stamp file that is not even JSON', async () => {
    // Something else wrote in Application Support, or a write was cut off. The
    // answer is to rebuild, not to throw on the way to opening a window.
    const where = await scratch();
    await fs.writeFile(places(where).stamp, 'half a fi');
    expect((await ready(where, SHIPPED, TOOLS)).built).toBe(false);
  });

  it('says so when the build itself is missing its engine lock', async () => {
    // Not a machine problem: a bundle that shipped without `uv.lock` in it
    // cannot separate however good the machine is, and that is the one case
    // worth drawing the broken light for.
    const answer = await ready(await scratch(), await scratch(), TOOLS);
    expect(answer.ok).toBe(false);
    expect(answer.says).toMatch(/no engine lock/);
  });

  it('answers for a directory that does not exist at all', async () => {
    const answer = await ready(path.join(await scratch(), 'never', 'made'), SHIPPED, TOOLS);
    expect(answer.built).toBe(false);
  });

  it('rejects a build whose bundled decoder pair is missing', async () => {
    const nowhere = path.join(await scratch(), 'not-a-binary');
    const answer = await ready(await scratch(), SHIPPED, {
      ...TOOLS,
      ffmpeg: nowhere,
      ffprobe: nowhere,
    });
    expect(answer.ok).toBe(false);
    expect(answer.says).toMatch(/no audio decoder/);
  });
});

describe('the worker environment', () => {
  it('puts the bundled tools before a shell PATH', () => {
    const env = workerEnv({ PATH: '/opt/homebrew/bin:/usr/bin', KEPT: 'yes' }, '/bundle/bin');
    expect(env.PATH).toBe(['/bundle/bin', '/opt/homebrew/bin', '/usr/bin'].join(path.delimiter));
    expect(env.KEPT).toBe('yes');
  });

  it('still has a usable PATH when Finder supplied none', () => {
    expect(workerEnv({}, '/bundle/bin').PATH).toBe('/bundle/bin');
  });
});
