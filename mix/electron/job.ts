import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { modelOf, type Model } from './models.ts';

/**
 * What a separation *is*, apart from the process that runs it: where its output
 * goes, what the sidecar beside it says, and how a worker's commentary becomes
 * something a window can draw.
 *
 * Split out of `separate.ts` for the reason `manifest.ts` is split out of
 * `library.ts` — this is the part that decides what lands in a person's library
 * and whether an existing result can be trusted, so it is the part that is
 * tested. `separate.ts` is left with the child process and the queue.
 *
 * The output contract is `demucs/README.md`'s third item and every clause of it
 * is a measurement rather than a taste:
 *
 *   * **Stems that sum.** The worker writes float32 with clipping protection
 *     off, and reports what the sum actually came to. Four stems each rescaled
 *     independently sum to −13.8 dB of the original; written this way they sum
 *     to −23.6 dB, which is the model's own error and nothing else.
 *   * **A sidecar, always.** Model, source hash, source format, and the measured
 *     residual. Without it you cannot tell a bad stem from a bad source six
 *     months later, and that distinction is most of the support burden.
 *   * **A cache key over the source's content, not its path.** Separation is
 *     minutes of GPU and the inputs are immutable, so nothing should run twice
 *     — and the same song at two bitrates is two different results, which a
 *     path-keyed cache would happily conflate.
 */

/** Where stems live inside a library, beside `audio/` and the manifest. */
export const STEMS = 'stems';
export const SIDECAR = 'stems.json';
/** Bumped when a reader has to notice; an unreadable one is re-separated rather than trusted. */
export const SIDECAR_FORMAT = 1;

/** One stem on disk, as the sidecar records it. */
export interface Written {
  source: string;
  file: string;
  /** dBFS. A source the model found nothing for reads as silence, and should. */
  rms: number;
}

export interface Sidecar {
  openflow: 'mix-stems';
  version: number;
  /** Content hash, model and pinned parameters. What makes a rerun unnecessary. */
  key: string;
  model: string;
  engine: string;
  checkpoint: string;
  source: {
    /** Relative to the library root, like everything else a library records. */
    file: string;
    bytes: number;
    /** sha256 of the file's contents. */
    hash: string;
    /** `.flac`, `.m4a`. Provenance: the same model on the same song is a different result. */
    format: string;
  };
  sources: string[];
  samplerate: number;
  channels: number;
  bits: number;
  float: boolean;
  /**
   * How far the stems fall short of summing to the mix, in dB.
   *
   * The model's own error and the one number that says whether these stems can
   * be faded against each other. Around −24 dB is a healthy separation written
   * correctly; around −14 dB means something rescaled them.
   */
  residual: number;
  stems: Written[];
  device: string;
  /** Seconds of audio, and seconds of wall clock to separate it. */
  seconds: number;
  wall: number;
  load: number;
  produced: string;
  /**
   * Post-processing that was asked for, in order. Empty today.
   *
   * `demucs/README.md` puts the width fix here — it halves the side-channel
   * artifact for almost no cost and it narrows the voice, so it is a judgement
   * call rather than a default, and a judgement call has to be recorded.
   */
  steps: string[];
}

/**
 * The cache key: what the source *is*, and what was done to it.
 *
 * Keyed on the content hash rather than the path, because a library holds two
 * copies of a song at two bitrates often enough — and they separate differently
 * enough — that treating them as one result would be wrong rather than merely
 * imprecise.
 */
export const keyOf = (hash: string, model: Model, shifts = 1, overlap = 0.25): string =>
  `${hash}:${model.engine}:${model.checkpoint}:s${shifts}:o${overlap}`;

/** sha256 of a file, streamed, so a 400 MB WAV does not become 400 MB of heap. */
export function hashOf(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sum = crypto.createHash('sha256');
    const reading = fs.createReadStream(file);
    reading.on('data', (chunk) => sum.update(chunk));
    reading.on('error', reject);
    reading.on('end', () => resolve(sum.digest('hex')));
  });
}

/** `stems/<track>/<model>`, relative to the library root and posix throughout. */
export const stemsAt = (trackId: string, modelId: string): string =>
  `${STEMS}/${trackId}/${modelId}`;

/**
 * The sidecar already there, if it is one and it is readable.
 *
 * Every failure answers the same way — null, meaning "separate it again" —
 * because the only thing this decides is whether minutes of GPU can be skipped.
 * A sidecar that will not parse is not worth an error dialog; it is worth
 * redoing the work that would have replaced it anyway. That is the opposite of
 * `manifest.ts`'s rule, and deliberately so: this file is derived, and that one
 * is the library.
 */
export async function sidecarAt(root: string, where: string): Promise<Sidecar | null> {
  try {
    const held = JSON.parse(
      await fsp.readFile(path.join(root, where, SIDECAR), 'utf8'),
    ) as Sidecar;
    if (held.openflow !== 'mix-stems' || held.version !== SIDECAR_FORMAT) return null;
    if (!Array.isArray(held.stems) || held.stems.length === 0) return null;
    return held;
  } catch {
    return null;
  }
}

/**
 * Whether an existing separation can stand in for the one being asked for.
 *
 * The key has to match *and* every stem it claims has to still be on disk. A
 * sidecar whose audio somebody deleted in the Finder is a sidecar describing
 * nothing, and trusting it would leave the window drawing lanes over files that
 * are not there.
 */
export async function reusable(
  root: string,
  where: string,
  key: string,
): Promise<Sidecar | null> {
  const held = await sidecarAt(root, where);
  if (!held || held.key !== key) return null;
  for (const stem of held.stems) {
    try {
      await fsp.access(path.join(root, where, stem.file));
    } catch {
      return null;
    }
  }
  return held;
}

