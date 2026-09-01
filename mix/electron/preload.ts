import { ipcRenderer } from 'electron';
import { expose } from '@openflow/desktop/preload.ts';
import type { Ready } from './demucs.ts';

/**
 * Whether this machine can separate anything.
 *
 * The renderer cannot find out for itself — the answer is a process on the
 * PATH and a directory on disk — and it has no business reaching either. One
 * question, asked; one answer, returned.
 */
expose({
  demucs: (): Promise<Ready> => ipcRenderer.invoke('openflow:demucs'),
});
