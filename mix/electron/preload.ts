import { ipcRenderer } from 'electron';
import { expose } from '@openflow/desktop/preload.ts';
import type { Imported, Library } from './library.ts';
import type { Ready } from './demucs.ts';

/**
 * What the renderer cannot do for itself: reach a process, and reach a folder.
 *
 * Four library calls and one probe, and not a single one of them takes a path
 * from the renderer — `add` optionally takes the paths a *drop* produced, which
 * the renderer got from the OS rather than invented. Everything else is the
 * main process opening its own dialogs and answering with data. That is what
 * keeps `contextIsolation` worth having: the page can ask for the library, and
 * cannot ask for `/etc/passwd`.
 */
expose({
  demucs: (): Promise<Ready> => ipcRenderer.invoke('openflow:demucs'),
  library: {
    read: (): Promise<Library> => ipcRenderer.invoke('openflow:library'),
    choose: (): Promise<Library> => ipcRenderer.invoke('openflow:library-choose'),
    /** With no argument, opens a file dialog. With paths, imports those — a drop. */
    add: (files?: string[]): Promise<Imported> => ipcRenderer.invoke('openflow:library-add', files),
    reveal: (): Promise<void> => ipcRenderer.invoke('openflow:library-reveal'),
  },
});
