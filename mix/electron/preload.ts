import { ipcRenderer } from 'electron';
import { expose } from '@openflow/desktop/preload.ts';
import type { Imported, Library } from './library.ts';
import type { Ready } from './runtime.ts';
import type { Model } from './models.ts';
import type { Progress } from './job.ts';
import type { Outcome } from './separate.ts';
import type { Tuning } from '../src/tab.ts';
import type { Bars } from '../src/warp.ts';
import type { TranscribeOutcome } from './transcribe.ts';
import type { TranscribeProgress } from './transcribeJob.ts';

/**
 * What the renderer cannot do for itself: reach a process, and reach a folder.
 *
 * Four library calls, one probe, separation and bass transcription. Not a single one takes
 * a path from the renderer — `add` optionally takes the paths a *drop*
 * produced, which the renderer got from the OS rather than invented, and a
 * separation names a track by its id and lets the main process work out where
 * that is. Everything else is the main process opening its own dialogs and
 * answering with data. That is what keeps `contextIsolation` worth having: the
 * page can ask for the library, and cannot ask for `/etc/passwd`.
 *
 * The two local jobs talk back. They run long enough to report their stages, and
 * reports hundreds of times, so progress arrives as an event and `run` resolves
 * once, at the end, with the outcome. The two listeners hand back an unsubscribe
 * rather than leaving the renderer to remember a channel name — a listener that
 * outlives its component is a leak the page cannot see.
 */
expose({
  demucs: (): Promise<Ready> => ipcRenderer.invoke('openflow:demucs'),
  library: {
    read: (): Promise<Library> => ipcRenderer.invoke('openflow:library'),
    choose: (): Promise<Library> => ipcRenderer.invoke('openflow:library-choose'),
    /** With no argument, opens a file dialog. With paths, imports those — a drop. */
    add: (files?: string[]): Promise<Imported> => ipcRenderer.invoke('openflow:library-add', files),
    reveal: (): Promise<void> => ipcRenderer.invoke('openflow:library-reveal'),
    /** Where library files are served from, decided by the process that serves them. */
    base: (): Promise<string> => ipcRenderer.invoke('openflow:library-base'),
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
    busy: (): Promise<string | null> => ipcRenderer.invoke('openflow:transcribing'),
    run: (ask: { trackId: string; tuning: Tuning; bars: Bars | null }): Promise<TranscribeOutcome> =>
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
