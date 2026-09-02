#!/usr/bin/env node
// mix[flow]'s own build step: make the four binaries the bundle carries.
//
// `tools/app.ts` runs this before building the app's main process. `uv` is a
// pinned release binary; FFmpeg is built from its pinned upstream source because
// the codec-complete prebuilt macOS binaries enable GPL or non-free components.
// Building the small decoder we actually use keeps the app LGPL-only, keeps
// Homebrew paths out of it, and gives electron-builder two ordinary Mach-Os to
// sign beside `uv`.
//
// None of these generated files are committed. A clean app build downloads two
// checksum-pinned inputs, leaves the resulting binaries under `mix/bin/`, and
// subsequent builds prove what is there by running it before returning.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UV_VERSION = '0.9.11';
const UV_DIGEST = '594d9f4cfbd21d5a2f34b0352bf423066a9dab1733c90b5d40e3e227506deb03';
const UV_BUILD = 'uv-aarch64-apple-darwin';
const UV_FROM = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${UV_BUILD}.tar.gz`;

const YT_DLP_VERSION = '2026.08.19';
const YT_DLP_DIGEST = '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202';
const YT_DLP_FROM = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_macos`;

const FFMPEG_VERSION = '8.1.2';
const FFMPEG_DIGEST = '464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c';
const FFMPEG_FROM = `https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz`;

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin');
const uv = path.join(bin, 'uv');
const ytDlp = path.join(bin, 'yt-dlp');
const ffmpeg = path.join(bin, 'ffmpeg');
const ffprobe = path.join(bin, 'ffprobe');
const ffmpegLicense = path.join(bin, 'COPYING.LGPLv2.1');
const ffmpegSource = path.join(bin, `ffmpeg-${FFMPEG_VERSION}.tar.xz`);
const ffmpegProvenance = path.join(bin, 'FFMPEG-SOURCE.txt');

/** Run a build command quietly, but leave its whole useful output visible on failure. */
function run(command: string, args: string[], cwd?: string): void {
  const done = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (done.error) throw done.error;
  if (done.status !== 0) {
    if (done.stdout) process.stderr.write(done.stdout);
    if (done.stderr) process.stderr.write(done.stderr);
    throw new Error(`${path.basename(command)} exited ${done.status ?? 'without a status'}`);
  }
}

/** Fetch one immutable input and reject anything other than the pinned bytes. */
async function fetchPinned(label: string, from: string, digest: string): Promise<Buffer> {
  console.log(`prepare: fetching ${label}`);
  const answer = await fetch(from);
  if (!answer.ok) throw new Error(`${from} — ${answer.status}`);
  const bytes = Buffer.from(await answer.arrayBuffer());
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== digest) {
    throw new Error(`${label} is not what was pinned\n  want ${digest}\n  got  ${got}`);
  }
  return bytes;
}

/** Whether the exact uv release this build names is already there. */
function uvCurrent(): boolean {
  if (!fs.existsSync(uv)) return false;
  const said = spawnSync(uv, ['--version'], { encoding: 'utf8' });
  return said.status === 0 && said.stdout.includes(UV_VERSION);
}

async function prepareUv(): Promise<void> {
  if (uvCurrent()) {
    console.log(`prepare: uv ${UV_VERSION} is already there`);
    return;
  }

  const bytes = await fetchPinned(`uv ${UV_VERSION}`, UV_FROM, UV_DIGEST);
  const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'openflow-uv-'));
  try {
    const tarball = path.join(scratch, 'uv.tar.gz');
    await fsp.writeFile(tarball, bytes);
    run('tar', ['-xzf', tarball, '-C', scratch]);
    await fsp.mkdir(bin, { recursive: true });
    const next = path.join(bin, 'uv.next');
    await fsp.copyFile(path.join(scratch, UV_BUILD, 'uv'), next);
    await fsp.chmod(next, 0o755);
    await fsp.rename(next, uv);
  } finally {
    await fsp.rm(scratch, { recursive: true, force: true });
  }

  if (!uvCurrent()) throw new Error('the uv that was built would not run');
  console.log(`prepare: uv ${UV_VERSION} → mix/bin/uv`);
}

/** Whether the exact official yt-dlp executable this build pins is already there. */
function ytDlpCurrent(): boolean {
  if (!fs.existsSync(ytDlp)) return false;
  const digest = createHash('sha256').update(fs.readFileSync(ytDlp)).digest('hex');
  if (digest !== YT_DLP_DIGEST) return false;
  const said = spawnSync(ytDlp, ['--version'], { encoding: 'utf8' });
  return said.status === 0 && said.stdout.trim() === YT_DLP_VERSION;
}

async function prepareYtDlp(): Promise<void> {
  if (ytDlpCurrent()) {
    console.log(`prepare: yt-dlp ${YT_DLP_VERSION} is already there`);
    return;
  }

  const bytes = await fetchPinned(`yt-dlp ${YT_DLP_VERSION}`, YT_DLP_FROM, YT_DLP_DIGEST);
  await fsp.mkdir(bin, { recursive: true });
  const next = path.join(bin, 'yt-dlp.next');
  await fsp.writeFile(next, bytes, { mode: 0o755 });
  await fsp.rename(next, ytDlp);

  if (!ytDlpCurrent()) throw new Error('the yt-dlp executable that was fetched would not run');
  console.log(`prepare: yt-dlp ${YT_DLP_VERSION} → mix/bin/yt-dlp`);
}

/**
 * What the bundled decoder is allowed to be.
 *
 * All decoders and demuxers implemented by FFmpeg itself remain available, so
 * the import list does not depend on us guessing every PCM flavour an AIFF or
 * WAV might contain. Everything that could turn this into a general media tool
 * is removed: no network, devices, external libraries, or video/audio encoder.
 * The sole encoder and muxer are the raw float32 stream Demucs asks FFmpeg for.
 */
