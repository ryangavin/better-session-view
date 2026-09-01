/**
 * What the preload put on the window, declared for the renderer.
 *
 * The shape is `mix/electron/demucs.ts`'s `Ready`, restated rather than
 * imported: the renderer is a separate compilation with no `node:` types in it,
 * and reaching into `electron/` from here would drag them in.
 */
export interface Ready {
  ok: boolean;
  says: string;
  workspace: string;
}

interface Bridge {
  demucs(): Promise<Ready>;
}

/**
 * Absent in a browser, which is where the renderer runs during a `vite`
 * session with no app around it. Every caller has to answer for that rather
 * than assume the window it got is the one that ships.
 */
export const openflow = (): Bridge | null =>
  (globalThis as { openflow?: Bridge }).openflow ?? null;
