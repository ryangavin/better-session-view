import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Where separation actually runs, and how it gets there.
 *
 * Demucs is Python — torch, a managed CPython, and a gigabyte of wheels — which
 * cannot go inside a signed `.app` the way visual[flow]'s Link addon does.
 * `docs/demucs.md` had three answers and no decision; this is the decision. The
 * app ships **`uv` and a lock file**, and builds the environment into the user's
 * Application Support the first time they separate anything.
 *
 * The three properties that picked it:
 *
 *   * **Nothing unsigned goes in the bundle.** A venv inside the `.app` is
 *     thousands of Mach-Os that each need a signature and have to survive the
 *     hardened runtime — and torch `dlopen`s its own extensions, which is the
 *     fight that was predicted. Everything built here lands *outside* the
 *     bundle, written by our own process, so Gatekeeper never assesses it and
 *     our signature covers only what we compiled.
 *   * **An update is an update, not a reinstall.** The environment survives a
 *     new version of the app. Only a changed `uv.lock` rebuilds it, which is
 *     what the stamp is for.
 *   * **No toolchain in front of a musician.** `uv` is one static binary we
 *     ship, and it fetches its own CPython — `--python-preference only-managed`,
 *     so a Homebrew Python being upgraded underneath cannot break the engine.
 *     Nobody is asked to install anything.
 *
 * The locked environment is several hundred megabytes and the current development
 * venv is 961 MB with both separation and transcription dependencies. Model
 * checkpoints are separate and arrive on first use of a model, into torch's own
 * cache — the *loading the model* stage a job already reports.
 *
 * **No `electron` import**, so this is reachable from a test. The one thing it
 * cannot know is where Application Support is; `main.ts` knows that and passes
 * it in, which is the same discipline the library folder is held to.
 */

/** `<app>/…`, from `<app>/electron/dist/main.cjs`. */
const inside = (...parts: string[]): string => path.resolve(__dirname, '..', '..', ...parts);

/**
 * The `uv` this build runs.
 *
 * The pinned binary the bundle carries — `mix/tools/prepare.ts` fetches it — and
 * the PATH only when there is no bundle, which is a dev session. A packaged app
 * that fell back to the PATH would be a machine-dependent build: working here,
 * and reporting a missing toolchain on the laptop it was handed to.
 */
export const uvPath = (): string => {
  const own = inside('bin', 'uv');
  return fs.existsSync(own) ? own : 'uv';
};

/** A worker, which is ours. Only the environment it runs inside is built. */
export const worker = (name: 'separate.py' | 'transcribe.py' = 'separate.py'): string =>
  inside('python', name);

/**
 * What ships: the project the environment is built from, and its lock.
 *
 * Both entry points below take this as an argument with `shipped()` as the
 * default, which is not ceremony — it is the only way either of them is
 * reachable from a test. `__dirname` here is `electron/dist`, because that is
 * where esbuild puts the bundle, and a spec loads this file from source one
 * directory up.
 */
export const shipped = (): string => inside('python');

/**
 * The four things a built runtime is, under the one directory that holds them.
 *
 * One directory rather than four scattered through Application Support, because
 * the answer to "how do I make it do all that again" has to be *delete this
 * folder*. The uv cache lives inside it too: on one filesystem uv hardlinks out
 * of the cache into the venv, so it costs nothing to keep and everything is
 * removed together.
 */
export interface Places {
  /** The project uv syncs: `pyproject.toml`, `uv.lock`, and the `.venv` it builds. */
  env: string;
  /** Managed CPythons, fetched by uv rather than found on the machine. */
  python: string;
  cache: string;
  /** What was built, and from what. */
  stamp: string;
}

export const places = (where: string): Places => ({
  env: path.join(where, 'env'),
  python: path.join(where, 'python'),
  cache: path.join(where, 'cache'),
  stamp: path.join(where, 'built.json'),
});

