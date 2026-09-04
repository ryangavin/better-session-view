/**
 * A throwaway page for measuring what the transport actually does to the
 * samples: seeks, loops, warp changes and the stretcher, rendered through an
 * `OfflineAudioContext` and read back. Not part of the app.
 *
 * The graph is the one thing in mix[flow] that no unit test can reach — node
 * has no Web Audio — so `gainOf` is covered and everything the sound goes
 * through is not. Offline is the way in: the same graph, the same worklet, a
 * clock that runs faster than the speakers and a buffer at the end instead of
 * a device, which makes every question about timing a question about a number
 * in an array.
 *
 * `Transport` builds its own `AudioContext` and takes no argument saying
 * otherwise, so the constructor is swapped on the global for the length of a
 * render. That is the whole of the trick and the whole of the reason this
 * lives here rather than in a spec: it is a lie told to one object, and it
 * only holds while nothing else in the page wants a real one.
 *
 * Results go to the console as `MIXTEST <json>`, one line each, so a driver
 * can read them back without looking at the page.
 */
import { REST, Transport, type Level } from '../src/engine.ts';
import { evenBeats, type Beats } from '../src/warp.ts';
import type { StretchChange, StretchNode } from 'signalsmith-stretch';

/** The rate every render runs at. Any rate would do; a fixed one makes the sample counts quotable. */
const RATE = 48000;

/** How far into a render playback is asked for, leaving room for the stretcher to be built. */
const START = 1;

/** `playStraight` starts the sources this far ahead of the clock, and every measurement allows for it. */
const KICKOFF = 0.02;

interface Outcome {
  name: string;
  ok: boolean;
  /** Set where the thing could not be measured at all, rather than measured and found wrong. */
  blocked?: string;
  detail: Record<string, unknown>;
}

const outcomes: Outcome[] = [];

function report(outcome: Outcome): void {
  outcomes.push(outcome);
  console.log('MIXTEST', JSON.stringify(outcome));
}

/* ---------- signals ---------- */

/**
 * Noise from a fixed seed, so two renders of the same thing are the same
 * numbers and a difference between them is the graph's and not the source's.
 */
function noiseOf(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0x100000000) * 2 - 1;
  };
}