const FFMPEG_CONFIGURE = [
  '--prefix=/openflow/ffmpeg',
  '--disable-gpl',
  '--disable-nonfree',
  '--disable-version3',
  '--disable-autodetect',
  '--enable-static',
  '--disable-shared',
  '--disable-programs',
  '--enable-ffmpeg',
  '--enable-ffprobe',
  '--disable-doc',
  '--disable-htmlpages',
  '--disable-manpages',
  '--disable-podpages',
  '--disable-txtpages',
  '--disable-debug',
  '--disable-network',
  '--disable-devices',
  '--disable-encoders',
  '--enable-encoder=pcm_f32le',
  '--disable-muxers',
  '--enable-muxer=pcm_f32le',
  '--disable-protocols',
  '--enable-protocol=file,pipe',
  '--disable-filters',
  '--enable-filter=aresample,aformat,anull',
  '--disable-bsfs',
  '--arch=arm64',
  '--target-os=darwin',
  '--cc=clang -arch arm64',
  '--extra-cflags=-arch arm64 -mmacosx-version-min=12.0 -O3',
  '--extra-ldflags=-arch arm64 -mmacosx-version-min=12.0',
] as const;

/** Ask an FFmpeg binary for a registry and require every component named. */
function hasComponents(executable: string, kind: string, names: string[]): boolean {
  const said = spawnSync(executable, ['-hide_banner', `-${kind}`], { encoding: 'utf8' });
  return said.status === 0 && names.every((name) => new RegExp(`\\b${name}\\b`).test(said.stdout));
}

/**
 * Run the binaries rather than trusting their filenames. The component checks
 * are the build-time regression for the component path Demucs uses: MOV/AAC or
 * ALAC input, followed by raw float32 output.
 */
function ffmpegCurrent(): boolean {
  if (![ffmpeg, ffprobe, ffmpegLicense, ffmpegSource, ffmpegProvenance].every(fs.existsSync)) {
    return false;
  }
  const heldSource = createHash('sha256').update(fs.readFileSync(ffmpegSource)).digest('hex');
  if (heldSource !== FFMPEG_DIGEST) return false;
  const version = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' });
  const probe = spawnSync(ffprobe, ['-version'], { encoding: 'utf8' });
  if (version.status !== 0 || probe.status !== 0) return false;
  if (!version.stdout.includes(`ffmpeg version ${FFMPEG_VERSION}`)) return false;
  if (!probe.stdout.includes(`ffprobe version ${FFMPEG_VERSION}`)) return false;
  for (const flag of [
    '--disable-gpl',
    '--disable-nonfree',
    '--disable-version3',
    '--disable-autodetect',
    '--disable-network',
    '--disable-devices',
  ]) {
    if (!version.stdout.includes(flag)) return false;
  }
  return (
    hasComponents(ffmpeg, 'demuxers', ['mov', 'aac']) &&
    hasComponents(ffmpeg, 'decoders', ['aac', 'alac']) &&
    hasComponents(ffmpeg, 'muxers', ['f32le'])
  );
}

async function prepareFfmpeg(): Promise<void> {
  if (ffmpegCurrent()) {
    console.log(`prepare: FFmpeg ${FFMPEG_VERSION} is already there`);
    return;
  }

  const bytes = await fetchPinned(`FFmpeg ${FFMPEG_VERSION} source`, FFMPEG_FROM, FFMPEG_DIGEST);
  const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'openflow-ffmpeg-'));
  try {
    const tarball = path.join(scratch, `ffmpeg-${FFMPEG_VERSION}.tar.xz`);
    await fsp.writeFile(tarball, bytes);
    run('tar', ['-xf', tarball, '-C', scratch]);
    const source = path.join(scratch, `ffmpeg-${FFMPEG_VERSION}`);

    console.log(`prepare: configuring FFmpeg ${FFMPEG_VERSION} · LGPL audio decoder`);
    run(path.join(source, 'configure'), [...FFMPEG_CONFIGURE], source);
    console.log(`prepare: building FFmpeg ${FFMPEG_VERSION}`);
    run('make', [`-j${Math.max(1, os.cpus().length)}`, 'ffmpeg', 'ffprobe'], source);

    await fsp.mkdir(bin, { recursive: true });
    for (const name of ['ffmpeg', 'ffprobe'] as const) {
      const next = path.join(bin, `${name}.next`);
      await fsp.copyFile(path.join(source, name), next);
      await fsp.chmod(next, 0o755);
      await fsp.rename(next, path.join(bin, name));
    }
    await fsp.copyFile(path.join(source, 'COPYING.LGPLv2.1'), ffmpegLicense);
    await fsp.copyFile(tarball, ffmpegSource);
    await fsp.writeFile(
      ffmpegProvenance,
      [
        `FFmpeg ${FFMPEG_VERSION}`,
        `Source: ${FFMPEG_FROM}`,
        `SHA-256: ${FFMPEG_DIGEST}`,
        '',
        'Built for mix[flow] with:',
        `./configure ${FFMPEG_CONFIGURE.join(' ')}`,
        '',
        'The corresponding unmodified source is bundled beside this file.',
        '',
      ].join('\n'),
    );
  } finally {
    await fsp.rm(scratch, { recursive: true, force: true });
  }

  if (!ffmpegCurrent()) throw new Error('the FFmpeg decoder that was built did not pass its probe');
  console.log(`prepare: FFmpeg ${FFMPEG_VERSION} → mix/bin/{ffmpeg,ffprobe}`);
}

try {
  await prepareUv();
  await prepareYtDlp();
  await prepareFfmpeg();
} catch (why) {
  console.error(`prepare: ${(why as Error).message}`);
  process.exit(1);
}