/**
 * What a built environment is *of*: the lock it was built from and the uv that
 * built it.
 *
 * The same idea as a separation's cache key in `job.ts` — a fingerprint of the
 * inputs, so the question "is this still the right environment" is a comparison
 * rather than an inspection. A new version of the app with an unchanged lock
 * finds its environment already there and starts separating; one with a changed
 * lock rebuilds without anybody deciding it should.
 */
export const stampOf = (lock: string, uv: string): string =>
  createHash('sha256').update(lock).update('\n').update(uv).digest('hex').slice(0, 12);

/**
 * What to say a `uv sync` line means, or nothing when it is not worth saying.
 *
 * Written against what a **frozen** sync on a cold cache actually prints, which
 * is not what an ordinary one does: there is no `Resolved` line, because the
 * whole point of shipping a lock is that nothing is resolved. What there is, in
 * order, is the Python being fetched, the venv being made, one line per package
 * large enough to be worth downloading, and two summaries.
 *
 * The per-package lines are the good ones. They carry a name and a size, they
 * arrive as each download *starts*, and torch is 111 MiB of the 220 — so the
 * long minute of the first run says `downloading torch · 111.2MiB` rather than
 * sitting on a stage that gives no sign of moving.
 */
export const stageOf = (line: string): string | null => {
  const said = line.trim();
  if (/^(Downloading|Downloaded|Using|Installed) cpython/i.test(said)) return 'installing python';
  if (/^Creating virtual environment/i.test(said)) return 'making the environment';
  const downloading = /^Downloading (\S+) \(([^)]+)\)/i.exec(said);
  if (downloading) return `downloading ${downloading[1]} · ${downloading[2]}`;
  if (/^(Resolved|Prepared) /i.test(said)) return 'installing the engine';
  if (/^Installed /i.test(said)) return 'engine installed';
  return null;
};

/** What a probe found, in the shape the renderer renders. */
export interface Ready {
  /** Whether this build could separate at all — a bundle missing its own parts cannot. */
  ok: boolean;
  /** Whether the environment is there *now*. False is the ordinary first run. */
  built: boolean;
  /** One line, for a person. */
  says: string;
  where: string;
}

/** Long enough for `uv --version`; anything slower is a machine in trouble. */
const PROBE_MS = 5000;

/** `uv 0.9.11`, or null when it could not be run at all. */
function uvVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (answer: string | null) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };
    const uv = spawn(uvPath(), ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let said = '';
    uv.stdout.on('data', (chunk: Buffer) => {
      said += chunk.toString();
    });
    // ENOENT is the ordinary answer in a dev session on a machine that has
    // never installed uv, and it arrives as an error event rather than an exit
    // code. A packaged app carries its own, so this is not the shipping path.
    uv.on('error', () => done(null));
    uv.on('exit', (code) => done(code === 0 ? said.trim() || 'uv' : null));
    setTimeout(() => {
      if (uv.exitCode === null) {
        uv.kill('SIGKILL');
        done(null);
      }
    }, PROBE_MS);
  });
}

/** Whether the stamp on disk is the one this build wants. */
async function matches(at: string, want: string): Promise<boolean> {
  try {
    const held = JSON.parse(await fsp.readFile(at, 'utf8')) as { stamp?: string };
    return held.stamp === want;
  } catch {
    return false;
  }
}

/**
 * Whether this machine could separate anything, asked the cheap way.
 *
 * Deliberately **not** a `uv sync --dry-run`, and deliberately not importing
 * torch: both are seconds, on a window that has only just opened. Running the
 * bundled `uv --version` and comparing one stamp answers the two questions
 * there are — can this build run anything, and is the engine here yet — in
 * about ten milliseconds.
 *
 * It never rejects. **Not being built yet is not a failure**: it is the first
 * run, and the window says what pressing Generate will do rather than showing
 * something broken.
 */
