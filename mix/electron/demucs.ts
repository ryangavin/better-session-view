import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Where separation comes from, and the one question this app has not answered.
 *
 * Demucs is Python — `demucs==4.1.0` on torch, run through `uv`, with the model
 * checkpoints cached in `~/.cache/huggingface`. That is several gigabytes that
 * cannot go inside a `.app` the way visual[flow]'s Link addon does, so the
 * shipped answer is one of three and none of them is chosen yet:
 *
 *   * **a workspace the user already has.** What this does today: it points at
 *     `demucs/` in the repo, which is a scratch project with its own `.venv`.
 *     Right for developing against, useless to anybody else.
 *   * **a venv the app builds on first run**, with `uv` either found or
 *     fetched. Cheap to ship, slow and networked the first time, and it puts a
 *     Python toolchain problem in front of a musician.
 *   * **a frozen binary per architecture**, built in CI. Largest download,
 *     no runtime toolchain, and the one that could ever be notarised cleanly —
 *     a hardened runtime and a Python that `dlopen`s its own extensions do not
 *     get along by default.
 *
 * `OPENFLOW_DEMUCS` names the workspace so the answer can change without this
 * file changing much. `docs/demucs.md` is where the decision gets written down
 * when it is made.
 */

/** `<repo>/demucs`, from `mix/electron/dist/main.cjs`. */
const workspace = (): string =>
  process.env.OPENFLOW_DEMUCS ?? path.resolve(__dirname, '..', '..', '..', 'demucs');

/** What a probe found, in the shape the renderer renders. */
export interface Ready {
  ok: boolean;
  /** `uv 0.9.7`, or why not. One line, for a person. */
  says: string;
  workspace: string;
}

/** Long enough for `uv --version`; anything slower is a machine in trouble. */
const PROBE_MS = 5000;

/**
 * Whether this machine could separate anything, asked the cheap way.
 *
 * Deliberately **not** `demucs --help`: that imports torch, which is three to
 * five seconds and a spinner on a window that has only just opened. `uv
 * --version` plus the workspace on disk answers the same question — is the
 * toolchain here, and does it have a project to run — in about ten
 * milliseconds.
 *
 * It never rejects. A missing toolchain is the ordinary first run, and it is
 * something for the window to say rather than something to fail on.
 */
export function ready(): Promise<Ready> {
  const where = workspace();
  return new Promise((resolve) => {
    const done = (ok: boolean, says: string) => resolve({ ok, says, workspace: where });

    if (!fs.existsSync(path.join(where, 'pyproject.toml'))) {
      done(false, `no demucs workspace at ${where}`);
      return;
    }

    const uv = spawn('uv', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let said = '';
    uv.stdout.on('data', (chunk: Buffer) => {
      said += chunk.toString();
    });
    // ENOENT is the ordinary answer on a machine that has never installed uv,
    // and it arrives as an error event rather than as an exit code.
    uv.on('error', () => done(false, 'uv is not on the PATH'));
    uv.on('exit', (code) => {
      if (code !== 0) done(false, `uv exited ${code}`);
      else done(true, said.trim() || 'uv');
    });

    setTimeout(() => {
      if (uv.exitCode === null) {
        uv.kill('SIGKILL');
        done(false, 'uv did not answer');
      }
    }, PROBE_MS);
  });
}
