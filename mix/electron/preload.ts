import type { AudioDevice } from '../src/audioDevices.ts';
import { ipcRenderer, webUtils } from 'electron';
import { expose } from '@openflow/desktop/preload.ts';
import type { Imported, Library } from './library.ts';
import type { Edits } from './manifest.ts';
import type { Match } from './art.ts';
import type { Ready } from './runtime.ts';
import type { Model } from './models.ts';
import type { Progress } from './job.ts';
import type { Outcome } from './separate.ts';
import type { Tuning } from '../src/tab.ts';
import type { ExportAsk, ExportProgress, Written } from './export.ts';
import type { Beats } from '../src/warp.ts';
import type { TranscribeOutcome } from './transcribe.ts';
import type { TranscribeProgress } from './transcribeJob.ts';
import type { PitchEvidence } from '../src/pitchMap.ts';
import type { Analysis, GridNote, Grid, Peaks, Reading, Scans, SliceKept } from './analysis.ts';
import type { LinkAudioAPI, LinkBlock, LinkCommand, LinkOutput } from '../src/linkAudioTypes.ts';

/**
 * What the renderer cannot do for itself: reach a process, and reach a folder.
 *
 * Library calls, one probe, separation and bass transcription. Not a single
 * one takes a path from the renderer. A drop hands genuine browser `File`
 * objects to `webUtils.getPathForFile` here in the preload and sends only those
 * OS-provided paths onward; the page can never invent one. A separation names a
 * track by its id and lets the main process work out where that is. That is
 * what keeps `contextIsolation` worth having: the page can ask for the library,
 * and cannot ask for `/etc/passwd`.
 *
 * The two local jobs talk back. They run long enough to report their stages, and
 * reports hundreds of times, so progress arrives as an event and `run` resolves
 * once, at the end, with the outcome. The two listeners hand back an unsubscribe
 * rather than leaving the renderer to remember a channel name — a listener that
 * outlives its component is a leak the page cannot see.
 */
