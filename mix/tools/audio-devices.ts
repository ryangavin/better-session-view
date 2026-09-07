import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build-time only; the installed app ships this read-only Core Audio query. */
export function prepareAudioDevices(): void {
  if (process.platform !== 'darwin') throw new Error('Audio device discovery currently targets macOS');
  const mix = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = path.join(mix, 'native/audio-devices.mm');
  const executable = path.join(mix, 'bin/audio-devices');
  const stamp = `${executable}.build`;
  const fingerprint = createHash('sha256').update(fs.readFileSync(source)).update(process.arch).digest('hex');
  if (fs.existsSync(executable) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === fingerprint) return;
  fs.mkdirSync(path.dirname(executable), {recursive: true});
  const result = spawnSync('clang++', ['-std=c++17', '-fobjc-arc', '-O2', '-framework', 'Foundation', '-framework', 'CoreAudio', source, '-o', `${executable}.next`], {encoding:'utf8'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Could not build audio device discovery');
  fs.renameSync(`${executable}.next`, executable);
  fs.writeFileSync(stamp, fingerprint);
}
