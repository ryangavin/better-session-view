import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { LinkAudioService } from '../electron/linkAudio.ts';
import type { LinkClock } from '../src/linkAudioTypes.ts';

const mix = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdk = path.join(mix, 'bin/link-sdk');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'mix-link-sync-'));
// Test peers use a separate discovery port. Tempo/start/stop tests must never
// alter the real Link session a musician may be using on this network.
const header = 'ableton/discovery/IpInterface.hpp';
await fs.mkdir(path.dirname(path.join(scratch, header)), { recursive: true });
const original = await fs.readFile(path.join(sdk, 'include', header), 'utf8');
const port = String(30000 + process.pid % 20000);
assert.ok(original.includes('20808'));
await fs.writeFile(path.join(scratch, header), original.replaceAll('20808', port));
const binary = path.join(scratch, 'publisher');
const built = spawnSync('clang++', ['-std=c++17', '-O2', '-DLINK_PLATFORM_MACOSX=1',
  '-I', scratch, '-I', path.join(sdk, 'include'), '-I', path.join(sdk, 'modules/asio-standalone/asio/include'),
  path.join(mix, 'native/link-audio.cpp'), '-o', binary], { encoding: 'utf8' });
if (built.status !== 0) throw new Error(built.stderr);
const service = new LinkAudioService(binary);
const sessions: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(id: string, predicate: (clock: LinkClock) => boolean): Promise<LinkClock> {
  let last: LinkClock[] = [];
  for (let i = 0; i < 100; ++i) {
    const clocks = await Promise.all(sessions.map((session) => service.clock(session)));
    last = clocks;
    const clock = clocks[sessions.indexOf(id)];
    if (predicate(clock)) return clock;
    await sleep(50);
  }
  throw new Error(`Link peers did not converge: ${JSON.stringify(last)}`);
}
try {
  const a = await service.open([{ id: 'a', name: 'A' }], 137);
  sessions.push(a);
  assert.ok(Math.abs((await service.clock(a)).tempo - 137) < 0.001);
  // Link treats sessions founded within 500ms as simultaneous and breaks that
  // tie by ID. Establish the incumbent before testing the documented join rule.
  await sleep(650);
  const b = await service.open([{ id: 'b', name: 'B' }], 90);
  sessions.push(b);
  await until(b, (clock) => clock.peers === 1 && Math.abs(clock.tempo - 137) < 0.001);
  for (const bpm of [148.5, 20, 999, 120]) {
    await service.control(a, { kind: 'tempo', bpm });
    await until(b, (clock) => Math.abs(clock.tempo - bpm) < 0.001);
  }
  const before = await service.clock(a);
  const plan = await service.control(a, { kind: 'start', beat: -1.5, micros: before.micros + 200000 });
  assert.ok(plan.startMicros >= before.micros + 200000);
  const playing = await until(b, (clock) => clock.playing);
  const phase = ((playing.beat + (plan.startMicros - playing.micros) / 1e6 * playing.tempo / 60) % 4 + 4) % 4;
  assert.ok(Math.abs(phase - 2.5) < 0.01, `Pickup was not phase aligned: ${phase}`);
  await sleep(650);
  const c = await service.open([{ id: 'c', name: 'C' }], 80);
  sessions.push(c);
  const joined = await until(c, (clock) => clock.peers === 2 && Math.abs(clock.tempo - 120) < 0.001);
  assert.equal(joined.playing, false, 'Joining must not adopt an existing start state');
  await service.control(b, { kind: 'stop' });
  await until(a, (clock) => !clock.playing);
  const restart = await service.clock(b);
  await service.control(b, { kind: 'start', beat: 0, micros: restart.micros + 200000 });
  await until(a, (clock) => clock.playing);
  await until(c, (clock) => clock.playing);
  console.log('Verified initial tempo, joining, two-way tempo, 20–999 BPM, pickup phase, and shared start/stop');
} finally { service.stop(); await fs.rm(scratch, { recursive: true, force: true }); }
