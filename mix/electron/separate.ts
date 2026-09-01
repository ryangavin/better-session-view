import { spawn, type ChildProcess } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  advance,
  decode,
  hashOf,
  keyOf,
  reusable,
  sidecarOf,
  SIDECAR,
  starting,
  stemsAt,
  type Event,
  type Progress,
  type Sidecar,
} from './job.ts';
import { modelOf } from './models.ts';
import { places, prepare, uvPath, worker } from './runtime.ts';

/**
 * The runner: one child process, one job at a time, and a way to stop it.
 *
 * What is *decided* about a separation — where it goes, whether one already
 * exists, what the sidecar says — is `job.ts`, which has no process in it and is
 * tested. What is left here is the part that cannot be: spawning Python,
 * reading its commentary a line at a time, and making sure a cancelled job is
 * actually gone.
 *
 * Three rules, and each is a bug that would otherwise be found on stage:
 *
 *   * **One at a time.** Two separations interleaved are both of them slower and
 *     they fight over one GPU. The app already refuses a second instance for
 *     this reason; this is the other half.
 *   * **Nothing partial lands in the library.** The worker writes into a scratch
 *     directory that is renamed into place only once the sidecar is written —
 *     so a cancelled or crashed job leaves the library exactly as it was, rather
 *     than a folder of three stems out of four that the next run would find and
 *     believe.
 *   * **Cancelling kills the child.** `SIGTERM` first, because Python turns it
 *     into an exception that unwinds torch cleanly, then `SIGKILL` if it is
 *     still there. An orphaned separation holds the GPU and there is nothing
 *     left in the window that could stop it.
 */

/**
 * The project `uv run` is given: the environment this app built for itself, or
 * whatever `OPENFLOW_DEMUCS` names.
 *
 * The override is a development convenience and the only way to point mix[flow]
 * at the `demucs/` research workspace — which has the extras a spike needs and
 * is explicitly not part of open[flow]. Naming one skips the setup entirely, on
 * the grounds that somebody who set the variable has an environment.
 */
const project = (runtime: string): string => process.env.OPENFLOW_DEMUCS ?? places(runtime).env;

/** How long a terminated child gets to unwind before it is killed outright. */
const GRACE_MS = 4000;

export interface Request {
  /** The library root. Absolute, and the only absolute path a job holds. */
  root: string;
  /**
   * Where the Python environment lives — Application Support, decided by
   * `main.ts` because it is the only file here that may ask electron for a
   * path. Built on the first job that needs it; `runtime.ts` has why.
   */
  runtime: string;
  trackId: string;
  /** The track's audio, relative to the root — `audio/…`, as the manifest holds it. */
  file: string;
  model: string;
}

/** What a finished job leaves behind, for the manifest and for the window. */
export interface Finished {
  ok: true;
  trackId: string;
  model: string;
  sources: string[];
  /** Where the stems are, relative to the library root. */
  stems: string;
  sidecar: Sidecar;
  /** True when the work was skipped because an identical separation was already there. */
  reused: boolean;
}

export interface Failed {
  ok: false;
  trackId: string;
  /** One line, for a person. */
  says: string;
  /** A job the window asked to stop, which is not something to apologise for. */
  cancelled: boolean;
}

export type Outcome = Finished | Failed;

/** Where a job's progress goes. The main process forwards these to the window. */
export interface Watcher {
  progress(trackId: string, progress: Progress): void;
  finished(outcome: Outcome): void;
}

interface Running {
  trackId: string;
  child: ChildProcess | null;
  cancelled: boolean;
  scratch: string;
}

let running: Running | null = null;

/** Whether anything is separating, and what. The window's Generate button reads this. */
export const busy = (): string | null => running?.trackId ?? null;

/**
 * Stop the job in flight, if it is the one named.
 *
 * Naming it matters: the window can only be showing one job, but a cancel that
 * arrives late — after the job it meant finished and the next one started —
 * would otherwise kill somebody else's work.
 */
export function cancel(trackId?: string): void {
  if (!running) return;
  if (trackId && running.trackId !== trackId) return;
  running.cancelled = true;
  const child = running.child;
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, GRACE_MS);
}

/** Everything down, for `before-quit`. A job must not outlive the window that started it. */
export const stopAll = (): void => cancel();

/**
 * Separate one track.
 *
 * Resolves with the outcome rather than rejecting: a job that could not run is
 * something for the window to say, in the same place it says everything else
 * about that track, and an exception here would have to be turned back into one
 * of these anyway.
 */
