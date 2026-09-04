import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STEMS } from './mock.ts';
import { cut, dragged, removed, slicesFor, slicesOf, type Slice } from './slices.ts';
import { decode, fileUrl, LIBRARY, packed, peaksOf, stemUrl, unpacked, type Peak } from './audio.ts';
import { REST, Transport, type Level, type Stretching } from './engine.ts';
import { FLAT, isFlat, type Bands } from './eq.ts';
import { forTrack, recall, remember, withTrack, type Remembered, type Session } from './remember.ts';
import { barAt, countOf, evenBeats, moved, placeOf, resampled, shifted, startOf, type Beats } from './warp.ts';
import { fitOf, refitOf, snapped, FASTEST, SLOWEST, type Fit } from './tempo.ts';
import { hearing, type Heard } from './transients.ts';
import {
  openflow,
  type Library,
  type Edits,
  type Imported,
  type Match,
  type Model,
  type Progress,
  type Transcribed,
  type TranscribeOutcome,
  type TranscribeProgress,
  type Track,
  type Analysis,
  type Grid,
  type Reading,
} from './openflow.ts';
import { STANDARD_BASS } from './tab.ts';
import { followOf, type Follow } from './follow.ts';

/**
 * Everything the window knows, in one hook.
 *
 * One hook rather than a context, because there is one window and one track
 * open in it. `set/` earns its provider by having a socket and a snapshot
 * behind it that a hot update must not drop; this has neither, and inventing
 * the ceremony before the thing it protects would be cargo.
 *
 * **Nothing here is pretend any more.** The library is a folder on disk. The
 * separation is a child process. The waveforms are the stems that process
 * wrote, decoded, and the transport plays those same buffers — so the picture
 * and the sound cannot disagree, which they could the moment they came from two
 * places. What is still invented is the *slices*: eight evenly spaced spans
 * with names, because nothing detects an arrangement yet.
 *
 * **The window remembers itself across a reload.** Which track is open, the
 * mix, where the head was — `remember.ts`. Not the library and not the stems:
 * those are on disk, and a second copy of the truth is the copy that goes
 * stale.
 */

export type Phase = 'empty' | 'idle' | 'running' | 'ready';

export type { Level };

/** A separation in flight, as the main process reports it. */
export type Job = Progress;

/**
 * Setting the grid by hand, which is two clicks and then a nudge.
 *
 * A fit gets the tempo right and the *phase* wrong often enough that a manual
 * path is not a fallback so much as the other half of the feature.
 *
 * **The two clicks are a counted span, not the two ends of the song.** Asking
 * for the last downbeat is asking somebody to find bar 97 of a song they have
 * not gridded yet, which is the one thing a person is worst at and a computer
 * is best at. Counting *four* is what a person does without thinking. The
 * accuracy that gives up is handed straight back by `refitOf`: the clicks say
 * which beat and which downbeat are meant, and the same least-squares line over
 * every kick in the track sets the tempo from there.
 *
 * **Neither click is bar 1.** A downbeat is a downbeat wherever it is in the
 * song, and somebody who scrolled to the drop and marked one there has said
 * where the bars fall, not which bar that was. Bar 1 is the first downbeat in
 * the file, the same as it is for a fit, and the pins are numbered with
 * whatever bars the clicks turn out to have landed on.
 */
export interface Manual {
  stage: 'first' | 'late' | 'tune';
  /** How many bars apart the two clicks are meant to be. */
  span: number;
  first: number | null;
}

/** The spans worth counting out. Four is the one nobody has to think about. */
export const SPANS = [1, 2, 4, 8];

/** A point where the grid is pinned to the audio. */
export interface Anchor {
  at: number;
  label: string;
}

/** A pin on the bar a click landed on, numbered from wherever the grid puts bar 1. */
const pinAt = (second: number, offset: number, bpm: number): Anchor => {
  const bar = Math.round(((second - offset) * bpm) / 240);
  return { at: bar, label: String(bar + 1) };
};

/**
 * Every stem at rest, or as remembered — filled in field by field, so a store
 * written before the bands existed comes back with flat bands rather than
 * none.
 */
const levels = (known?: Record<string, Partial<Level>>): Record<string, Level> =>
  Object.fromEntries(STEMS.map((s) => [s.id, { ...REST, ...known?.[s.id] }]));

/**
 * Columns of peaks per stem.
 *
 * Computed once per track rather than per lane width, so a resize is a redraw
 * and not a re-scan of forty million samples.
 *
 * The count decides where a lane stops drawing peaks and starts drawing the
 * audio itself — that happens when a column of them is wider than a pixel,
 * which at this resolution is around ten times a window's width. It is a
 * balance rather than a preference: fewer columns hands over early, where a
 * screenful is still millions of samples to walk on every wheel tick, and more
 * spends the load scanning detail nothing ever draws.
 */
const COLUMNS = 9000;

/** Bars, before anything has been decoded, so the ruler is not zero wide. */
const BARS_UNKNOWN = 64;

/** The rate a map is counted in before the graph exists to say. */
const NOMINAL_RATE = 44100;

/** The map before anything has been decoded: those bars at 120 across a nominal file. */
const UNKNOWN: Beats = evenBeats(NOMINAL_RATE, BARS_UNKNOWN * 2 * NOMINAL_RATE, 120, 0);

const NOTHING: Library = { root: null, tracks: [] };

/** How long the window sits still before writing what it remembers. */
const SETTLE_MS = 400;

/** The last fit without its map, which is the grid's to keep. */
const readingOf = (found: Fit | Follow | null): Reading | null => {
  if (!found) return null;
  if ('beats' in found) {
    const { beats: _beats, ...rest } = found;
    return rest;
  }
  return found;
};

/** The reading with its map back, so the header can say it was followed. */
const foundOf = (held: Analysis): Fit | Follow | null => {
  if (!held.fit) return null;
  if ('tracked' in held.fit && held.grid?.beats) return { ...held.fit, beats: held.grid.beats };
  return held.fit;
};


