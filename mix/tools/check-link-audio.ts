import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LinkAudioService } from '../electron/linkAudio.ts';

// Run after preparing the app: node mix/tools/check-link-audio.ts.
const mix = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'mix-link-check-'));
const receiver = path.join(scratch, 'receiver');
const sdk = path.join(mix, 'bin/link-sdk');
const built = spawnSync('clang++', ['-std=c++17', '-O2', '-DLINK_PLATFORM_MACOSX=1',
  '-I', path.join(sdk, 'include'), '-I', path.join(sdk, 'modules/asio-standalone/asio/include'),
  path.join(mix, 'native/check-link-audio.cpp'), '-o', receiver], { encoding: 'utf8' });
if (built.status !== 0) throw new Error(built.stderr);
const service = new LinkAudioService(path.join(mix, 'bin/link-audio'));
try {
  for (const names of [
    ['Vocals', 'Drums', 'Bass', 'Other'],
    ['Deck A', 'Deck B', 'Deck C', 'Deck D', 'Master'],
    ['Vocals', 'Drums', 'Bass', 'Guitar', 'Piano', 'Other'],
  ]) {
    const session = await service.open(names.map((name, i) => ({ id: `output-${i}`, name })));
    const child = spawn(receiver, names, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (part: Buffer) => { output += part.toString(); });
    child.stderr.on('data', (part: Buffer) => { output += part.toString(); });
    let stopped = false;
    const result = new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        stopped = true;
        if (code === 0) { console.log(output.trim()); resolve(); }
        else reject(new Error(output || `receiver exited ${code}`));
      });
    });
    // Attach rejection before awaiting other operations.
    const outcome = result.then(() => null, (why: Error) => why);
    try {
      const samples = new Int16Array(names.length * 2048);
      for (let i = 0; i < names.length; ++i) for (let frame = 0; frame < 1024; ++frame) {
        samples[i * 2048 + frame * 2] = (i + 1) * 1000;
        samples[i * 2048 + frame * 2 + 1] = -(i + 1) * 1000;
      }
      while (!stopped) {
        const clock = await service.clock(session);
        await service.write(session, { token: clock.token, micros: clock.micros, rate: 48000, frames: 1024, samples });
        await new Promise((resolve) => setTimeout(resolve, 21));
      }
      const error = await outcome;
      if (error) throw error;
    } finally { child.kill(); await service.close(session); }
  }
} finally { service.stop(); await fs.rm(scratch, { recursive: true, force: true }); }
