import { contextBridge } from 'electron';

/**
 * `window.openflow`, composed rather than declared.
 *
 * Every app here exposes exactly one object under one name, and what goes in it
 * differs — set[flow] needs the bridge's address, visual[flow] needs the
 * displays. Doing that through one call means the *name* is decided once and an
 * app's preload is the list of what it adds, which is the part worth reading.
 *
 * Nothing crosses that is not in this list. `contextIsolation` is only worth
 * having if what passes it stays small, and a preload that grew a filesystem
 * helper "just for now" is how that stops being true.
 */
export function expose(api: Record<string, unknown>): void {
  contextBridge.exposeInMainWorld('openflow', api);
}

/**
 * A fact the main process decided, read back in a sandboxed preload.
 *
 * It arrives as a command-line flag rather than an environment variable because
 * a sandboxed preload's `process` is a documented subset and `env` is not
 * reliably in it. `additionalArguments` is the supported channel, and it is
 * enough for anything that is one string, decided once, and never written back.
 */
export function flag(name: string): string {
  const prefix = `--openflow-${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? '';
}