expose({
  audioDevices: (): Promise<AudioDevice[]> => ipcRenderer.invoke('openflow:audio-devices'),
  keyExperiments: {
    status: () => ipcRenderer.invoke('openflow:key-experiments-status'),
    busy: () => ipcRenderer.invoke('openflow:key-experiments-busy'),
    read: (id:string) => ipcRenderer.invoke('openflow:key-experiments-read',id),
    run: (ask:{trackId:string;backends:import('../src/keyExperiments.ts').KeyBackend[]}) => ipcRenderer.invoke('openflow:key-experiments-run',ask),
    reference: (ask:{trackId:string;labels:string[];provenance:string}) => ipcRenderer.invoke('openflow:key-experiments-reference',ask),
  } satisfies import('../src/keyExperiments.ts').KeyExperimentAPI,
  keyVersion: (): Promise<number> => ipcRenderer.invoke('openflow:key-version'),
  analyzeKey: (id: string) => ipcRenderer.invoke('openflow:key-analyze', id),
  bassMidi: {
    open: () => ipcRenderer.invoke('openflow:bass-midi-open'),
    send: (id: string, data: number[], epochMs: number) => ipcRenderer.invoke('openflow:bass-midi-send', id, data, epochMs),
    clear: (id: string) => ipcRenderer.invoke('openflow:bass-midi-clear', id),
    ping: (id: string) => ipcRenderer.invoke('openflow:bass-midi-ping', id),
    close: (id: string) => ipcRenderer.invoke('openflow:bass-midi-close', id),
  },
  linkAudio: {
    open: (outputs: LinkOutput[], tempo?: number) => ipcRenderer.invoke('openflow:link-open', outputs, tempo),
    control: (session: string, command: LinkCommand) => ipcRenderer.invoke('openflow:link-control', session, command),
    clock: (session: string) => ipcRenderer.invoke('openflow:link-clock', session),
    write: (session: string, block: LinkBlock) => ipcRenderer.invoke('openflow:link-write', session, block),
    close: (session: string) => ipcRenderer.invoke('openflow:link-close', session),
  } satisfies LinkAudioAPI,
  demucs: (): Promise<Ready> => ipcRenderer.invoke('openflow:demucs'),
  library: {
    read: (): Promise<Library> => ipcRenderer.invoke('openflow:library'),
    choose: (): Promise<Library> => ipcRenderer.invoke('openflow:library-choose'),
    /** Open the ordinary multi-file import dialog. */
    add: (): Promise<Imported> => ipcRenderer.invoke('openflow:library-add'),
    /** Resolve genuine dropped files in the preload; their paths never enter the page. */
    drop: (files: File[]): Promise<Imported> =>
      ipcRenderer.invoke(
        'openflow:library-add',
        files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
      ),
    /** Fetch one YouTube video's best audio stream with the bundled yt-dlp. */
    youtube: (url: string): Promise<Imported> => ipcRenderer.invoke('openflow:library-youtube', url),
    reveal: (): Promise<void> => ipcRenderer.invoke('openflow:library-reveal'),
    /** Correct one track's title, artist, album or cover. */
    edit: (id: string, edits: Edits): Promise<Library> =>
      ipcRenderer.invoke('openflow:library-edit', { id, edits }),
    /** Ask the catalogue what this might be. Never throws; empty means nobody knows. */
    matches: (text: string): Promise<Match[]> =>
      ipcRenderer.invoke('openflow:library-matches', text),
    /** Take one candidate's cover into the library folder. */
    artwork: (id: string, url: string): Promise<Library> =>
      ipcRenderer.invoke('openflow:library-artwork', { id, url }),
    /** Where library files are served from, decided by the process that serves them. */
    base: (): Promise<string> => ipcRenderer.invoke('openflow:library-base'),
  },
  analysis: {
    /** The grid and the last reading kept beside a track, or null when there is none. */
    read: (trackId: string): Promise<Analysis | null> =>
      ipcRenderer.invoke('openflow:analysis-read', trackId),
    write: (
      trackId: string,
      grid: Grid | null,
      fit: Reading | null,
      slices: SliceKept[] | null,
      fitFailed?: boolean,
      algorithm?: string | null,
    ): Promise<void> =>
      ipcRenderer.invoke('openflow:analysis-write', { trackId, grid, fit, slices, fitFailed, algorithm }),
    /** What each of these tracks' grids amounts to, for the library rail to say. */
    notes: (trackIds: string[]): Promise<Record<string, GridNote>> =>
      ipcRenderer.invoke('openflow:analysis-notes', trackIds),
    /** The drawing of one separation's stems, or null when it has not been kept or is stale. */
    peaks: (trackId: string, stems: string): Promise<Peaks | null> =>
      ipcRenderer.invoke('openflow:peaks-read', { trackId, stems }),
    keepPeaks: (
      trackId: string,
      stems: string,
      columns: number,
      sources: Record<string, Float32Array>,
    ): Promise<void> => ipcRenderer.invoke('openflow:peaks-write', { trackId, stems, columns, sources }),
    /** Every source a deck plays, walked on a clock, or null when nothing was kept. */
    scans: (trackId: string, stems: string): Promise<Scans | null> =>
      ipcRenderer.invoke('openflow:scans-read', { trackId, stems }),
    onScansChanged: (hear: (change: { root: string; trackId: string }) => void): (() => void) => {
      const listener = (_event: unknown, change: { root: string; trackId: string }) => hear(change);
      ipcRenderer.on('openflow:scans-changed', listener);
      return () => ipcRenderer.off('openflow:scans-changed', listener);
    },
    keepScans: (
      trackId: string,
      stems: string,
      rate: number,
      sources: Record<string, { bins: number; values: Float32Array }>,
    ): Promise<void> => ipcRenderer.invoke('openflow:scans-write', { trackId, stems, rate, sources }),
  },
  export: {
    /** Every named stem laid straight at `to` bpm from 1.1.1, into the export folder. */
    stems: (ask: ExportAsk): Promise<Written> => ipcRenderer.invoke('openflow:export-stems', ask),
    /** How far the export has got, as it goes. */
    onProgress: (hear: (progress: ExportProgress) => void): (() => void) => {
      const listener = (_e: unknown, progress: ExportProgress) => hear(progress);
      ipcRenderer.on('openflow:export-progress', listener);
      return () => ipcRenderer.off('openflow:export-progress', listener);
    },
  },
  destination: {
    /** Where an export would go right now: what was picked, or the default. */
    read: (): Promise<string> => ipcRenderer.invoke('openflow:destination'),
    /** Open the folder dialog. Answers with where it is afterwards, picked or not. */
    choose: (): Promise<string> => ipcRenderer.invoke('openflow:destination-choose'),
  },
  separate: {
    /** The models this build will actually run, which is the same list a job checks. */
    models: (): Promise<Model[]> => ipcRenderer.invoke('openflow:models'),
    /** The track being separated right now, if any — a window reopened mid-job. */
    busy: (): Promise<string | null> => ipcRenderer.invoke('openflow:separating'),
    run: (ask: { trackId: string; file: string; model: string }): Promise<Outcome> =>
      ipcRenderer.invoke('openflow:separate', ask),
    cancel: (trackId?: string): Promise<void> =>
      ipcRenderer.invoke('openflow:separate-cancel', trackId),
    onProgress: (hear: (at: { trackId: string; progress: Progress }) => void): (() => void) => {
      const listener = (_e: unknown, at: { trackId: string; progress: Progress }) => hear(at);
      ipcRenderer.on('openflow:separate-progress', listener);
      return () => ipcRenderer.off('openflow:separate-progress', listener);
    },
    onFinished: (hear: (outcome: Outcome) => void): (() => void) => {
      const listener = (_e: unknown, outcome: Outcome) => hear(outcome);
      ipcRenderer.on('openflow:separate-finished', listener);
      return () => ipcRenderer.off('openflow:separate-finished', listener);
    },
  },
  transcribe: {
    pitchMap: (trackId: string): Promise<PitchEvidence | null> => ipcRenderer.invoke('openflow:pitch-map', trackId),
    busy: (): Promise<string | null> => ipcRenderer.invoke('openflow:transcribing'),
    run: (ask: { trackId: string; tuning: Tuning; bars: Beats | null; transpose: number; requirePitchMap?: boolean }): Promise<TranscribeOutcome> =>
      ipcRenderer.invoke('openflow:transcribe', ask),
    cancel: (trackId?: string): Promise<void> => ipcRenderer.invoke('openflow:transcribe-cancel', trackId),
    reveal: (trackId: string): Promise<void> => ipcRenderer.invoke('openflow:transcribe-reveal', trackId),
    onProgress: (hear: (at: { trackId: string; progress: TranscribeProgress }) => void): (() => void) => {
      const listener = (_e: unknown, at: { trackId: string; progress: TranscribeProgress }) => hear(at);
      ipcRenderer.on('openflow:transcribe-progress', listener);
      return () => ipcRenderer.off('openflow:transcribe-progress', listener);
    },
    onFinished: (hear: (outcome: TranscribeOutcome) => void): (() => void) => {
      const listener = (_e: unknown, outcome: TranscribeOutcome) => hear(outcome);
      ipcRenderer.on('openflow:transcribe-finished', listener);
      return () => ipcRenderer.off('openflow:transcribe-finished', listener);
    },
  },
});