export async function separate(request: Request, watch: Watcher): Promise<Outcome> {
  const { root, trackId, file } = request;
  const fail = (says: string, cancelled = false): Failed => ({
    ok: false,
    trackId,
    says,
    cancelled,
  });

  if (running) return fail(`already separating ${running.trackId}`);

  const model = modelOf(request.model);
  if (!model) return fail(`no model called ${request.model}`);

  const source = path.join(root, file);
  let bytes = 0;
  try {
    bytes = (await fsp.stat(source)).size;
  } catch {
    return fail(`${file} is not in the library any more`);
  }

  const where = stemsAt(trackId, model.id);
  const hash = await hashOf(source);
  const key = keyOf(hash, model);

  // Separation is minutes of GPU and the inputs are immutable, so an identical
  // run is never worth doing twice. The key is over the file's *contents*: the
  // same song at two bitrates is two results, and a path-keyed cache would
  // conflate them.
  const already = await reusable(root, where, key);
  if (already) {
    const done: Finished = {
      ok: true,
      trackId,
      model: model.id,
      sources: already.sources,
      stems: where,
      sidecar: already,
      reused: true,
    };
    watch.finished(done);
    return done;
  }

  // Beside the destination rather than in the OS temp directory, so the rename
  // at the end is within one filesystem and therefore atomic — and so a
  // half-finished job is visibly a half-finished job in the library folder
  // rather than a gigabyte hiding in /var.
  const scratch = path.join(root, `${where}.writing`);
  await fsp.rm(scratch, { recursive: true, force: true });
  await fsp.mkdir(scratch, { recursive: true });

  running = { trackId, child: null, cancelled: false, scratch };
  let progress = starting();
  watch.progress(trackId, progress);

  // The environment, before anything is asked to run inside it. Ordinarily this
  // returns immediately; the first time on a machine it is minutes, which is
  // why it reports through the same progress the job does rather than blocking
  // silently on a window that says "loading the model".
  if (!process.env.OPENFLOW_DEMUCS) {
    try {
      await prepare(request.runtime, {
        say: (stage) => {
          progress = { ...progress, stage };
          watch.progress(trackId, progress);
        },
        hold: (child) => {
          if (running) running.child = child;
        },
      });
    } catch (why) {
      const stopped = running?.cancelled ?? false;
      running = null;
      await fsp.rm(scratch, { recursive: true, force: true });
      const done = fail(stopped ? 'cancelled' : (why as Error).message, stopped);
      watch.finished(done);
      return done;
    }
    if (running?.cancelled) {
      running = null;
      await fsp.rm(scratch, { recursive: true, force: true });
      const done = fail('cancelled', true);
      watch.finished(done);
      return done;
    }
    progress = { ...progress, stage: starting().stage };
    watch.progress(trackId, progress);
  }

  const outcome = await new Promise<Outcome>((resolve) => {
    const child = spawn(
      uvPath(),
      [
        'run',
        '--project',
        project(request.runtime),
        '--quiet',
        'python',
        worker(),
        '--input',
        source,
        '--out',
        scratch,
        '--model',
        model.checkpoint,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (running) running.child = child;

    let done: Extract<Event, { event: 'done' }> | null = null;
    let said: string | null = null;
    // Kept short on purpose: this is here to put a *reason* on a non-zero exit,
    // and the whole of torch's warning output would drown it.
    let noise = '';

    // stdout arrives in whatever sized pieces the pipe felt like, and a JSON
    // object split across two of them is not JSON. Hold the tail until its
    // newline turns up.
    let tail = '';
    child.stdout.on('data', (chunk: Buffer) => {
      tail += chunk.toString();
      const lines = tail.split('\n');
      tail = lines.pop() ?? '';
      for (const line of lines) {
        const event = decode(line);
        if (!event) continue;
        if (event.event === 'failed') said = event.says;
        else if (event.event === 'done') done = event;
        progress = advance(progress, event);
        watch.progress(trackId, progress);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      noise = `${noise}${chunk.toString()}`.slice(-4000);
    });

    // A machine with no `uv` on the PATH. The probe in `runtime.ts` says so
    // before anybody presses the button, but the PATH can change underneath a
    // running app and this is the only place that would notice.
    child.on('error', (why) =>
      resolve(fail(why.message.includes('ENOENT') ? 'uv is not on the PATH' : why.message)),
    );

    child.on('close', (code, signal) => {
      if (running?.cancelled) {
        resolve(fail('cancelled', true));
        return;
      }
      if (done) {
        resolve({
          ok: true,
          trackId,
          model: model.id,
          sources: (done as Extract<Event, { event: 'done' }>).stems.map((s) => s.source),
          stems: where,
          sidecar: sidecarOf({
            key,
            model,
            source: { file, bytes, hash, format: path.extname(file).toLowerCase() },
            done,
          }),
          reused: false,
        });
        return;
      }
      const last = noise.trim().split('\n').filter(Boolean).pop();
      resolve(
        fail(
          said ??
            (signal
              ? `the separator stopped on ${signal}`
              : last || `the separator exited ${code}`),
        ),
      );
    });
  });

  // Only a job that produced a sidecar is allowed to become a directory in the
  // library. Everything else takes its scratch with it.
  if (outcome.ok && !outcome.reused) {
    try {
      await fsp.writeFile(
        path.join(scratch, SIDECAR),
        `${JSON.stringify(outcome.sidecar, null, 2)}\n`,
      );
      await fsp.rm(path.join(root, where), { recursive: true, force: true });
      await fsp.mkdir(path.dirname(path.join(root, where)), { recursive: true });
      await fsp.rename(scratch, path.join(root, where));
    } catch (why) {
      await fsp.rm(scratch, { recursive: true, force: true });
      running = null;
      const broke = fail(`could not write the stems — ${(why as Error).message}`);
      watch.finished(broke);
      return broke;
    }
  } else {
    await fsp.rm(scratch, { recursive: true, force: true });
  }

  running = null;
  watch.finished(outcome);
  return outcome;
}
