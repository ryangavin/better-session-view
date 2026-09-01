import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BARS, MODELS, STEMS, modelOf, slicesFor, type Slice } from './mock.ts';
import { openflow, workingBpm, type Library, type Track } from './openflow.ts';

/**
 * Everything the window knows, in one hook.
 *
 * One hook rather than a context, because there is one window and one track
 * open in it. `set/` earns its provider by having a socket and a snapshot
 * behind it that a hot update must not drop; this has neither, and inventing
 * the ceremony before the thing it protects would be cargo.
 *
 * The library here is **real** — a folder on disk, read through the context
 * bridge. What is still simulated is exactly one thing, the separation, and it
 * is marked. Everything else is real state doing its real job.
 */

export type Phase = 'empty' | 'idle' | 'running' | 'ready';

/** A stem's place in the mix. Not the stem itself, which is `mock.ts`'s. */
export interface Level {
  volume: number;
  muted: boolean;
  soloed: boolean;
}

export interface Job {
  done: number;
  stage: string;
  perStem: Record<string, number>;
}

/**
 * Setting the grid by hand, which is two clicks and then a nudge.
 *
 * Detection gets the tempo right and the *phase* wrong often enough that a
 * manual path is not a fallback so much as the other half of the feature: two
 * points far apart pin both, and everything between them follows.
 */
export interface Manual {
  stage: 'first' | 'late' | 'tune';
  first: number | null;
  late: number | null;
}

/** A point where the grid is pinned to the audio. */
export interface Anchor {
  at: number;
  label: string;
}

const REST: Level = { volume: 0.8, muted: false, soloed: false };

const levels = (): Record<string, Level> =>
  Object.fromEntries(STEMS.map((s) => [s.id, { ...REST }]));

/** How often the fake job ticks, and how much of it a tick is worth. */
const TICK_MS = 90;
const PER_TICK = 0.006;

const NOTHING: Library = { root: null, tracks: [] };

