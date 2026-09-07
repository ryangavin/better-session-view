import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { repairBuilder } from './builderPatch.ts';

const installed = fs.readFileSync(createRequire(import.meta.url)
  .resolve('app-builder-lib/out/codeSign/macCodeSign.js'), 'utf8');

/** Execute the real dependency's functions, intercepting all OS operations.
 * No certificate, keychain, network or user secrets are needed by this test.
 */
async function commands(source: string, installer: boolean): Promise<string[][]> {
  const calls: string[][] = [];
  const start = source.indexOf('async function createKeychain(');
  const end = source.indexOf('async function sign(', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const create = vm.runInNewContext(`${source.slice(start, end)}; createKeychain`, {
    crypto_1: { createHash, randomBytes: () => Buffer.from('temporary-keychain-only') },
    os_1: { tmpdir: () => '/tmp' },
    process: { env: { TRAVIS: 'true' } },
    path,
    removeKeychain: async () => {},
    listUserKeychains: async () => [],
    codesign_1: { importCertificate: async (link: string) => link },
    builder_util_1: { exec: async (_file: string, args: string[]) => { calls.push(args); } },
  }) as (args: Record<string, unknown>) => Promise<unknown>;
  await create({
    tmpDir: {}, currentDir: '/build/mix',
    cscLink: '/test/app.p12', cscKeyPassword: 'app-certificate-only',
    ...(installer ? { cscILink: '/test/installer.p12', cscIKeyPassword: 'installer-certificate-only' } : {}),
  });
  return calls;
}

const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

describe('the packaged signing dependency', () => {
  it.each([false, true])('authenticates the keychain separately from certificates (installer: %s)', async (installer) => {
    const calls = await commands(repairBuilder(installed), installer);
    const keychain = flag(calls.find((args) => args[0] === 'create-keychain')!, '-p');
    expect(flag(calls.find((args) => args[0] === 'unlock-keychain')!, '-p')).toBe(keychain);
    const imports = calls.filter((args) => args[0] === 'import');
    expect(imports.map((args) => flag(args, '-P'))).toEqual(installer
      ? ['app-certificate-only', 'installer-certificate-only'] : ['app-certificate-only']);
    const partitions = calls.filter((args) => args[0] === 'set-key-partition-list');
    expect(partitions).toHaveLength(imports.length);
    for (const args of partitions) expect(flag(args, '-k')).toBe(keychain);
    expect(keychain).not.toBe('app-certificate-only');
  });

  it('can pack each app without applying the backport twice', () => {
    const repaired = repairBuilder(installed);
    expect(repairBuilder(repaired)).toBe(repaired);
  });

  it('stops packaging when the dependency no longer matches the backport', () => {
    expect(() => repairBuilder('unrecognized signing implementation')).toThrow('review the keychain backport');
  });
});
