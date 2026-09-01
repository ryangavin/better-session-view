import { useCallback, useEffect, useMemo, useState } from 'react';
import { BARS, STEMS, slicesFor, type Slice } from './mock.ts';
import {
  openflow,
  workingBpm,
  type Library,
  type Model,
  type Outcome,
  type Progress,
  type Track,
} from './openflow.ts';

/**
 * Everything the window knows, in one hook.
 *
 * One hook rather than a context, because there is one window and one track
 * open in it. `set/` earns its provider by having a socket and a snapshot
 * behind it that a hot update must not drop; this has neither, and inventing
 * the ceremony before the thing it protects would be cargo.
 *
 * The library here is **real** — a folder on disk, read through the context
 * bridge — and so is the separation: a model, a child process, stems written
 * into the library and recorded in its manifest. What is still invented is the
 * *drawing* of the audio, in `peaks.ts`, because nothing here has decoded the
 * stems that were written. That is marked where it happens.
 */

export type Phase = 'empty' | 'idle' | 'running' | 'ready';

/** A stem's place in the mix. Not the stem itself, which is `mock.ts`'s. */
export interface Level {
  volume: number;
  muted: boolean;
  soloed: boolean;
}

/** A separation in flight, as the main process reports it. */
export type Job = Progress;

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

const NOTHING: Library = { root: null, tracks: [] };

export function useMix() {
  const [library, setLibrary] = useState<Library>(NOTHING);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<Model[]>([]);
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
  /** The track being separated, which is not always the track being looked at. */
  const [runningId, setRunningId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [manual, setManual] = useState<Manual | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [note, setNote] = useState<string | null>(null);
  /** Why the last separation did not produce stems. Cleared by starting another. */
  const [problem, setProblem] = useState<string | null>(null);

  const tracks = library.tracks;

  const song = useMemo(
    () => tracks.find((t) => t.id === selected) ?? null,
    [tracks, selected],
  );

  /** The model about to be run, or null before the registry has been asked for. */
  const chosenModel = useMemo(
    () => models.find((m) => m.id === model) ?? null,
    [models, model],
  );

  /**
   * What to call a model a track was separated with.
   *
   * Falls back to the raw id rather than to a friendlier lie: a library carried
   * from a newer build can name a model this one does not have, and "htdemucs_x"
   * is a better answer there than the name of a different model.
   */
  const labelOf = useCallback(
    (id: string | null): string => (id ? (models.find((m) => m.id === id)?.label ?? id) : ''),
    [models],
  );

  /**
   * Running is a state of *this* track, not of the app.
   *
   * A separation takes minutes and there is no reason to be held on one page
   * while it runs — so looking at another song shows that song's own state, and
   * coming back shows the bar again. The header says what is separating from
   * anywhere.
   */
  const phase: Phase = !song
    ? 'empty'
    : job && runningId === song.id
      ? 'running'
      : song.sources.length
        ? 'ready'
        : 'idle';

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

  /**
   * The models this build will run, asked for rather than restated.
   *
   * Without an app around the page there are none, and the window says so —
   * the alternative is a second copy of the registry here that a browser
   * session would offer and no job could honour.
   *
   * `busy` covers one real case: reloading the renderer during a `vite`
   * session does not stop the main process, so a job started before the reload
   * is still running and still reporting. Asking on mount is what reattaches
   * the window to it instead of showing an idle page over a running GPU.
   */
  useEffect(() => {
    const bridge = openflow();
    if (!bridge) return;
    void bridge.separate.models().then(setModels);
    void bridge.separate.busy().then((id) => {
      if (id) setRunningId(id);
    });
  }, []);

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

  /**
   * The separation, as it happens.
   *
   * Progress arrives as an event rather than as the resolution of a promise,
   * because it arrives hundreds of times over minutes and there is nothing to
   * reply to. Both listeners are mounted once, for the window rather than for
   * the page showing the job — a separation takes minutes and there is no
   * reason to be held on one track while it runs, so the track it belongs to is
   * kept beside it and `phase` is what decides who draws a bar.
   *
   * `finished` refreshes the library rather than patching state, because by then
   * the manifest on disk is the truth — the main process wrote it — and a second
   * copy of that truth held here is the thing that would go stale.
   */
  useEffect(() => {
    const bridge = openflow();
    if (!bridge) return;
    const offProgress = bridge.separate.onProgress(({ trackId, progress }) => {
      // One job at a time is the runner's rule, so the job that reports is the
      // job that is running — there is no second one this could be confused
      // with. Which *track* it belongs to still matters, because the window can
      // be moved to another song while it runs.
      setRunningId(trackId);
      setJob(progress);
    });
    const offFinished = bridge.separate.onFinished((outcome) => {
      setJob(null);
      setRunningId(null);
      if (!outcome.ok) setProblem(outcome.cancelled ? null : outcome.says);
      else setProblem(null);
      void refresh();
    });
    return () => {
      offProgress();
      offFinished();
    };
  }, [refresh]);

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

  /**
   * Start one.
   *
   * The promise this awaits resolves at the *end* of the job, minutes later,
   * and is not what draws the bar — the progress listener above is. What it is
   * for is the case where the job never started at all: no library, no model,
   * no `uv`. Those come back as an outcome rather than as a rejection, so they
   * land in the same place every other reason a track has no stems does.
   */
  const separate = useCallback(async () => {
    const bridge = openflow();
    if (!bridge || !song) return;
    setProblem(null);
    setRunningId(song.id);
    setJob({ done: 0, stage: 'loading the model', sources: [], perStem: null, written: [], seconds: null });
    const outcome = await bridge.separate.run({ trackId: song.id, file: song.file, model });
    if (!outcome.ok && !outcome.cancelled) setProblem(outcome.says);
  }, [song, model]);

  /**
   * Stop it, naming the track.
   *
   * Named because a cancel that arrives after the job it meant has finished
   * would otherwise kill the next one. The main process checks the name too;
   * this is the half that stops the window drawing a bar for something it has
   * already asked to end.
   */
  const cancel = useCallback(() => {
    const id = runningId;
    setJob(null);
    setRunningId(null);
    if (id) void openflow()?.separate.cancel(id);
  }, [runningId]);

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
    models,
    chosenModel,
    labelOf,
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
    runningId,
    problem,
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