export function useMix() {
  const [library, setLibrary] = useState<Library>(NOTHING);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('htdemucs_ft');
  const [level, setLevel] = useState<Record<string, Level>>(levels);
  const [slices, setSlices] = useState<Slice[]>(() => slicesFor(8));
  const [activeSlice, setActiveSlice] = useState(0);
  const [snap, setSnap] = useState('1/2');
  const [targetBpm, setTargetBpm] = useState(120);
  const [bpmAuto, setBpmAuto] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [bar, setBar] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [exporting, setExporting] = useState(false);
  const [manual, setManual] = useState<Manual | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [note, setNote] = useState<string | null>(null);

  /**
   * Simulated separations, held here and **never written to the manifest**.
   *
   * The job in this file is a stand-in for a parser that does not exist yet, so
   * recording its result in the user's library would be writing a lie into a
   * file they own. It lives for as long as the window does, which is exactly as
   * long as the pretence is useful.
   */
  const [pretend, setPretend] = useState<Record<string, { model: string; sources: string[] }>>({});

  const tracks = useMemo(
    () =>
      library.tracks.map((t) => {
        const faked = pretend[t.id];
        return faked ? { ...t, model: faked.model, sources: faked.sources } : t;
      }),
    [library.tracks, pretend],
  );

  const song = useMemo(
    () => tracks.find((t) => t.id === selected) ?? null,
    [tracks, selected],
  );

  const phase: Phase = !song ? 'empty' : job ? 'running' : song.sources.length ? 'ready' : 'idle';

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        (t.artist ?? '').toLowerCase().includes(needle),
    );
  }, [tracks, query]);

  /** The library, read once on mount and again after anything that changes it. */
  const refresh = useCallback(async () => {
    const bridge = openflow();
    if (!bridge) {
      setLoading(false);
      return;
    }
    setLibrary(await bridge.library.read());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const chooseFolder = useCallback(async () => {
    const bridge = openflow();
    if (!bridge) return;
    setLibrary(await bridge.library.choose());
    setSelected(null);
    setNote(null);
  }, []);

  /**
   * Import, and say what happened.
   *
   * A refusal is per file rather than for the batch — dragging a folder in
   * means a stray `.DS_Store` or a PDF, and one of those must not stop the
   * eleven WAVs beside it.
   */
  const importTracks = useCallback(async (files?: string[]) => {
    const bridge = openflow();
    if (!bridge) return;
    const done = await bridge.library.add(files);
    setLibrary({ root: done.root, tracks: done.tracks, problem: done.problem });
    setNote(
      done.added === 0 && done.refused.length === 0
        ? null
        : [
            done.added > 0 ? `imported ${done.added}` : null,
            done.refused.length > 0 ? `skipped ${done.refused.length}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
    );
  }, []);

  const reveal = useCallback(() => void openflow()?.library.reveal(), []);

  /**
   * Solo is exclusive of mute, not of the other solos: any soloed stem plays,
   * and when none is soloed everything unmuted does. That is Live's rule and
   * the only one that behaves when you hold two of them down.
   */
  const audible = useCallback(
    (id: string): boolean => {
      if (!song) return false;
      const soloing = song.sources.some((s) => level[s]?.soloed);
      const own = level[id];
      if (!own) return false;
      return soloing ? own.soloed : !own.muted;
    },
    [level, song],
  );

  // The one simulated thing in this file. A real run reports progress by
  // parsing demucs's stderr, which is a bar rather than a number — see
  // mix/docs/demucs.md — so this stands in for a parser that does not exist.
  useEffect(() => {
    if (!job) return;
    const sources = modelOf(model).sources;
    const timer = setInterval(() => {
      setJob((was) => {
        if (!was) return was;
        const done = was.done + PER_TICK;
        if (done >= 1) return null;
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

  // When it finishes, the track has stems — in this window only.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !job && selected) {
      setPretend((was) => ({
        ...was,
        [selected]: { model, sources: [...modelOf(model).sources] },
      }));
    }
    wasRunning.current = job !== null;
  }, [job, selected, model]);

  // The playhead, on the wall clock. It is not driving audio and does not
  // pretend to: the bar it reports is what a preview would be at, and the only
  // thing reading it is a 1px line.
  useEffect(() => {
    if (!playing) return;
    const beatMs = 60_000 / (targetBpm || 120);
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

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      setAnchors([]);
      setManual(null);
      setBar(0);
      setPlaying(false);
      const picked = tracks.find((t) => t.id === id);
      setTargetBpm(workingBpm(picked ?? null));
      setBpmAuto(picked?.bpm !== null && picked?.bpm !== undefined);
    },
    [tracks],
  );

  const separate = useCallback(() => {
    setJob({ done: 0, stage: 'loading the model', perStem: {} });
  }, []);

  const cancel = useCallback(() => setJob(null), []);

  const autoWarp = useCallback(() => {
    setAnchors([
      { at: 0, label: '1' },
      { at: BARS, label: String(BARS + 1) },
    ]);
    setManual(null);
  }, []);

  const startManual = useCallback(() => setManual({ stage: 'first', first: null, late: null }), []);
  const endManual = useCallback(() => setManual(null), []);

  const pin = useCallback(
    (at: number) => {
      if (!manual) {
        setBar(at);
        return;
      }
      if (manual.stage === 'first') {
        setManual({ ...manual, stage: 'late', first: at });
        setAnchors([{ at, label: '1' }]);
        return;
      }
      const first = manual.first ?? 0;
      setManual({ ...manual, stage: 'tune', late: at });
      setAnchors([
        { at: first, label: '1' },
        { at, label: String(Math.max(2, Math.round(at - first) + 1)) },
      ]);
    },
    [manual],
  );

  const nudge = useCallback(
    (direction: number) => {
      setAnchors((was) =>
        was.map((a, i) =>
          i === was.length - 1 ? { ...a, at: a.at + (direction * 0.01 * targetBpm) / 240 } : a,
        ),
      );
    },
    [targetBpm],
  );

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

  /** `4/6 audible`, and whether a solo is what is doing it. */
  const audibleLine = useMemo(() => {
    if (!song?.sources.length) return '';
    const soloing = song.sources.some((id) => level[id]?.soloed);
    const heard = song.sources.filter((id) =>
      soloing ? level[id]?.soloed : !level[id]?.muted,
    ).length;
    return `${heard}/${song.sources.length} audible${soloing ? ' · solo' : ''}`;
  }, [song, level]);

  const touched = useMemo(
    () =>
      STEMS.filter((s) => {
        const own = level[s.id];
        return own && (own.muted || own.soloed || Math.abs(own.volume - REST.volume) > 0.001);
      }).length,
    [level],
  );

  return {
    library,
    loading,
    chooseFolder,
    importTracks,
    reveal,
    note,
    songs: shown,
    total: tracks.length,
    withStems: tracks.filter((t) => t.sources.length > 0).length,
    song,
    phase,
    selected,
    select,
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
    manual,
    startManual,
    endManual,
    anchors,
    autoWarp,
    pin,
    nudge,
    audibleLine,
  };
}

export type Mix = ReturnType<typeof useMix>;
export type { Track };