/** One line of the worker's commentary, once it has been understood. */
export type Event =
  | { event: 'stage'; stage: string; model?: string; device?: string }
  | {
      event: 'opened';
      load: number;
      sources: string[];
      samplerate: number;
      channels: number;
      /** The sources this model reports progress for one at a time, or null. */
      perSource: string[] | null;
    }
  | { event: 'read'; seconds: number; samples: number }
  | { event: 'progress'; done: number; source: string | null }
  | { event: 'written'; source: string; file: string; rms: number }
  // Everything the sidecar records that only the run can know. `sources` is not
  // among them: it is the source names off `stems`, and asking the worker for
  // the same list twice is asking for the two to disagree.
  | ({ event: 'done' } & Omit<
      Sidecar,
      | 'openflow'
      | 'version'
      | 'key'
      | 'model'
      | 'engine'
      | 'checkpoint'
      | 'source'
      | 'sources'
      | 'produced'
      | 'steps'
    >)
  | { event: 'failed'; says: string };

/**
 * One line of stdout, or nothing.
 *
 * A line that is not JSON is ignored rather than fatal. The worker promises
 * stdout is only ever JSON, but it runs inside somebody else's Python process —
 * a library that prints a deprecation notice to stdout on import must not be
 * able to kill a job that is otherwise going fine.
 */
export function decode(line: string): Event | null {
  const text = line.trim();
  if (!text.startsWith('{')) return null;
  try {
    const held = JSON.parse(text) as Event;
    return typeof held?.event === 'string' ? held : null;
  } catch {
    return null;
  }
}

/** What the window draws while a job runs. */
export interface Progress {
  /** 0 to 1, over the whole job. */
  done: number;
  /** What it is doing, in words, for the line under the title. */
  stage: string;
  /** The sources this model will emit, once it has said so. */
  sources: string[];
  /**
   * Per-source progress, or null where the model does not work source by source.
   *
   * Only a bag of per-source checkpoints — `htdemucs_ft` — separates one source
   * at a time. Every other model produces all of them in the same pass and they
   * finish in the same instant, so a per-stem bar would be the overall bar drawn
   * four times with four different labels. Null says which case this is, and the
   * window draws the honest one.
   */
  perStem: Record<string, number> | null;
  /** Sources whose file is on disk. */
  written: string[];
  /** Seconds of audio, once the worker has read the file. */
  seconds: number | null;
}

export const starting = (): Progress => ({
  done: 0,
  stage: 'loading the model',
  sources: [],
  perStem: null,
  written: [],
  seconds: null,
});

/**
 * Fold one event into what the window is showing.
 *
 * Per-source progress is derived from the overall figure and the source the
 * worker names, not tracked separately: the worker walks its bag in order, so
 * source *i* of *n* runs across the span from `i/n` to `(i+1)/n` and everything
 * before it is finished. Deriving it means the bar and the meters cannot
 * disagree, which they would if both were reported and one line went missing.
 */
export function advance(was: Progress, event: Event): Progress {
  switch (event.event) {
    case 'stage':
      return { ...was, stage: event.stage };
    case 'opened':
      return {
        ...was,
        sources: event.sources,
        perStem: event.perSource
          ? Object.fromEntries(event.perSource.map((id) => [id, 0]))
          : null,
      };
    case 'read':
      return { ...was, seconds: event.seconds };
    case 'progress': {
      const done = Math.min(1, Math.max(was.done, event.done));
      if (!was.perStem) return { ...was, done };
      const order = Object.keys(was.perStem);
      const n = order.length;
      return {
        ...was,
        done,
        perStem: Object.fromEntries(
          order.map((id, i) => [id, Math.min(1, Math.max(0, done * n - i))]),
        ),
      };
    }
    case 'written':
      return {
        ...was,
        written: was.written.includes(event.source)
          ? was.written
          : [...was.written, event.source],
      };
    case 'done':
      return { ...was, done: 1, stage: 'done', written: event.stems.map((s) => s.source) };
    default:
      return was;
  }
}

/**
 * The sidecar, built from what the worker measured and what was asked of it.
 *
 * Nothing here is asserted: the sample rate, the residual and the wall clock all
 * come off the run that just happened, which is the difference between a record
 * and a label.
 */
export function sidecarOf(args: {
  key: string;
  model: Model;
  source: Sidecar['source'];
  done: Extract<Event, { event: 'done' }>;
}): Sidecar {
  const { key, model, source, done } = args;
  return {
    openflow: 'mix-stems',
    version: SIDECAR_FORMAT,
    key,
    model: model.id,
    engine: model.engine,
    checkpoint: model.checkpoint,
    source,
    sources: done.stems.map((s) => s.source),
    samplerate: done.samplerate,
    channels: done.channels,
    bits: done.bits,
    float: done.float,
    residual: done.residual,
    stems: done.stems,
    device: done.device,
    seconds: done.seconds,
    wall: done.wall,
    load: done.load,
    produced: new Date().toISOString(),
    steps: [],
  };
}

/**
 * How long this will take, in seconds, or null when the length is not known.
 *
 * Two terms rather than one multiplier, because they scale differently: loading
 * four fine-tuned checkpoints is a fixed cost a twenty-second clip pays in full
 * and a ten-minute track hardly notices. A single "× realtime" figure taken
 * from a short bench is four times too pessimistic on a real track, which is
 * the sort of estimate that stops somebody starting a job at all.
 */
export const estimate = (model: Model, seconds: number | null): number | null =>
  seconds === null ? null : Math.round(model.load + seconds / model.realtime);

export { modelOf };
