import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build-time only; the installed app ships this opt-in CoreMIDI virtual source. */
export function prepareBassMidi(): void {
  if (process.platform !== 'darwin') throw new Error('Virtual MIDI currently targets macOS');
  const mix = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = path.join(mix, 'native/bass-midi.cpp');
  const executable = path.join(mix, 'bin/bass-midi');
  const stamp = `${executable}.build`;
  const fingerprint = createHash('sha256').update(fs.readFileSync(source)).update(process.arch).digest('hex');
  if (fs.existsSync(executable) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === fingerprint) return;
  fs.mkdirSync(path.dirname(executable), {recursive: true});
  const result = spawnSync('clang++', ['-std=c++17', '-O2', '-framework', 'CoreFoundation', '-framework', 'CoreMIDI', source, '-o', `${executable}.next`], {encoding:'utf8'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Could not build virtual MIDI helper');
  fs.renameSync(`${executable}.next`, executable);
  fs.writeFileSync(stamp, fingerprint);
}