function bufferOf(ctx: BaseAudioContext, seconds: number, fill: (i: number, rate: number) => number): AudioBuffer {
  const length = Math.round(seconds * ctx.sampleRate);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = fill(i, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  buffer.copyToChannel(samples, 1);
  return buffer;
}

const noiseBuffer = (ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer => {
  const next = noiseOf(seed);
  return bufferOf(ctx, seconds, () => next() * 0.4);
};

/**
 * A sine with a whole number of cycles in the buffer, so the file loops into
 * itself with nothing to hear at the join. Anything audible at the loop point
 * is then the transport's, which is the only reason to use a tone here.
 */
const loopingSine = (ctx: BaseAudioContext, seconds: number, cycles: number): AudioBuffer =>
  bufferOf(ctx, seconds, (i, rate) => 0.5 * Math.sin((2 * Math.PI * cycles * i) / (seconds * rate)));

/** Sustained partials: a phase vocoder holds these steady, so a level can be compared across one. */
const chord = (ctx: BaseAudioContext, seconds: number): AudioBuffer =>
  bufferOf(ctx, seconds, (i, rate) =>
    [110, 220, 330, 554].reduce((sum, f) => sum + 0.2 * Math.sin((2 * Math.PI * f * i) / rate), 0),
  );

/** The same samples under a slow tremolo: a stem that is plainly not the other one, over the same carrier. */
function tremoloed(ctx: BaseAudioContext, source: AudioBuffer, hz: number): AudioBuffer {
  const from = source.getChannelData(0);
  return bufferOf(ctx, source.length / source.sampleRate, (i, rate) =>
    from[i] * (0.55 + 0.45 * Math.sin((2 * Math.PI * hz * i) / rate)),
  );
}

/* ---------- measuring ---------- */

const resting = (ids: readonly string[]): Record<string, Level> =>
  Object.fromEntries(ids.map((id) => [id, { ...REST }]));

/**
 * Where in `ref` the window best sits, searched around where it is expected.
 *
 * A narrow search rather than the whole reference, because the whole thing is
 * minutes of multiply-add and the answer is either within a few samples of
 * expected or so far out that the score gives it away.
 */
function alignment(
  ref: Float32Array,
  win: Float32Array,
  expected: number,
  span: number,
  guard = 8,
): { lag: number; score: number; rival: number } {
  let energy = 0;
  for (const v of win) energy += v * v;
  const scores = new Map<number, number>();
  let best = { lag: expected, score: -Infinity };
  for (let lag = expected - span; lag <= expected + span; lag++) {
    if (lag < 0 || lag + win.length > ref.length) continue;
    let dot = 0;
    let theirs = 0;
    for (let i = 0; i < win.length; i++) {
      const r = ref[lag + i];
      dot += r * win[i];
      theirs += r * r;
    }
    const score = dot / Math.sqrt(energy * theirs || 1);
    scores.set(lag, score);
    if (score > best.score) best = { lag, score };
  }
  let rival = -Infinity;
  for (const [lag, score] of scores) if (Math.abs(lag - best.lag) > guard) rival = Math.max(rival, score);
  return { ...best, rival };
}

const rms = (samples: Float32Array, from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
};

/** The quietest short window in a stretch of output, as a fraction of the loudest. A dropout drives it to nothing. */
function dip(samples: Float32Array, from: number, to: number, window: number): number {
  let quietest = Infinity;
  let loudest = 0;
  for (let at = from; at + window <= to; at += window) {
    const level = rms(samples, at, at + window);
    quietest = Math.min(quietest, level);
    loudest = Math.max(loudest, level);
  }
  return loudest > 0 ? quietest / loudest : 0;
}

/* ---------- driving the graph ---------- */

/**
 * A transport whose context is an offline one of a known length, and the
 * per-stem taps that let a render be read back stem by stem.
 *
 * The gains are lifted off the master and given a channel each, because the
 * destination is the only place a render can be listened to and a sum of
 * stems cannot answer whether the stems agree.
 */
function rig(ids: readonly string[], seconds: number): { transport: Transport; ctx: OfflineAudioContext } {
  const length = Math.round(seconds * RATE);
  class Offline extends OfflineAudioContext {
    /** Set once the render is under way; before that a resume is an error rather than a no-op. */
    pumping = false;
    constructor() {
      super(Math.max(1, ids.length), length, RATE);
    }
    override resume(): Promise<void> {
      return this.pumping ? super.resume() : Promise.resolve();
    }
  }
  const was = globalThis.AudioContext;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = Offline;
  try {
    const transport = new Transport();
    const ctx = transport.audio() as unknown as OfflineAudioContext;
    return { transport, ctx };
  } finally {
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = was;
  }
}

/** Send each stem's gain to its own channel of the render, in the order the ids were given. */
function tap(transport: Transport, ctx: OfflineAudioContext, ids: readonly string[]): void {
  const gains = (transport as unknown as { gains: Map<string, GainNode> }).gains;
  const merger = ctx.createChannelMerger(Math.max(1, ids.length));
  ctx.destination.channelCountMode = 'explicit';
  ctx.destination.channelInterpretation = 'discrete';
  ids.forEach((id, i) => {
    const gain = gains.get(id)!;
    gain.disconnect();
    gain.connect(merger, 0, i);
  });
  merger.connect(ctx.destination);
}

/**
 * Render, stopping at every `step` so the main thread can catch up.
 *
 * An offline render runs as fast as it can, and the transport's stretched
 * path is driven from the worklet's update messages — which arrive on the
 * main thread, long after a render that took no time at all would have
 * finished. Suspending on a fixed grid puts the two clocks back in step: at
 * every stop the page is let run to quiet, and only then does the render go
 * on. It is not real time, but it is the same order of events.
 */
async function pumped(ctx: OfflineAudioContext, step: number, at: (when: number) => Promise<void> | void): Promise<AudioBuffer> {
  const total = ctx.length / ctx.sampleRate;
  for (let k = 1; k * step < total; k++) {
    const when = k * step;
    void ctx.suspend(when).then(async () => {
      await at(when);
      for (let turn = 0; turn < 3; turn++) await new Promise((go) => setTimeout(go, 0));
      if (ctx.state === 'suspended') void ctx.resume();
    });
  }
  (ctx as OfflineAudioContext & { pumping?: boolean }).pumping = true;
  return ctx.startRendering();
}

/** The stretcher the transport built, and the changes it is sent, recorded as they go. */
interface Watched {
  latency: number;
  calls: Array<{ now: number; change: StretchChange }>;
}

function watchSchedules(transport: Transport, ctx: OfflineAudioContext): Watched | null {
  const held = (transport as unknown as { stretch: { node: StretchNode; latency: number } | null }).stretch;
  if (!held) return null;
  const calls: Watched['calls'] = [];
  const node = held.node;
  const was = node.schedule.bind(node);
  node.schedule = (change: StretchChange, adjust?: boolean) => {
    calls.push({ now: ctx.currentTime, change: { ...change } });
    return was(change, adjust);
  };
  return { latency: held.latency, calls };
}

/**
 * Get to the point where the stretcher exists and the sound is going through
 * it, or say why not. Returns the render time playback was asked for at.
 */
function stretchedRun(
  ids: readonly string[],
  stems: (ctx: BaseAudioContext) => Record<string, AudioBuffer>,
  seconds: number,
  map: (ctx: BaseAudioContext, buffer: AudioBuffer) => Beats,
  tempo: number,
  during?: (when: number, transport: Transport) => void,
): Promise<{ out: AudioBuffer; transport: Transport; watched: Watched | null; failure: string | null }> {
  const { transport, ctx } = rig(ids, seconds);
  const made = stems(ctx);
  const beats = map(ctx, Object.values(made)[0]);
  transport.apply(resting(ids), ids);
  transport.load(made);
  tap(transport, ctx, ids);
  transport.setLoop(false);
  transport.warp(beats, tempo, true);
  let started = false;
  let failure: string | null = null;
  let watched: Watched | null = null;
  return pumped(ctx, 0.05, async (when) => {
    if (!started && when >= START) {
      if (transport.stretching !== 'ready') {
        failure = `the stretcher was ${transport.stretching} when playback was due`;
        started = true;
        return;
      }
      watched = watchSchedules(transport, ctx);
      transport.play(0);
      started = true;
      if (!transport.stretched) failure = 'the sound went straight rather than through the stretcher';
      return;
    }
    if (started && !failure) during?.(when, transport);
    await Promise.resolve();
  }).then((out) => ({ out, transport, watched, failure }));
}

/* ---------- the tests ---------- */

/**
 * Asked for a position, the head lands on it — measured as the shift between
 * two renders rather than against the file, so the band split's own delay is
 * on both sides of the subtraction and cancels.
 */
async function seekLands(): Promise<void> {
  const ids = ['drums'];
  const seconds = 5;
  const reference = await (async () => {
    const { transport, ctx } = rig(ids, seconds);
    transport.apply(resting(ids), ids);
    transport.load({ drums: noiseBuffer(ctx, 4, 7) });
    tap(transport, ctx, ids);
    transport.setLoop(false);
    transport.play(0);
    return (await ctx.startRendering()).getChannelData(0);
  })();

  const targets = [0.5, 1.23456, 2.7777, 3.5];
  const errors: Array<{ at: number; samples: number; score: number }> = [];
  for (const target of targets) {
    const { transport, ctx } = rig(ids, 1.2);
    transport.apply(resting(ids), ids);
    transport.load({ drums: noiseBuffer(ctx, 4, 7) });
    tap(transport, ctx, ids);
    transport.setLoop(false);
    transport.seek(target);
    const asked = transport.at();
    transport.play();
    const out = (await ctx.startRendering()).getChannelData(0);
    const from = Math.round((KICKOFF + 0.1) * RATE);
    const win = out.subarray(from, from + Math.round(0.4 * RATE));
    const { lag, score } = alignment(reference, win, from + Math.round(target * RATE), 240);
    errors.push({ at: target, samples: lag - (from + target * RATE), score });
    if (Math.abs(asked - target) > 1e-9) errors[errors.length - 1].samples = NaN;
  }

  const worst = Math.max(...errors.map((e) => Math.abs(e.samples)));
  const scored = Math.min(...errors.map((e) => e.score));
  report({
    name: 'seek lands the head where it was asked, to the millisecond',
    ok: worst <= 1.5 && scored > 0.99,
    detail: {
      worstErrorSamples: Number(worst.toFixed(3)),
      worstErrorMs: Number(((worst / RATE) * 1000).toFixed(4)),
      leastScore: Number(scored.toFixed(5)),
      seeks: errors.map((e) => ({ at: e.at, samples: Number(e.samples.toFixed(2)), score: Number(e.score.toFixed(5)) })),
    },
  });
}

/**
 * How rough the samples are either side of the wrap, against how rough they
 * are in the middle of the file.
 *
 * The file is a tone that meets itself, so the second difference is one small
 * number all the way along and a click at the join is a spike in it. One is
 * over the other, so a ratio near one is a join you cannot hear.
 */
async function loopRoughness(cycles: number): Promise<{ ratio: number; atJoin: number; elsewhere: number; level: number }> {
  const ids = ['drums'];
  const { transport, ctx } = rig(ids, 1);
  transport.apply(resting(ids), ids);
  transport.load({ drums: loopingSine(ctx, 2, cycles) });
  tap(transport, ctx, ids);
  transport.setLoop(true);
  transport.seek(1.8);
  transport.play();
  const out = (await ctx.startRendering()).getChannelData(0);

  const wrap = Math.round((KICKOFF + 0.2) * RATE);
  const jerk = (i: number): number => Math.abs(out[i] - 2 * out[i - 1] + out[i - 2]);
  let atJoin = 0;
  for (let i = wrap - 96; i <= wrap + 96; i++) atJoin = Math.max(atJoin, jerk(i));
  let elsewhere = 0;
  const quiet = Math.round((KICKOFF + 0.1) * RATE);
  for (let i = quiet; i < quiet + 2400; i++) elsewhere = Math.max(elsewhere, jerk(i));
  return { ratio: atJoin / (elsewhere || 1e-12), atJoin, elsewhere, level: rms(out, wrap - 480, wrap + 480) };
}

/**
 * The join at the top of a loop is the samples running on, not a new start.
 *
 * Measured twice: once on a file whose ends meet, where the join must be
 * invisible, and once on a file whose ends do not, where it must not be. The
 * second is the only thing that says the first was worth reading — a
 * measurement that cannot fail is not a test.
 */
async function loopIsContinuous(): Promise<void> {
  const clean = await loopRoughness(200);
  const control = await loopRoughness(200.5);
  report({
    name: 'the loop boundary is sample-continuous',
    ok: clean.ratio <= 3 && control.ratio > 10,
    detail: {
      wrapSample: Math.round((KICKOFF + 0.2) * RATE),
      ratio: Number(clean.ratio.toFixed(3)),
      jerkAtJoin: Number(clean.atJoin.toExponential(3)),
      jerkElsewhere: Number(clean.elsewhere.toExponential(3)),
      levelAtJoin: Number(clean.level.toFixed(5)),
      controlRatioOnAFileWhoseEndsDoNotMeet: Number(control.ratio.toFixed(1)),
    },
  });
}

/**
 * A loop round a section turns round at the section's end, not the file's.
 *
 * Where a stretch of the render came from is found by matching it against
 * *another render*, never against the file: everything reaches the output
 * through the band split, whose sum is flat in level but not in phase, so the
 * shape that went in is not the shape that comes out and the file no longer
 * matches itself. A straight play of the whole record from the top has been
 * through the same chain, so it is the ruler.
 *
 * The same rig with no span is the control. Without it this would pass on a
 * transport that ignored the span and simply never played that far.
 */
async function loopHoldsTheSection(): Promise<void> {
  const ids = ['drums'];
  const span = { from: 0.4, to: 0.7 };
  const WINDOW = 2048;

  const render = async (bounded: boolean | null): Promise<Float32Array> => {
    const { transport, ctx } = rig(ids, 1.4);
    transport.apply(resting(ids), ids);
    transport.load({ drums: noiseBuffer(ctx, 1, 7) });
    tap(transport, ctx, ids);
    transport.setLoop(bounded !== null);
    if (bounded) transport.setLoopSpan(span);
    transport.seek(bounded === null ? 0 : span.from);
    transport.play();
    return (await ctx.startRendering()).getChannelData(0);
  };

  // The ruler: the record played once, straight through, from the top.
  const ruler = await render(null);
  const reach = (out: Float32Array): { low: number; high: number; least: number } => {
    let low = Infinity;
    let high = -Infinity;
    let least = 1;
    for (let at = Math.round((KICKOFF + 0.02) * RATE); at + WINDOW < out.length; at += WINDOW * 2) {
      const win = out.slice(at, at + WINDOW);
      const mid = Math.round((KICKOFF + 0.5) * RATE);
      const { lag, score } = alignment(ruler, win, mid, Math.round(0.5 * RATE));
      if (score < 0.9) continue;
      // A lag in the ruler is a place in the record, once its own start is
      // taken off.
      low = Math.min(low, lag / RATE - KICKOFF);
      high = Math.max(high, (lag + WINDOW) / RATE - KICKOFF);
      least = Math.min(least, score);
    }
    return { low, high, least };
  };

  const kept = reach(await render(true));
  const free = reach(await render(false));
  report({
    name: 'a loop round a section turns round inside it',
    ok:
      Number.isFinite(kept.low) &&
      kept.low >= span.from - 0.005 &&
      kept.high <= span.to + 0.005 &&
      free.high > span.to + 0.05,
    detail: {
      section: span,
      cameFrom: [Number(kept.low.toFixed(4)), Number(kept.high.toFixed(4))],
      wholeFileReaches: Number(free.high.toFixed(4)),
      leastMatch: Number(kept.least.toFixed(4)),
    },
  });
}

const evenMap = (ctx: BaseAudioContext, buffer: AudioBuffer): Beats =>
  evenBeats(ctx.sampleRate, buffer.length, 120, 0);

/** A tempo far enough off the map's own that the transport will not call it straight. */
const OFF = 120.5;

/**
 * A change made while the stretcher is playing is filed beyond its latency,
 * and nothing goes missing where it lands.
 *
 * Both halves matter: the number the node is sent is the claim, and the
 * absence of a hole in the output is whether the claim held.
 */
async function warpIsScheduledAhead(): Promise<void> {
  const name = 'a warp change is scheduled past the stretcher’s latency';
  const change = 3;
  const { out, watched, failure } = await stretchedRun(
    ['drums'],
    (ctx) => ({ drums: chord(ctx, 6) }),
    7,
    evenMap,
    OFF,
    (when, transport) => {
      if (Math.abs(when - change) < 1e-9) transport.warp(evenBeats(RATE, Math.round(6 * RATE), 120, 0), 128, true);
    },
  );
  if (failure || !watched) {
    report({ name, ok: false, blocked: failure ?? 'no stretcher to watch', detail: {} });
    return;
  }
  const kept: Watched = watched;
  // The one change that comes out of `halt` is a mute filed at the present, and
  // the change that follows it is filed at the same instant — which drops it
  // again before a sample of it is heard. What has to be ahead of the latency
  // is what the node is asked to *read*, not that.
  const reads = kept.calls.filter((c) => c.now >= change - 0.001 && c.change.active !== false);
  const early = reads.filter((c) => (c.change.output ?? c.now) < c.now + kept.latency);
  const samples = out.getChannelData(0);
  const window = Math.round(0.005 * RATE);
  const held = dip(samples, Math.round((change - 0.05) * RATE), Math.round((change + 0.8) * RATE), window);
  const settled = dip(samples, Math.round((START + 0.5) * RATE), Math.round((change - 0.3) * RATE), window);

  report({
    name,
    ok: reads.length > 0 && early.length === 0 && held > settled * 0.5,
    detail: {
      latency: kept.latency,
      readsAfterTheEdit: reads.length,
      scheduledInsideTheLatency: early.length,
      firstLead: reads.length ? Number(((reads[0].change.output ?? 0) - reads[0].now).toFixed(4)) : null,
      muteFiledAtThePresent: kept.calls.some((c) => c.now >= change - 0.001 && c.change.active === false),
      quietestWindowAcrossTheEdit: Number(held.toFixed(4)),
      quietestWindowWhileSteady: Number(settled.toFixed(4)),
    },
  });
}

/**
 * Two stems over one stretcher come out on the same sample, across a tempo
 * change — the same carrier under different envelopes, so a shift between
 * them would show and a swap of the two would too.
 */
async function stemsStayLocked(): Promise<void> {
  const name = 'stems stay phase-locked through a tempo change';
  const ids = ['drums', 'bass'];
  const change = 3;
  const { out, failure } = await stretchedRun(
    ids,
    (ctx) => {
      const base = noiseBuffer(ctx, 6, 11);
      return { drums: base, bass: tremoloed(ctx, base, 3) };
    },
    7,
    evenMap,
    OFF,
    (when, transport) => {
      if (Math.abs(when - change) < 1e-9) transport.warp(evenBeats(RATE, Math.round(6 * RATE), 120, 0), 128, true);
    },
  );
  if (failure) {
    report({ name, ok: false, blocked: failure, detail: {} });
    return;
  }
  const a = out.getChannelData(0);
  const b = out.getChannelData(1);
  const from = Math.round((change + 0.5) * RATE);
  const win = b.subarray(from, from + Math.round(0.5 * RATE));
  const { lag, score, rival } = alignment(a, win, from, 480);
  const tremolo = rms(b, from, from + 4800) / Math.max(1e-9, rms(b, from + 4000, from + 8800));

  // Not how high the peak is — the tremolo alone holds it near 0.87, since the
  // two stems are the same carrier under different envelopes — but that it is
  // a peak, at nothing, and that the stems are plainly not the same signal.
  report({
    name,
    ok: lag === from && score > rival * 1.5 && tremolo > 1.2,
    detail: {
      lagSamples: lag - from,
      score: Number(score.toFixed(5)),
      bestScoreMoreThanEightSamplesOff: Number(rival.toFixed(5)),
      levelDrums: Number(rms(a, from, from + 24000).toFixed(5)),
      levelBass: Number(rms(b, from, from + 24000).toFixed(5)),
      envelopesDiffer: Number(tremolo.toFixed(3)),
    },
  });
}

/** Switching warp on must not change how loud it is. */
async function levelsMatch(): Promise<void> {
  const name = 'straight and stretched paths are level-matched';
  const ids = ['drums'];
  const seconds = 5;

  const straightLevel = await (async () => {
    const { transport, ctx } = rig(ids, seconds);
    transport.apply(resting(ids), ids);
    transport.load({ drums: chord(ctx, 4) });
    tap(transport, ctx, ids);
    transport.setLoop(false);
    transport.play(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    return rms(out, Math.round(1.5 * RATE), Math.round(3 * RATE));
  })();

  const { out, failure } = await stretchedRun(ids, (ctx) => ({ drums: chord(ctx, 4) }), seconds, evenMap, OFF);
  if (failure) {
    report({ name, ok: false, blocked: failure, detail: { straightLevel: Number(straightLevel.toFixed(5)) } });
    return;
  }
  const stretchedLevel = rms(out.getChannelData(0), Math.round((START + 0.5) * RATE), Math.round((START + 2) * RATE));
  const decibels = 20 * Math.log10(stretchedLevel / Math.max(1e-9, straightLevel));

  report({
    name,
    ok: Math.abs(decibels) <= 1,
    detail: {
      straightLevel: Number(straightLevel.toFixed(5)),
      stretchedLevel: Number(stretchedLevel.toFixed(5)),
      decibels: Number(decibels.toFixed(3)),
    },
  });
}

async function main(): Promise<void> {
  const runs: Array<[string, () => Promise<void>]> = [
    ['seek', seekLands],
    ['loop', loopIsContinuous],
    ['section', loopHoldsTheSection],
    ['level', levelsMatch],
    ['ahead', warpIsScheduledAhead],
    ['locked', stemsStayLocked],
  ];
  for (const [tag, run] of runs) {
    try {
      await run();
    } catch (error) {
      report({ name: tag, ok: false, blocked: `threw: ${String(error)}`, detail: {} });
    }
  }
  console.log('MIXDONE', JSON.stringify({ ran: outcomes.length, failed: outcomes.filter((o) => !o.ok).length }));
}

void main();
