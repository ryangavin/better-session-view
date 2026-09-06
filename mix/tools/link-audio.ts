import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = '902aef95bf94af49746fdda5369b42cdcfa1e6d2';
const mix = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(mix, 'bin');

function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} exited ${result.status}`);
  return result.stdout.trim();
}

/** Build-time only. The installed app carries the native helper and its corresponding source. */
export function prepareLinkAudio(): void {
  if (process.platform !== 'darwin') throw new Error('Link Audio packaging currently targets macOS');
  fs.mkdirSync(bin, { recursive: true });
  const source = path.join(mix, 'native', 'link-audio.cpp');
  const fingerprint = createHash('sha256').update(fs.readFileSync(source))
    .update(revision).update(process.arch).digest('hex');
  const executable = path.join(bin, 'link-audio');
  const stamp = path.join(bin, 'link-audio.build');
  if (fs.existsSync(executable) && fs.existsSync(stamp)
      && fs.readFileSync(stamp, 'utf8') === fingerprint
      && run(executable, ['--version']) === 'openflow-link-audio 1') return;
  const sdk = path.join(bin, 'link-sdk');
  if (!fs.existsSync(path.join(sdk, '.git'))) {
    run('git', ['clone', '--no-checkout', 'https://github.com/Ableton/link.git', sdk]);
  }
  run('git', ['checkout', '--detach', revision], sdk);
  run('git', ['submodule', 'update', '--init', '--recursive', '--depth', '1'], sdk);
  if (run('git', ['rev-parse', 'HEAD'], sdk) !== revision) throw new Error('Unexpected Link SDK revision');
  run('clang++', ['-std=c++17', '-O2', '-DNDEBUG', '-DLINK_PLATFORM_MACOSX=1',
    '-I', path.join(sdk, 'include'), '-I', path.join(sdk, 'modules/asio-standalone/asio/include'),
    source, '-o', `${executable}.next`]);
  fs.renameSync(`${executable}.next`, executable);
  fs.writeFileSync(stamp, fingerprint);
  // Complete sources are shipped alongside the GPL helper, including its build recipe.
  const corresponding = path.join(bin, 'link-audio-source');
  fs.mkdirSync(corresponding, { recursive: true });
  fs.cpSync(sdk, path.join(corresponding, 'sdk'), {
    recursive: true, filter: (file) => path.basename(file) !== '.git',
  });
  fs.copyFileSync(source, path.join(corresponding, 'link-audio.cpp'));
  fs.copyFileSync(fileURLToPath(import.meta.url), path.join(corresponding, 'build.ts'));
  fs.copyFileSync(path.join(sdk, 'GNU-GPL-v2.0.md'), path.join(corresponding, 'COPYING'));
  fs.writeFileSync(path.join(corresponding, 'README.txt'),
    `Ableton Link ${revision}\nHelper: GPL-2.0-or-later\n` +
    'Build on macOS from this directory:\n' +
    'clang++ -std=c++17 -O2 -DNDEBUG -DLINK_PLATFORM_MACOSX=1 -I sdk/include ' +
    '-I sdk/modules/asio-standalone/asio/include link-audio.cpp -o link-audio\n');
  console.log('prepare: Link Audio → mix/bin/link-audio');
}
