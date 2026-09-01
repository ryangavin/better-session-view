import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BARS, LIBRARY, MODELS, STEMS, modelOf, slicesFor, type Slice, type Song } from './mock.ts';

/**
 * Everything the window knows, in one hook.
 *
 * One hook rather than a context, because there is one window and one song open
 * in it. `set/` earns its provider by having a socket and a snapshot behind it
 * that a hot update must not drop; this has neither yet, and inventing the
 * ceremony before the thing it protects would be cargo.
 *
 * What is simulated here is exactly one thing — the separation — and it is
 * marked. Everything else is real state doing its real job.
 */

export type Phase = 'idle' | 'running' | 'ready';

/** A stem's place in the mix. Not the stem itself, which is `mock.ts`'s. */
export interface Level {
  volume: number;
  muted: boolean;
  soloed: boolean;
}

export interface Job {
  /** 0 to 1, over the whole run. */
  done: number;
  stage: string;
  /** 0 to 1 per source, so the lanes fill in the order the model emits them. */
  perStem: Record<string, number>;
}

const REST: Level = { volume: 0.8, muted: false, soloed: false };

const levels = (): Record<string, Level> =>
  Object.fromEntries(STEMS.map((s) => [s.id, { ...REST }]));

/** How often the fake job ticks, and how much of it a tick is worth. */
const TICK_MS = 90;
const PER_TICK = 0.006;

export function useMix() {
  const [songs, setSongs] = useState<readonly Song[]>(LIBRARY);
  const [selected, setSelected] = useState(LIBRARY[0].id);
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('htdemucs_ft');
  const [level, setLevel] = useState<Record<string, Level>>(levels);
  const [slices, setSlices] = useState<Slice[]>(() => slicesFor(8));
  const [activeSlice, setActiveSlice] = useState(0);
  const [snap, setSnap] = useState('1/2');
  const [targetBpm, setTargetBpm] = useState(124);
  const [bpmAuto, setBpmAuto] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [bar, setBar] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [exporting, setExporting] = useState(false);

  const song = useMemo(() => songs.find((s) => s.id === selected) ?? songs[0], [songs, selected]);

  const phase: Phase = job ? 'running' : song.separated.length ? 'ready' : 'idle';

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle),
    );
  }, [songs, query]);

  /**
   * Solo is exclusive of mute, not of the other solos: any soloed stem plays,
   * and when none is soloed everything unmuted does. That is Live's rule and
   * the only one that behaves when you hold two of them down.
   */
  const audible = useCallback(
    (id: string): boolean => {
      const soloing = song.separated.some((s) => level[s]?.soloed);
      const own = level[id];
      if (!own) return false;
      return soloing ? own.soloed : !own.muted;
    },
    [level, song.separated],
  );

  // The one simulated thing in this file. A real run reports progress by
  // parsing demucs's stderr, which is a bar rather than a number — see
  // mix/docs/demucs.md — so this stands in for a parser that does not exist.
  const runningRef = useRef(false);
  runningRef.current = job !== null;
  useEffect(() => {
    if (!job) return;
    const sources = modelOf(model).sources;
    const timer = setInterval(() => {
      setJob((was) => {
        if (!was) return was;
        const done = was.done + PER_TICK;
        if (done >= 1) return null;
        // Staggered: each source finishes a fifth of the run after the last.
        const perStem = Object.fromEntries(
          sources.map((id, i) => {
            const from = (i / sources.length) * 0.7;
            return [id, Math.max(0, Math.min(1, (done - from) / 0.3))];
          }),
        );
        const stage =
          done < 0.12
            ? 'loading the model'
            : done < 0.2
              ? 'reading the file'
              : done < 0.94
                ? `separating · ${sources.length} sources`
                : 'writing stems';
        return { done, stage, perStem };
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [job === null, model]);

  // When it finishes, the song has stems. Marked here rather than in the tick
  // so the transition happens once and not on whichever tick crossed 1.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !job) {
      setSongs((all) =>
        all.map((s) =>
          s.id === selected ? { ...s, separated: modelOf(model).sources, model } : s,
        ),
      );
    }
    wasRunning.current = job !== null;
  }, [job, selected, model]);

  // The playhead, on the wall clock. It is not driving audio and does not
  // pretend to: the bar it reports is what a preview would be at, and the only
  // thing reading it is a 1px line.
  useEffect(() => {
    if (!playing) return;
    const beatMs = 60_000 / targetBpm;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const beats = (now - last) / beatMs;
      last = now;
      setBar((was) => {
        const next = was + beats / 4;
        if (next < BARS) return next;
        return loop ? 0 : BARS;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, targetBpm, loop]);

  const separate = useCallback(() => {
    setJob({ done: 0, stage: 'loading the model', perStem: {} });
  }, []);

  const cancel = useCallback(() => setJob(null), []);

  const adjust = useCallback((id: string, change: Partial<Level>) => {
    setLevel((was) => ({ ...was, [id]: { ...(was[id] ?? REST), ...change } }));
  }, []);

  const rename = useCallback((index: number, name: string) => {
    setSlices((was) => was.map((s, i) => (i === index ? { ...s, name } : s)));
  }, []);

  const resetMix = useCallback(() => setLevel(levels()), []);

  const stop = useCallback(() => {
    setPlaying(false);
    setBar(0);
  }, []);

  const touched = useMemo(
    () =>
      STEMS.filter((s) => {
        const own = level[s.id];
        return own && (own.muted || own.soloed || Math.abs(own.volume - REST.volume) > 0.001);
      }).length,
    [level],
  );

  return {
    songs: shown,
    total: songs.length,
    withStems: songs.filter((s) => s.separated.length > 0).length,
    song,
    phase,
    selected,
    select: setSelected,
    query,
    setQuery,
    model,
    setModel,
    models: MODELS,
    level,
    adjust,
    audible,
    resetMix,
    touched,
    slices,
    activeSlice,
    setActiveSlice,
    rename,
    snap,
    setSnap,
    targetBpm,
    setTargetBpm,
    bpmAuto,
    setBpmAuto,
    playing,
    setPlaying,
    loop,
    setLoop,
    bar,
    stop,
    job,
    separate,
    cancel,
    exporting,
    setExporting,
  };
}

export type Mix = ReturnType<typeof useMix>;