export async function ready(where: string, from: string = shipped()): Promise<Ready> {
  const lock = path.join(from, 'uv.lock');
  if (!fs.existsSync(lock)) {
    return { ok: false, built: false, says: 'this build has no engine lock in it', where };
  }
  const version = await uvVersion();
  if (!version) {
    return { ok: false, built: false, says: 'uv would not run', where };
  }
  const want = stampOf(await fsp.readFile(lock, 'utf8'), version);
  const built = await matches(places(where).stamp, want);
  return {
    ok: true,
    built,
    says: built
      ? `engine ready · ${version}`
      : 'engine not installed yet — the first separation sets it up',
    where,
  };
}

/**
 * Build the environment, or return straight away because it is already there.
 *
 * Called by the runner rather than by a button, so there is no way to start a
 * job without one — a setup step somebody can skip is a setup step that
 * produces a bug report about Python. It is the same reason it takes the job's
 * own progress callback: the first separation on a machine is a long one, and
 * what makes that bearable is the window saying *why*, in the place it already
 * says what a separation is doing.
 *
 * `hold` hands the child up to the caller so Cancel reaches it. A setup is
 * minutes and it must be stoppable; the stamp is written only on success, so a
 * cancelled or crashed one is simply not built and the next attempt starts over
 * rather than trusting half a venv.
 *
 * Throws, with the last thing uv said. The runner turns that into an outcome —
 * one place where a job that could not run becomes a line in the window.
 */
export async function prepare(
  where: string,
  watch: { say(stage: string): void; hold?(child: ChildProcess): void },
  from: string = shipped(),
): Promise<void> {
  const at = places(where);
  const lock = await fsp.readFile(path.join(from, 'uv.lock'), 'utf8');
  const project = await fsp.readFile(path.join(from, 'pyproject.toml'), 'utf8');
  const version = await uvVersion();
  if (!version) throw new Error('uv would not run');

  const want = stampOf(lock, version);
  if (await matches(at.stamp, want)) return;

  // Copied out of the bundle rather than synced in place: the bundle is
  // read-only, and writing a `.venv` inside a signed app would break the
  // signature even where the disk allowed it.
  await fsp.mkdir(at.env, { recursive: true });
  await fsp.writeFile(path.join(at.env, 'pyproject.toml'), project);
  await fsp.writeFile(path.join(at.env, 'uv.lock'), lock);

  watch.say('setting up the engine');
  await sync(at, watch);
  await fsp.writeFile(
    at.stamp,
    `${JSON.stringify({ stamp: want, uv: version, at: new Date().toISOString() }, null, 2)}\n`,
  );
}

/**
 * `uv sync`, with everything it might reach for pointed inside our directory.
 *
 * `--frozen` is the point of shipping a lock: install exactly what was
 * resolved, resolve nothing, and never consult the network for a version. Two
 * machines that set themselves up a year apart get the same engine.
 */
function sync(at: Places, watch: { say(stage: string): void; hold?(child: ChildProcess): void }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      uvPath(),
      ['sync', '--project', at.env, '--frozen', '--python-preference', 'only-managed'],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
          ...process.env,
          UV_PYTHON_INSTALL_DIR: at.python,
          UV_CACHE_DIR: at.cache,
          // Without a terminal uv prints summaries rather than bars anyway; this
          // says so rather than depending on it.
          UV_NO_PROGRESS: '1',
        },
      },
    );
    watch.hold?.(child);

    // Kept short on purpose: this is here to put a reason on a non-zero exit,
    // not to keep a log.
    let noise = '';
    let tail = '';
    child.stderr.on('data', (chunk: Buffer) => {
      noise = `${noise}${chunk}`.slice(-2000);
      tail += chunk.toString();
      const lines = tail.split('\n');
      tail = lines.pop() ?? '';
      for (const line of lines) {
        const stage = stageOf(line);
        if (stage) watch.say(stage);
      }
    });

    child.on('error', (why: Error) => reject(new Error(`uv could not start — ${why.message}`)));
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else if (signal) reject(new Error('setting up the engine was stopped'));
      else reject(new Error(lastLine(noise) || `uv sync exited ${code}`));
    });
  });
}

/** The last thing a stream said that was worth repeating to a person. */
export const lastLine = (noise: string): string =>
  noise
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .pop() ?? '';
