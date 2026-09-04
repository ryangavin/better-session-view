/**
 * `electron`, for a page that is not in Electron.
 *
 * Vite is told to resolve `electron` here when a reach session is running, so
 * the app's own `preload.ts` — unchanged, not copied — imports these instead of
 * the real ones and builds the very same `window.openflow`. Everything a
 * preload uses is in this file and nothing else is: `invoke` becomes a POST,
 * `on`/`off` become a subscription to one server-sent stream, and
 * `exposeInMainWorld` is a property on `window`, because a tab has no world to
 * be isolated from.
 *
 * `contextIsolation` is the thing being given up, and it is worth saying why
 * that is acceptable *here* and nowhere else: the boundary exists so that a
 * page which loads something hostile cannot reach the filesystem. This page is
 * served by a dev server on loopback, to a browser the person running it
 * opened, against an app they started with a flag that says so.
 */

let origin = '';
const hearing = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();

/** Where the main process is listening. Told to us, so no port is restated. */
export async function attach(at: string): Promise<void> {
  origin = at;
  const stream = new EventSource(`${origin}/reach/events`);
  stream.onmessage = (message) => {
    const { channel, payload } = JSON.parse(message.data) as { channel: string; payload: unknown };
    // The listener signature is Electron's: an event nobody reads, then the
    // payload. Kept exactly, because preload.ts is written against it.
    for (const hear of hearing.get(channel) ?? []) hear({}, payload);
  };
  await new Promise<void>((resolve, reject) => {
    stream.onopen = () => resolve();
    stream.onerror = () => reject(new Error(`no app answering on ${origin}`));
  });
}

export const ipcRenderer = {
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const reply = await fetch(`${origin}/reach/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel, args }),
    });
    const body = (await reply.json()) as { value?: unknown; says?: string };
    // A handler that threw rejects here, which is what `invoke` promises.
    if (!reply.ok) throw new Error(body.says ?? `reach: ${channel} failed`);
    return body.value;
  },

  on(channel: string, hear: (event: unknown, ...args: unknown[]) => void): void {
    if (!hearing.has(channel)) hearing.set(channel, new Set());
    hearing.get(channel)!.add(hear);
  },

  off(channel: string, hear: (event: unknown, ...args: unknown[]) => void): void {
    hearing.get(channel)?.delete(hear);
  },
};

/**
 * The one thing a tab genuinely cannot do.
 *
 * A dropped `File` in a browser has no path — that is the browser's whole point
 * — and the main process needs one. Returning `''` is what the preload already
 * filters out, so a drop in a tab does nothing rather than failing loudly, and
 * the Add dialog is the way in.
 */
export const webUtils = {
  getPathForFile: (): string => '',
};

export const contextBridge = {
  exposeInMainWorld: (name: string, api: unknown): void => {
    (window as unknown as Record<string, unknown>)[name] = api;
  },
};
