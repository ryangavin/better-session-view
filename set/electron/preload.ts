import { contextBridge } from 'electron';

/**
 * The one fact the renderer cannot work out for itself: where the device is.
 *
 * It arrives as a command-line flag rather than an environment variable because
 * a sandboxed preload's `process` is a documented subset and `env` is not
 * reliably in it. `additionalArguments` is the supported channel, and it is
 * enough — this is one string, decided by the main process, never written back.
 *
 * Nothing else is exposed. The app speaks one protocol over one socket and has
 * no business reaching the filesystem or the shell; `contextIsolation` is only
 * worth having if what crosses it stays this small.
 */
const FLAG = '--openflow-bridge=';
const bridge = process.argv.find((arg) => arg.startsWith(FLAG))?.slice(FLAG.length) ?? '';

contextBridge.exposeInMainWorld('openflow', { bridge });