export function useMix() {
  const kept = useRef<Session>(recall()).current;
  /**
   * What was remembered about the track that was open, read once so the window
   * comes back *already* holding it.
   *
   * Restoring in an effect instead would paint one frame of defaults first — a
   * visible flash of unity faders and a playhead at zero on top of the mix
   * somebody actually left. And it was worse than cosmetic: routing the restore
   * through `select` meant the guard that stops a re-click reloading the open
   * track also stopped the *first* load, so nothing was restored at all.
   */
  const first = kept.selected ? forTrack(kept, kept.selected) : {};

  const [library, setLibrary] = useState<Library>(NOTHING);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(kept.selected ?? null);
  const [query, setQuery] = useState(kept.query ?? '');
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState(kept.model ?? 'htdemucs_ft');
  const [level, setLevel] = useState<Record<string, Level>>(() => levels(first.levels));
  const [slices, setSlices] = useState<Slice[]>(() => slicesFor(8, BARS_UNKNOWN));
  /**
   * Whether the slices are still the window's reading, untouched.
   *
   * An untouched set is a *reading* rather than a decision, so it is read
   * again whenever the stems or the grid change and it is never written down.
   * Once somebody renames, moves, cuts or removes one it becomes theirs, kept
   * beside the track in the analysis file, and from then on it is exactly as
   * they left it — including its bar positions, which is why the reading has
   * to stop.
   */
  const [slicesAuto, setSlicesAuto] = useState(true);
  const [activeSlice, setActiveSlice] = useState(0);
  const [targetBpm, setTargetBpm] = useState(first.bpm ?? 120);
  const [bpmAuto, setBpmAuto] = useState(first.bpmAuto ?? true);
  /** Seconds from the top of the file to the downbeat of bar 1. */
  const [offset, setOffset] = useState(first.offset ?? 0);
  /**
   * Where the beats fall, once something has found them: the map, an anchor
   * for every beat, and the only source of truth about timing.
   *
   * Null is the even ruling `targetBpm` and `offset` make, which is what a
   * typed tempo rules and what the ruler shows before anything has been
   * measured. A fit or a hand replaces it, and from then on the grid is the
   * map's: the tempo field says what *plays*, not where the beats are, and
   * no tempo is stored anywhere — every one on screen is read off the spacing.
   */
  const [beats, setBeats] = useState<Beats | null>(first.beats ?? null);
  /** The last fit, kept so the window can say where the tempo on screen came from. */
  const [detected, setDetected] = useState<Fit | Follow | null>(null);
  /**
   * That the last attempt found nothing, which is not the same as not having
   * tried. A button press with no visible answer reads as a broken button.
   */
  const [fitFailed, setFitFailed] = useState(false);
  /**
   * Whether this track is still owed a fit.
   *
   * Set when a track is opened that nothing has been decided about, and cleared
   * by the first fit. It is what makes the grid arrive with the audio rather
   * than after a button press: a track opens at its own tempo, not at 120.
   * Anything remembered — a fit that was nudged, a tempo typed in — is a
   * decision, and a decision is not re-taken behind somebody's back.
   */
  const [wantFit, setWantFit] = useState(first.bpm == null);
  /**
   * Whether the library has answered about this track's grid.
   *
   * The grid kept beside the track — `mix/electron/analysis.ts` — is read after
   * the track is opened, and until it has been read nothing about the grid is
   * trusted enough to write down or to measure over: the first fit waits, and
   * so does the writer, or a window that opened a second ago would overwrite
   * a grid a hand made last week with the default it had not yet replaced.
   */
  const [asked, setAsked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoopState] = useState(kept.loop ?? true);
  /**
   * Whether the stems play stretched to the header's tempo.
   *
   * Live's warp switch. On, every bar of the record is played in the time the
   * tempo gives a bar, whatever it took on the record; off, the record plays
   * as it was and the grid is only a ruling over it. A session setting rather
   * than a track's, like loop: it is how you are listening, not what the song
   * is.
   */
  const [warp, setWarpState] = useState(kept.warp ?? false);
  const [stretching, setStretching] = useState<Stretching>('idle');
  /** Seconds from the top of the track. The one position everything else derives from. */
  const [position, setPosition] = useState(first.at ?? 0);
  const [job, setJob] = useState<Job | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [transcribeJob, setTranscribeJob] = useState<TranscribeProgress | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<Transcribed | null>(null);
  const [transcribeProblem, setTranscribeProblem] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [manual, setManual] = useState<Manual | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [noteBad, setNoteBad] = useState(false);
  const [importing, setImporting] = useState(false);

  /**
   * The audio graph, made once and kept for the life of the window.
   *
   * A ref rather than state because nothing about it belongs in a render: the
   * audio clock runs whether or not React did anything, and a graph rebuilt on
   * every render is a click on every render.
   */
  const transport = useRef<Transport | null>(null);
  if (!transport.current) transport.current = new Transport();
  const audio = transport.current;

  /**
   * The session as it stands, which is not the same as the session at mount.
   *
   * `kept` is what was on disk when the window opened and never changes.
   * Everything written since lives here, and it is what a track switch reads
   * from — otherwise going A → B → A inside one session would hand back A's mix
   * as it was when the window opened, silently discarding everything done to it.
   */
  const held = useRef<Session>(kept);

  /** Where the main process says it serves the library from. */
  const [base, setBase] = useState(LIBRARY);
  const [peaks, setPeaks] = useState<Record<string, Peak[]>>({});
  const [duration, setDuration] = useState(0);
  const [decoding, setDecoding] = useState(false);
  /** Why there is no sound, when there is none. */
  const [audioProblem, setAudioProblem] = useState<string | null>(null);

  /**
   * The track whose separation is being set up again, if any.
   *
   * A separation is keyed on the file's content hash and the model — see
   * `electron/job.ts` — so re-running the *same* model over the same file is a
   * no-op the main process answers from disk. Redoing one therefore means
   * choosing again, which means the setup screen, which was unreachable the
   * moment a track had stems. This is what reaches it: an id rather than a
   * boolean, so opening a *different* track shows that track's own state rather
   * than the setup somebody opened over here.
   */
  const [setupFor, setSetupFor] = useState<string | null>(null);
  /** Candidates from the catalogue, and whether one is being asked for. */
  const [matches, setMatches] = useState<Match[]>([]);
  const [matching, setMatching] = useState(false);

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
   * coming back shows the bar again.
   */
  const phase: Phase = !song
    ? 'empty'
    : job && runningId === song.id
      ? 'running'
      : song.sources.length && setupFor !== song.id
        ? 'ready'
        : 'idle';

  /**
   * How long the track is, in seconds.
   *
   * The decoded audio when there is any, because that is what will actually
   * play; the manifest's measurement before it has been decoded, so the ruler
   * is the right width while the stems load rather than snapping to length a
   * second later.
   */
  const seconds = duration || song?.seconds || 0;

  /**
   * Where the bars fall, which is a *reading* of the audio rather than a
   * property of it.
   *
   * Two numbers, not one. A tempo says how long a bar is and the offset says
   * where the first one starts, and a grid missing either is a grid that cannot
   * be made right: no tempo fixes a song with a quarter-second of air in front
   * of it, because every line is that quarter second late for the whole song.
   * Change either and this changes with it, which is the whole point of the
   * warp lane underneath — the ticks stop lining up.
   */
  const grid = useMemo<Beats>(() => {
    if (!(seconds > 0)) return UNKNOWN;
    const rate = audio.rate || NOMINAL_RATE;
    const length = Math.round(seconds * rate);
    return beats ? resampled(beats, rate, length) : evenBeats(rate, length, targetBpm, offset);
    // `peaks` is here because the graph's rate is only known once something
    // has been decoded, and decoding is what fills them in.
  }, [seconds, targetBpm, offset, beats, audio, peaks]);

  /**
   * How many bars the song holds, counting bar 1 as the first.
   *
   * A count, and nothing rules with it — the lanes rule from `grid`. It used to
   * be both, and being both is what quietly rounded the tempo: a count is a
   * `ceil`, so a two-hundred-second track at 128 was drawn as 107 bars and
   * therefore ruled at 128.4.
   */
  const bars = useMemo(() => countOf(grid), [grid]);

  /** The head, in bars, for the clock and the playhead. */
  const bar = seconds > 0 ? barAt(grid, position / seconds) : 0;

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
   * `busy` covers one real case, and it is the one that matters most for
   * somebody reloading between actions: the renderer restarting does not stop
   * the main process, so a job started before the reload is still running and
   * still reporting. Asking on mount is what reattaches the window to it
   * instead of showing an idle page over a running GPU.
   */
  useEffect(() => {
    const bridge = openflow();
    if (!bridge) return;
    void bridge.library.base().then(setBase);
    void bridge.separate.models().then(setModels);
    void bridge.separate.busy().then((id) => {
      if (id) setRunningId(id);
    });
    void bridge.transcribe.busy().then((id) => {
      if (id) setTranscribingId(id);
    });
  }, []);

  const chooseFolder = useCallback(async () => {
    const bridge = openflow();
    if (!bridge) return;
    setLibrary(await bridge.library.choose());
    setSelected(null);
    setNote(null);
    setNoteBad(false);
  }, []);

  /**
   * Import, and say what happened.
   *
   * A refusal is per file rather than for the batch — dragging several files
   * means a stray `.DS_Store` or a PDF, and one of those must not stop the
   * eleven WAVs beside it.
   */
  const finishImport = useCallback((done: Imported): boolean => {
    setLibrary({ root: done.root, tracks: done.tracks, problem: done.problem });
    const failed = done.added === 0 && done.refused.length > 0;
    setNoteBad(failed);
    setNote(
      done.added === 0 && done.refused.length === 0
        ? null
        : failed
          ? done.refused[0] ?? 'nothing was imported'
          : [
              done.added > 0 ? `imported ${done.added}` : null,
              done.refused.length > 0 ? `skipped ${done.refused.length}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
    );
    return done.added > 0;
  }, []);

  const importTracks = useCallback(async () => {
    const bridge = openflow();
    if (!bridge || importing) return;
    setImporting(true);
    try {
      finishImport(await bridge.library.add());
    } catch (why) {
      setNote((why as Error).message);
      setNoteBad(true);
    } finally {
      setImporting(false);
    }
  }, [finishImport, importing]);

  /** Genuine dropped `File`s become paths only inside the isolated preload. */
  const importDropped = useCallback(async (files: File[]) => {
    const bridge = openflow();
    if (!bridge || importing || files.length === 0) return;
    setImporting(true);
    try {
      finishImport(await bridge.library.drop(files));
    } catch (why) {
      setNote((why as Error).message);
      setNoteBad(true);
    } finally {
      setImporting(false);
    }
  }, [finishImport, importing]);

  /** Fetch one URL; true lets the form clear only after an actual import. */
  const importYoutube = useCallback(async (url: string): Promise<boolean> => {
    const bridge = openflow();
    if (!bridge || importing) return false;
    setImporting(true);
    setNote('fetching YouTube audio…');
    setNoteBad(false);
    try {
      return finishImport(await bridge.library.youtube(url));
    } catch (why) {
      setNote((why as Error).message);
      setNoteBad(true);
      return false;
    } finally {
      setImporting(false);
    }
  }, [finishImport, importing]);

  const reveal = useCallback(() => void openflow()?.library.reveal(), []);

  /**
   * Solo is exclusive of mute, not of the other solos: any soloed stem plays,
   * and when none is soloed everything unmuted does. That is Live's rule and
   * the only one that behaves when you hold two of them down.
   *
   * The same rule decides the gain in `engine.ts`, so what the lane looks like
   * and what comes out of the speakers are one function.
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
   * the page showing the job.
   *
   * `finished` refreshes the library rather than patching state, because by then
   * the manifest on disk is the truth — the main process wrote it — and a second
   * copy of that truth held here is the thing that would go stale.
   */
  useEffect(() => {
    const bridge = openflow();
    if (!bridge) return;
    const offProgress = bridge.separate.onProgress(({ trackId, progress }) => {
      setRunningId(trackId);
      setJob(progress);
    });
    const offFinished = bridge.separate.onFinished((outcome) => {
      setJob(null);
      setRunningId(null);
      setProblem(outcome.ok || outcome.cancelled ? null : outcome.says);
      void refresh();
    });
    return () => {
      offProgress();
      offFinished();
    };
  }, [refresh]);

  /** Bass transcription is another view onto the same one-worker GPU queue. */
  useEffect(() => {
    const bridge = openflow();
    if (!bridge) return;
    const finish = (outcome: TranscribeOutcome) => {
      setTranscribeJob(null);
      setTranscribingId(null);
      setTranscription(outcome.ok ? outcome : null);
      setTranscribeProblem(outcome.ok || outcome.cancelled ? null : outcome.says);
    };
    const offProgress = bridge.transcribe.onProgress(({ trackId, progress }) => {
      setTranscribingId(trackId);
      setTranscribeJob(progress);
    });
    const offFinished = bridge.transcribe.onFinished(finish);
    return () => {
      offProgress();
      offFinished();
    };
  }, []);

  /**
   * Load the stems, decode them, and draw them.
   *
   * Keyed on the stem *directory* rather than on the track, so separating the
   * same song again with another model reloads — the manifest's `stems` path
   * changes and this notices. `live` guards the whole thing: decoding four
   * stems takes a moment, and clicking through the library faster than that
   * would otherwise land an earlier track's audio on a later track's lanes.
   *
   * The peaks come off the same `AudioBuffer`s the transport is handed, which
   * is the entire reason this is one effect and not two. A drawing derived from
   * anywhere else can disagree with what you hear, and then it looks like the
   * file is wrong.
   *
   * **A lane is drawn the moment its own stem is ready, not when the last one
   * is.** The lanes and their controls come from the manifest and are on screen
   * immediately; what arrives here is the drawing inside them, one at a time.
   * Holding all of them back for a single `setPeaks` made opening a track a
   * pause and then a jump, and holding the *outgoing* track's drawing on screen
   * during it was worse — a second of the last song under this song's name.
   */
  const stemsAt = song?.stems ?? null;
  const sourceList = song?.sources.join(',') ?? '';
  const songId = song?.id ?? null;
  useEffect(() => {
    if (!stemsAt || sourceList === '') {
      audio.clear();
      setPeaks({});
      setDuration(0);
      setAudioProblem(null);
      setPlaying(false);
      return;
    }
    let live = true;
    setDecoding(true);
    setAudioProblem(null);
    // Whatever was drawn belongs to the track that is being left.
    setPeaks({});
    void (async () => {
      try {
        const sources = sourceList.split(',');
        // The drawing kept beside the track, if there is one, goes up before a
        // byte of audio is read: it is what makes a track open on its lanes
        // rather than on four blank strips and a wait.
        const bridge = openflow();
        const kept =
          bridge && songId
            ? await bridge.analysis.peaks(songId, stemsAt).catch(() => null)
            : null;
        if (!live) return;
        const drawn: Record<string, Peak[]> = {};
        if (kept && kept.columns === COLUMNS) {
          for (const source of sources) {
            if (kept.sources[source]) drawn[source] = unpacked(kept.sources[source]);
          }
          setPeaks({ ...drawn });
        }
        let walked = false;
        const decoded = await Promise.all(
          sources.map(async (source) => {
            const answer = await fetch(stemUrl(base, stemsAt, source));
            if (!answer.ok) throw new Error(`${source}.wav — ${answer.status}`);
            const buffer = await decode(audio.audio(), await answer.arrayBuffer());
            // Drawn now, while its neighbours are still being read.
            if (live && !drawn[source]) {
              drawn[source] = peaksOf(buffer, COLUMNS);
              walked = true;
              setPeaks((was) => ({ ...was, [source]: drawn[source] }));
            }
            return [source, buffer] as const;
          }),
        );
        if (!live) return;
        if (walked && bridge && songId) {
          const flat = Object.fromEntries(sources.map((source) => [source, packed(drawn[source])]));
          void bridge.analysis.keepPeaks(songId, stemsAt, COLUMNS, flat).catch(() => undefined);
        }
        // The graph still gets all of them at once: the stems are started in
        // one call so they play on the same sample, and a transport built from
        // four separate handovers is four different ideas of where zero is.
        audio.load(Object.fromEntries(decoded));
        setDuration(audio.duration);
      } catch (why) {
        if (!live) return;
        audio.clear();
        setPeaks({});
        setDuration(0);
        setAudioProblem(`could not read the stems — ${(why as Error).message}`);
      } finally {
        if (live) setDecoding(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [stemsAt, sourceList, songId, base, audio]);

  /**
   * One stem's audio, for the lane drawing it.
   *
   * The graph is the holder and this is a way through to it, not a second copy
   * kept beside it — which is the same argument the peaks are computed from
   * those buffers for. Zoomed past what the peaks can say, a lane draws the
   * samples themselves, and they have to be the samples that will play.
   */
  const audioOf = useCallback((id: string): AudioBuffer | null => audio.stem(id), [audio]);

  /**
   * The envelopes a fit is made from, worked out once per track.
   *
   * Walking a stem is tens of millions of samples — nothing beside decoding it,
   * and everything beside a click, which is what the hand path does four times
   * a minute. Keyed on the buffer itself rather than on the track's id, because
   * the buffer is what it is made of: a track separated again is a new buffer
   * under the same id.
   */
  const heard = useRef<{ of: unknown; it: Heard | null }>({ of: null, it: null });
  const listen = useCallback((): Heard | null => {
    const of = audioOf('drums') ?? audioOf('bass') ?? peaks;
    if (heard.current.of !== of) {
      heard.current = { of, it: hearing(peaks, seconds, audio.rate || NOMINAL_RATE, audioOf) };
    }
    return heard.current.it;
  }, [audioOf, peaks, seconds, audio]);

  /**
   * The mix, pushed into the graph.
   *
   * Every change, because a fader drag is a change per frame and the ramp in
   * `engine.ts` is what keeps that from clicking. Cheap: it is a comparison per
   * stem and a scheduled ramp only where something moved.
   */
  useEffect(() => {
    audio.apply(level, song?.sources ?? []);
  }, [level, song?.sources, audio, peaks]);

  /**
   * The playhead.
   *
   * The position is read off the **audio clock**, not accumulated on the wall
   * clock: `requestAnimationFrame` misses frames and stops entirely in a
   * background window, so a counted playhead drifts away from the sound it is
   * supposed to be pointing at. This asks the graph where it actually is.
   */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      if (audio.ended) {
        audio.stop();
        setPosition(0);
        setPlaying(false);
        return;
      }
      setPosition(audio.at());
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, audio]);

  /**
   * The grid as the window's own store should hold it.
   *
   * With a library to write to, nothing: the grid lives beside the track, and
   * a second copy here is the copy that goes stale. Undefined rather than
   * absent, so a copy from before the file existed is cleared on the first
   * write rather than resurfacing whenever the file is gone.
   */
  const gridHeld = useCallback(
    (): Partial<Remembered> =>
      openflow()
        ? { bpm: undefined, bpmAuto: undefined, offset: undefined, beats: undefined }
        : { bpm: targetBpm, bpmAuto, offset, beats: beats ?? undefined },
    [targetBpm, bpmAuto, offset, beats],
  );

  /**
   * Write the grid and the slices beside the track, now. Nothing to write
   * until the library has answered. The slices go only when they are
   * somebody's: a reading is re-read, and writing it down would freeze it
   * against a grid that might since have been bent.
   */
  const keepGrid = useCallback(() => {
    const bridge = openflow();
    if (!bridge || !song || !asked) return;
    const grid: Grid | null = wantFit ? null : { bpm: targetBpm, bpmAuto, offset, beats };
    void bridge.analysis
      .write(song.id, grid, readingOf(detected), slicesAuto ? null : slices)
      .catch(() => undefined);
  }, [song, asked, wantFit, targetBpm, bpmAuto, offset, beats, detected, slicesAuto, slices]);

  /**
   * Open a track.
   *
   * The outgoing track is written down **synchronously**, before anything is
   * replaced. The settled write below would otherwise be cancelled by its own
   * dependencies changing — the last four hundred milliseconds of work on the
   * track you just left would be the four hundred that never got saved, which
   * is the most annoying possible window to lose.
   */
  const select = useCallback(
    (id: string) => {
      // Clicking the row that is already open must do nothing. Falling through
      // would reload the mix from what was last written down, which is up to
      // four hundred milliseconds behind — so the fader you just moved would
      // spring back for no visible reason.
      if (id === selected) return;
      if (song) {
        held.current = withTrack(held.current, song.id, {
          levels: level,
          at: audio.at(),
          ...gridHeld(),
        });
        remember(held.current);
        keepGrid();
      }
      audio.stop();
      setPlaying(false);
      setSelected(id);
      setAnchors([]);
      setManual(null);
      setDetected(null);
      setFitFailed(false);
      setTranscription(null);
      setTranscribeProblem(null);
      const known = forTrack(held.current, id);
      setPosition(known.at ?? 0);
      setLevel(levels(known.levels));
      setSlices(slicesFor(8, BARS_UNKNOWN));
      setSlicesAuto(true);
      setActiveSlice(0);
      const picked = tracks.find((t) => t.id === id);
      setTargetBpm(known.bpm ?? picked?.bpm ?? 120);
      setBpmAuto(known.bpmAuto ?? (picked?.bpm != null));
      setOffset(known.offset ?? 0);
      setBeats(known.beats ?? null);
      // Nothing written down about this track, so its grid is still to be
      // measured — and it will be, as soon as there are stems to measure.
      setWantFit(known.bpm == null);
    },
    [tracks, audio, song, selected, level, gridHeld, keepGrid],
  );

  /**
   * The grid, read from beside the track.
   *
   * What the library holds wins over what the window remembered: the file is
   * the one that travels with the folder, and the window's own copy is only
   * there to carry a grid from a build before the file existed into it — which
   * the writer below does, the first time it settles.
   */
  useEffect(() => {
    const bridge = openflow();
    if (!selected || !bridge) {
      setAsked(true);
      return;
    }
    let live = true;
    setAsked(false);
    void bridge.analysis
      .read(selected)
      .catch(() => null)
      .then((held) => {
        if (!live) return;
        if (held?.grid) {
          setTargetBpm(held.grid.bpm);
          setBpmAuto(held.grid.bpmAuto);
          setOffset(held.grid.offset);
          setBeats(held.grid.beats);
          setDetected(foundOf(held));
          setWantFit(false);
        }
        if (held?.slices) {
          setSlices(held.slices);
          setSlicesAuto(false);
        }
        setAsked(true);
      });
    return () => {
      live = false;
    };
  }, [selected]);

  /**
   * The grid, written beside the track once the window sits still.
   *
   * Null while the track is still owed a fit: a file claiming 120 would be
   * read back as a decision, and the track would open at 120 forever.
   */
  useEffect(() => {
    if (!openflow() || !song || !asked) return;
    const timer = setTimeout(keepGrid, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [song, asked, keepGrid]);

  /**
   * Let go of a remembered track the library no longer has.
   *
   * The restore above is unconditional — it has to be, because it happens before
   * the library has been read — so this is the other half: once the folder has
   * answered and the id is not in it, the window stops claiming a track it
   * cannot find. Deleting a track and reloading should not leave a name in the
   * header and empty lanes underneath it.
   */
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || loading) return;
    checked.current = true;
    if (selected && !tracks.some((t) => t.id === selected)) setSelected(null);
  }, [loading, tracks, selected]);

  /**
   * Start a separation.
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
    setSetupFor(null);
    setRunningId(song.id);
    setJob({
      done: 0,
      stage: 'loading the model',
      sources: [],
      perStem: null,
      written: [],
      seconds: null,
    });
    const outcome = await bridge.separate.run({ trackId: song.id, file: song.file, model });
    if (!outcome.ok && !outcome.cancelled) setProblem(outcome.says);
  }, [song, model]);

  /**
   * Set this track's separation up again.
   *
   * Not *run* it again: pressing a button that re-ran the model already on disk
   * would answer from the cache in a second and look like nothing happened,
   * which is exactly what the old ⟳ did. What a person wants here is the model
   * cards back — and while they are there, the metadata for this track, which
   * is the other thing that screen is now for.
   */
  const resetup = useCallback(() => {
    if (!song) return;
    setProblem(null);
    setModel(song.model ?? model);
    setSetupFor(song.id);
  }, [song, model]);

  /** Leave the setup screen without separating, for a track that already has stems. */
  const keepStems = useCallback(() => setSetupFor(null), []);

  /**
   * Write a correction, and take the library back from the process that owns it.
   *
   * The whole library rather than the one row, because the window holds one
   * list: splicing a reply into it would be a second place for the two to
   * disagree about what is on disk.
   */
  const editTrack = useCallback(async (id: string, edits: Edits) => {
    const bridge = openflow();
    if (!bridge) return;
    setLibrary(await bridge.library.edit(id, edits));
  }, []);

  /**
   * Ask the catalogue what this might be.
   *
   * An empty list is every kind of failure — offline, refused, nothing
   * released under that name — because they all mean the same thing to the
   * screen showing them, which is that nobody knows.
   */
  const findMatches = useCallback(async (text: string) => {
    const bridge = openflow();
    if (!bridge) return;
    setMatching(true);
    try {
      setMatches(await bridge.library.matches(text));
    } finally {
      setMatching(false);
    }
  }, []);

  /** Take one candidate: its words go in the manifest, its cover into the folder. */
  const takeMatch = useCallback(
    async (id: string, found: Match) => {
      const bridge = openflow();
      if (!bridge) return;
      setLibrary(
        await bridge.library.edit(id, {
          title: found.title,
          artist: found.artist,
          album: found.album,
        }),
      );
      if (found.artwork) setLibrary(await bridge.library.artwork(id, found.artwork));
      setMatches([]);
    },
    [],
  );

  /** The cover's URL on this app's own scheme, or null while there is no cover. */
  const artOf = useCallback(
    (track: Track | null): string | null =>
      track?.art ? fileUrl(base, track.art) : null,
    [base],
  );

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

  /**
   * Infer the bass once, then lay the cached notes onto this instrument.
   *
   * Only an automatically fitted grid is handed over. A typed tempo without a
   * measured phase can look exact while being a sixteenth late for the whole
   * song; in that case the tab keeps exact onset times instead.
   */
  const transcribeBass = useCallback(async () => {
    const bridge = openflow();
    if (!bridge || !song) return;
    setTranscribeProblem(null);
    setTranscription(null);
    setTranscribingId(song.id);
    setTranscribeJob({ done: 0, stage: 'loading the pitch model', seconds: null });
    const outcome = await bridge.transcribe.run({
      trackId: song.id,
      tuning: STANDARD_BASS,
      bars: bpmAuto || beats ? grid : null,
      transpose: 0,
    });
    // The runner normally announces this as an event. Early refusals cannot,
    // so the invocation's answer is also applied; doing it twice is harmless.
    setTranscribeJob(null);
    setTranscribingId(null);
    setTranscription(outcome.ok ? outcome : null);
    setTranscribeProblem(outcome.ok || outcome.cancelled ? null : outcome.says);
  }, [song, bpmAuto, beats, grid]);

  const transposeBass = useCallback(async (transpose: number) => {
    const bridge = openflow();
    if (!bridge || !song || !transcription || transcription.trackId !== song.id) return;
    const before = transcription;
    setTranscribeProblem(null);
    setTranscription({ ...before, sidecar: { ...before.sidecar, transpose } });
    const outcome = await bridge.transcribe.run({
      trackId: song.id,
      tuning: STANDARD_BASS,
      bars: bpmAuto || beats ? grid : null,
      transpose,
    });
    if (outcome.ok) setTranscription(outcome);
    else {
      setTranscription(before);
      if (!outcome.cancelled) setTranscribeProblem(outcome.says);
    }
  }, [song, transcription, bpmAuto, beats, grid]);

  const cancelTranscription = useCallback(() => {
    const id = transcribingId;
    setTranscribeJob(null);
    setTranscribingId(null);
    if (id) void openflow()?.transcribe.cancel(id);
  }, [transcribingId]);

  const revealTranscription = useCallback(() => {
    if (song) void openflow()?.transcribe.reveal(song.id);
  }, [song]);

  // ── The transport ────────────────────────────────────────────────────────

  const start = useCallback(
    (on: boolean) => {
      if (!audio.loaded) return;
      if (on) audio.play(position);
      else audio.pause();
      setPlaying(on);
      if (!on) setPosition(audio.at());
    },
    [audio, position],
  );

  const stop = useCallback(() => {
    audio.stop();
    setPlaying(false);
    setPosition(0);
  }, [audio]);

  /** Move the head, in seconds. Playing carries on from there rather than stopping. */
  const seek = useCallback(
    (at: number) => {
      const to = Math.max(0, Math.min(at, seconds));
      audio.seek(to);
      setPosition(to);
    },
    [audio, seconds],
  );

  /** Select a slice and put the head at the top of it. */
  const pickSlice = useCallback(
    (index: number) => {
      const slice = slices[index];
      if (!slice) return;
      setActiveSlice(index);
      seek(placeOf(grid, slice.bar) * seconds);
    },
    [slices, grid, seconds, seek],
  );

  const setLoop = useCallback(
    (on: boolean) => {
      audio.setLoop(on);
      setLoopState(on);
    },
    [audio],
  );

  // The graph is built after the first render, so the remembered loop setting
  // has to be pushed into it rather than assumed.
  useEffect(() => {
    audio.setLoop(loop);
  }, [audio, loop, peaks]);

  /**
   * The map and the tempo, pushed into the graph on every change.
   *
   * Only once something has pinned the audio to the grid: a straight ruling
   * from a typed tempo is a claim about where the bars are, not a measurement
   * of the record, and stretching a record to a claim is how a song ends up
   * eight per cent fast for no reason anybody asked for.
   */
  useEffect(() => {
    audio.warp(beats ? grid : null, targetBpm, warp && beats !== null);
  }, [audio, grid, targetBpm, warp, beats, peaks]);

  useEffect(() => audio.watch(() => setStretching(audio.stretching)), [audio]);

  const setWarp = useCallback((on: boolean) => setWarpState(on), []);

  /**
   * Take the grid from the audio: `warp.ts` fits a tempo and a downbeat to the
   * drums, and both are applied.
   *
   * The anchors it drops are bar 1 and the last bar, which is a claim it is now
   * entitled to make — a straight line fitted to every hit in the song is
   * pinned at both ends by construction, so it cannot be drifting in the middle
   * by more than it is wrong at the ends. Before this they were two marks on a
   * grid nothing had measured.
   *
   * A refusal is left visible rather than being turned into a guess. There is
   * no tempo that is honest about a track with nothing steady in it, and 120
   * dressed up as a reading is worse than the window saying it could not find
   * one.
   */
  const fit = useCallback(
    (found: Fit | Follow | null) => {
      setWantFit(false);
      setDetected(found);
      setFitFailed(found === null);
      if (!found) return;
      setTargetBpm(found.bpm);
      setOffset(found.offset);
      setBeats('beats' in found ? found.beats : null);
      setBpmAuto(true);
      setManual(null);
      const rate = audio.rate || NOMINAL_RATE;
      const held = countOf(
        'beats' in found ? found.beats : evenBeats(rate, Math.round(seconds * rate), found.bpm, found.offset),
      );
      setAnchors([
        { at: 0, label: '1' },
        { at: held - 1, label: String(held) },
      ]);
    },
    [seconds, audio],
  );

  /**
   * The grid, read off the audio: a seed fitted to the whole song, and the
   * kick followed behind it. The follow is what gets applied when there is
   * one; the seed alone is the straight line, and a song with nothing steady
   * in it is a refusal rather than a guess.
   */
  const measure = useCallback((): Fit | Follow | null => {
    const it = listen();
    if (!it) return null;
    const seed = fitOf(it);
    if (!seed) return null;
    return followOf(it, seed) ?? seed;
  }, [listen]);

  const autoWarp = useCallback(() => fit(measure()), [fit, measure]);

  /**
   * A tempo somebody set, which is a different thing from one that was
   * measured — so the fit stops being on screen along with it.
   *
   * The agreement beside Auto-warp describes the grid the fit produced. Left up
   * while the tempo is dragged, it would be a percentage about a grid that is
   * no longer there, which is the one kind of readout worse than none.
   */
  const setTempo = useCallback((bpm: number) => {
    setTargetBpm(bpm);
    setBpmAuto(false);
    setDetected(null);
    setFitFailed(false);
    setWantFit(false);
  }, []);

  /**
   * The fit a freshly opened track gets without being asked.
   *
   * It costs a few milliseconds and it is the difference between lanes that
   * arrive gridded and lanes ruled at 120 over a song at 128 — which is not a
   * neutral default so much as a wrong answer nobody asked for. It runs once
   * per track and only where nothing has been decided; `wantFit` is what says
   * so, and pressing Auto-warp is how you ask for it again.
   */
  useEffect(() => {
    if (!wantFit || !asked || decoding || seconds <= 0) return;
    if (Object.keys(peaks).length === 0) return;
    fit(measure());
  }, [wantFit, asked, decoding, peaks, seconds, fit, measure]);

  const startManual = useCallback(
    () => setManual((was) => ({ stage: 'first', span: was?.span ?? 4, first: null })),
    [],
  );
  const endManual = useCallback(() => setManual(null), []);

  /** How many bars the two clicks are to be apart, changed mid-count if need be. */
  const setSpan = useCallback(
    (span: number) => setManual((was) => (was ? { ...was, span } : was)),
    [],
  );

  /**
   * A click in the warp lane: place a grid point, or move the head.
   *
   * Outside manual mode it is a scrub, which is what a click on a timeline
   * means everywhere else and is the reason this is one handler rather than two
   * overlapping strips.
   *
   * It arrives as a fraction of the file rather than as a bar, because a bar is
   * what the click is *about to change*: reading one off the grid the click is
   * correcting and then converting it back would put the old grid inside the
   * new one.
   */
  const pin = useCallback(
    (place: number) => {
      const at = place * seconds;
      if (!manual) {
        seek(at);
        return;
      }
      if (manual.stage === 'first') {
        // A click on any downbeat. It says where the bars fall and nothing
        // about which bar this is: bar 1 is the first downbeat in the file,
        // here as everywhere, and the pin is labelled with whatever bar that
        // makes the one that was clicked.
        const placed = startOf(at, targetBpm);
        setManual({ ...manual, stage: 'late', first: at });
        setOffset(placed);
        // A hand starting over: the map goes, and the grid is the even ruling
        // from this downbeat until the second click says otherwise.
        setBeats(null);
        setDetected(null);
        setFitFailed(false);
        setWantFit(false);
        setAnchors([pinAt(at, placed, targetBpm)]);
        return;
      }

      // Two clicks a counted number of bars apart are a tempo. The measurement
      // is then snapped to a whole number if it is within three quarters of
      // one — produced music is written at whole numbers, and over four bars a
      // click twenty milliseconds out is a third of a BPM, so the integer is
      // very nearly always the better reading of what somebody meant.
      const from = manual.first ?? 0;
      if (at <= from + 0.05) return;
      const measured = snapped((240 * manual.span) / (at - from), 0.75);
      if (measured < SLOWEST || measured > FASTEST) return;

      // And then the audio is asked to do the precision. What the hand supplied
      // is the octave and the phase, which is the half a fit gets wrong; a line
      // through every kick in the song is the half it gets right.
      const it = listen();
      const refined = it ? refitOf(it, measured, from) : null;
      const bpm = refined ? refined.bpm : measured;
      const placed = refined ? refined.offset : startOf(from, measured);
      // And then followed: the clicks said which beat and which bar, the fit
      // made that exact, and the walk behind it is what finds the drift.
      const followed = it && refined ? followOf(it, refined) : null;

      setManual({ ...manual, stage: 'tune' });
      setTargetBpm(bpm);
      setOffset(placed);
      setBeats(followed ? followed.beats : null);
      setBpmAuto(false);
      setWantFit(false);
      setFitFailed(false);
      setDetected(followed ?? refined);
      const first = pinAt(from, placed, bpm);
      setAnchors([
        first,
        { at: first.at + manual.span, label: String(first.at + manual.span + 1) },
      ]);
    },
    [manual, seconds, seek, listen, targetBpm],
  );

  /**
   * Move the whole grid ten milliseconds, keeping the tempo.
   *
   * The downbeat is the half of a grid that a detector gets wrong while getting
   * the other half right — a fit locked onto the snare is the right tempo and a
   * bar line in the wrong place — and this is the fastest way out of that. It
   * moves bar 1 rather than an anchor, because an anchor that could be dragged
   * off the grid it is marking would be a second, competing claim.
   */
  const nudge = useCallback((direction: number) => {
    setOffset((was) => was + direction * 0.01);
    setBeats((was) => (was ? shifted(was, direction * 0.01 * was.rate) : was));
    setDetected(null);
  }, []);

  const adjust = useCallback((id: string, change: Partial<Level>) => {
    setLevel((was) => ({ ...was, [id]: { ...(was[id] ?? REST), ...change } }));
  }, []);

  /** Move one of a stem's bands, or one of the cuts between them. */
  const shape = useCallback((id: string, change: Partial<Bands>) => {
    setLevel((was) => {
      const own = was[id] ?? REST;
      return { ...was, [id]: { ...own, bands: { ...(own.bands ?? FLAT), ...change } } };
    });
  }, []);

  const rename = useCallback((index: number, name: string) => {
    setSlices((was) => was.map((s, i) => (i === index ? { ...s, name } : s)));
    setSlicesAuto(false);
  }, []);

  /** Slice `index` starts at `bar` now. Held between its neighbours — `slices.ts`. */
  const moveSlice = useCallback(
    (index: number, bar: number, least: number) => {
      setSlices((was) => dragged(was, index, bar, bars, least));
      setSlicesAuto(false);
    },
    [bars],
  );

  /** A new cut at `bar`, and the slice it starts is the one selected. */
  const cutSlice = useCallback(
    (bar: number) => {
      const next = cut(slices, bar);
      setSlices(next.slices);
      setActiveSlice(next.index);
      setSlicesAuto(false);
    },
    [slices],
  );

  /** Slice `index` folded into the one before it, which is then the one selected. */
  const removeSlice = useCallback((index: number) => {
    if (index <= 0) return;
    setSlices((was) => removed(was, index));
    setActiveSlice(index - 1);
    setSlicesAuto(false);
  }, []);

  /** Back to the slices the track was read to have. */
  const resetSlices = useCallback(() => {
    setSlicesAuto(true);
    setActiveSlice(0);
  }, []);

  /**
   * Read the slices off the stems, for as long as nobody has touched them.
   *
   * The window lays some out before it has decoded anything, against a nominal
   * sixty-four bars; once the peaks are in they are replaced by cuts where the
   * stems change, and they follow the grid as it is measured or bent, since a
   * slice is a place on the grid. The moment somebody moves, cuts, or renames
   * one the set is theirs and this stops.
   */
  useEffect(() => {
    if (!slicesAuto) return;
    setSlices(Object.keys(peaks).length > 0 ? slicesOf(peaks, grid) : slicesFor(8, bars));
  }, [slicesAuto, bars, peaks, grid]);

  const resetMix = useCallback(() => setLevel(levels()), []);

  /**
   * The hits the warp lane draws: the ones the fit listened to.
   *
   * The lane and the fit have to be looking at the same thing, or the agreement
   * beside the tempo is a number about a picture nobody can see. They used to
   * differ: the fit read the kick band of the separated drums at twelve
   * milliseconds a column, and the lane drew rises in the drawn peaks folded
   * down to a hundred and eighty — a tick could sit a sixth of a beat from the
   * kick it stood for, and zoomed in that is a grid that looks wrong when it is
   * right. Now the lane draws the fit's own hits, placed to a millisecond.
   *
   * The bar positions are the *grid's* claim about those hits, so they move
   * when the tempo does — which is what makes the warp lane worth looking at.
   * A tick that walks off the bar lines is a tempo that is wrong.
   */
  const onsets = useMemo(() => {
    if (seconds <= 0) return [];
    const it = listen();
    if (!it) return [];
    return it.transients
      .filter((hit) => hit.band !== 'high')
      .map((hit) => {
        const at = barAt(grid, hit.at / seconds);
        return { at, strength: hit.strength, downbeat: Math.abs(at - Math.round(at)) < 1 / 32 };
      });
  }, [listen, seconds, grid]);

  /** The same hits, in seconds, for a dragged anchor to snap to. */
  const hits = useMemo(() => {
    const it = listen();
    return it ? it.transients.filter((hit) => hit.band !== 'high').map((hit) => hit.at) : [];
  }, [listen]);

  /**
   * A hand on an anchor, which is the other half of following the beat.
   *
   * Live's workflow: auto-warp, then fix by hand what it got wrong. Dragging a
   * beat moves that one anchor — its neighbours hold, the two spacings beside
   * it take up the difference, and nothing further away can tell. It starts
   * from the map as drawn, so the even ruling of a typed tempo becomes a map
   * the moment a beat is moved; and it is a decision, so the fit's readout
   * goes and the grid stops being something that was measured.
   */
  const decided = useCallback(() => {
    setBpmAuto(false);
    setDetected(null);
    setFitFailed(false);
    setWantFit(false);
  }, []);

  /** Drag a beat's anchor to another second of the file. */
  const moveBeat = useCallback(
    (beat: number, at: number) => {
      setBeats((was) => moved(was ?? grid, beat, at * grid.rate));
      decided();
    },
    [grid, decided],
  );

  /**
   * Let the map go, and start over.
   *
   * Back to the even ruling the tempo and the downbeat make, which is where the
   * anchors came from. The tempo and the downbeat stay: they are the best
   * straight reading there is, and a ruling at 120 from the top of the file
   * would be a wrong answer to start over from. It is a decision, so it is
   * remembered and not re-measured behind anybody's back; Auto-warp is how you
   * ask for the beats again.
   */
  const clearBeats = useCallback(() => {
    setBeats(null);
    decided();
  }, [decided]);

  /**
   * How many stems have been moved off their resting position.
   *
   * Counted over the stems this song *has*, not over the six there could be.
   * The lanes only draw the sources the model made, so a level left behind by
   * an earlier separation with a six-source model would otherwise arm Reset
   * against something nobody can see.
   */
  const touched = useMemo(
    () =>
      (song?.sources ?? []).filter((id) => {
        const own = level[id];
        return (
          own &&
          (own.muted || own.soloed || Math.abs(own.volume - REST.volume) > 0.001 || !isFlat(own.bands))
        );
      }).length,
    [level, song],
  );

  /**
   * Write down what the window is holding.
   *
   * Settled rather than immediate, because a fader drag is a change per frame
   * and `JSON.stringify` of the whole session on each of them is the sort of
   * thing that makes a fader feel heavy. Four hundred milliseconds after the
   * last change is well inside the gap before anybody reaches for the reload.
   *
   * **The head is not a dependency**, and that is the load-bearing part. It
   * changes sixty times a second while playing, so depending on it would clear
   * and reset this timer every frame — meaning nothing would *ever* be written
   * during playback, which is exactly when somebody is least expecting to lose
   * their place. It is read from the transport when the timer fires instead, and
   * `playing` is a dependency so that stopping writes where you stopped.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      let next: Session = { ...held.current, selected, model, query, loop, warp };
      if (song) {
        next = withTrack(next, song.id, {
          levels: level,
          at: audio.at(),
          ...gridHeld(),
        });
      }
      held.current = next;
      remember(next);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [
    selected,
    model,
    query,
    loop,
    warp,
    song,
    level,
    gridHeld,
    playing,
    audio,
  ]);

  return {
    library,
    loading,
    chooseFolder,
    importTracks,
    importDropped,
    importYoutube,
    importing,
    reveal,
    note,
    noteBad,
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
    shape,
    audible,
    resetMix,
    touched,
    slices,
    activeSlice,
    setActiveSlice,
    rename,
    moveSlice,
    cutSlice,
    removeSlice,
    resetSlices,
    pickSlice,
    slicesAuto,
    targetBpm,
    setTempo,
    bpmAuto,
    /** Seconds from the top of the file to the downbeat of bar 1. */
    offset,
    /** The beat map, or null while the grid is the even ruling of a typed tempo. */
    beats,
    /** The last fit, or null where nothing has been measured or the fit failed. */
    detected,
    /** The last attempt found nothing steady, as against not having been asked. */
    fitFailed,
    playing,
    setPlaying: start,
    loop,
    setLoop,
    /** Whether the stems play stretched to the tempo, and whether there is a stretcher to do it. */
    warp,
    setWarp,
    stretching,
    /** Seconds. */
    position,
    seek,
    /** Seconds, from the audio if it is decoded and from the manifest if it is not. */
    seconds,
    /** Where the bars fall on the file. Everything on the timeline maps through it. */
    grid,
    bars,
    bar,
    peaks,
    audioOf,
    /** The graph's sample rate, which is what the stems were resampled to. */
    rate: audio.rate,
    onsets,
    decoding,
    audioProblem,
    playable: audio.loaded,
    stop,
    job,
    runningId,
    problem,
    separate,
    cancel,
    transcribeJob,
    transcribingId,
    transcription,
    transcribeProblem,
    transcribeBass,
    transposeBass,
    cancelTranscription,
    revealTranscription,
    engineBusy: runningId !== null || transcribingId !== null,
    exporting,
    setExporting,
    manual,
    startManual,
    endManual,
    setSpan,
    anchors,
    autoWarp,
    /** A grid something else measured — the harness — taken as if Auto-warp had found it. */
    take: fit,
    pin,
    nudge,
    /** The hits in seconds, and the two things a hand can do to the map. */
    hits,
    moveBeat,
    clearBeats,
    resetup,
    keepStems,
    resetting: setupFor !== null && song?.id === setupFor,
    editTrack,
    findMatches,
    takeMatch,
    matches,
    matching,
    artOf,
  };
}

export type Mix = ReturnType<typeof useMix>;
export type { Track };
