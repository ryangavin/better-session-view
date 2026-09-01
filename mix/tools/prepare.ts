#!/usr/bin/env node
// mix[flow]'s own build step: fetch the pinned `uv` the bundle carries.
//
// `tools/app.ts` runs this before building an app's main process, for any app
// that has a `tools/prepare.ts`. This is the only one that does, and what it is
// for is the one thing mix[flow] ships that neither vite nor esbuild produces —
// the same shape as `visuals/tools/build-link.ts`, which repairs a native addon.
//
// **Why a binary at all**: the app builds its Python environment on the machine
// that runs it — `mix/electron/runtime.ts` has the reasoning — and the thing
// that builds it has to be something we brought. Falling back to a `uv` on the
// user's PATH would make separation work on this laptop and fail on the one the
// dmg was handed to.
//
// Pinned by version *and* digest. A build step that fetches whatever is newest
// is a build that cannot be reproduced, and a build step that fetches over the
// network without checking what it got is a supply chain nobody is watching.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The pinned release, and what its tarball has to hash to. */
const VERSION = '0.9.11';
const DIGEST = '594d9f4cfbd21d5a2f34b0352bf423066a9dab1733c90b5d40e3e227506deb03';
/**
 * One architecture, because that is what this project builds: every dmg it has
 * produced is arm64 and the release workflow runs on Apple silicon. The day
 * that changes, this is a lookup and `mix/python/pyproject.toml` is the harder
 * half of the same question.
 */
const BUILD = 'uv-aarch64-apple-darwin';
const FROM = `https://github.com/astral-sh/uv/releases/download/${VERSION}/${BUILD}.tar.gz`;

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin');
const uv = path.join(bin, 'uv');

/** Whether what is already there is what is wanted, asked by running it. */
function current(): boolean {
  if (!fs.existsSync(uv)) return false;
  const said = spawnSync(uv, ['--version'], { encoding: 'utf8' });
  return said.status === 0 && said.stdout.includes(VERSION);
}

if (current()) {
  console.log(`prepare: uv ${VERSION} is already there`);
  process.exit(0);
}

console.log(`prepare: fetching uv ${VERSION}`);
const answer = await fetch(FROM);
if (!answer.ok) {
  console.error(`prepare: ${FROM} — ${answer.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await answer.arrayBuffer());

const got = createHash('sha256').update(bytes).digest('hex');
if (got !== DIGEST) {
  console.error(`prepare: uv ${VERSION} is not what was pinned\n  want ${DIGEST}\n  got  ${got}`);
  process.exit(1);
}

// Extracted through a scratch directory and moved into place, so an interrupted
// build leaves no half-written binary that `current()` would then believe.
const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'openflow-uv-'));
try {
  const tarball = path.join(scratch, 'uv.tar.gz');
  await fsp.writeFile(tarball, bytes);
  const untar = spawnSync('tar', ['-xzf', tarball, '-C', scratch], { stdio: 'inherit' });
  if (untar.status !== 0) throw new Error('tar could not read it');
  await fsp.mkdir(bin, { recursive: true });
  await fsp.rm(uv, { force: true });
  await fsp.rename(path.join(scratch, BUILD, 'uv'), uv);
  await fsp.chmod(uv, 0o755);
} finally {
  await fsp.rm(scratch, { recursive: true, force: true });
}

if (!current()) {
  console.error('prepare: the uv that was fetched would not run');
  process.exit(1);
}
console.log(`prepare: uv ${VERSION} → mix/bin/uv`);
