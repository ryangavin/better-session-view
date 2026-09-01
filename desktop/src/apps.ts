/**
 * Every app in this repo that opens a window, and the handful of facts about
 * each that more than one place needs to know.
 *
 * It exists because the third app was the one that made the cost visible. Before
 * it, adding an app meant editing ten unrelated files — five npm scripts, four
 * build tools, a vitest project, two workflows and a vite port that was restated
 * for the fourth time — and none of them were near each other, so the way you
 * found the one you had missed was a build that failed a step late.
 *
 * Two rules keep this honest:
 *
 *   * **Nothing is imported here.** The build tools read it under Node, the vite
 *     configs read it while configuring, and the main processes read it inside
 *     an esbuild bundle. A single `import` of `electron` would break two of
 *     those three.
 *   * **Runtime facts only.** What a bundle is *called* — appId, productName,
 *     the artifact name — stays in that app's `electron-builder.yml`, because
 *     that is the file a packager reads and there is no way to hand it this one.
 *     The overlap is deliberate and it is exactly two strings per app.
 */

/** A server of the app's own, bundled beside it and run by Electron's Node. */
export interface Server {
  /** The entry point, relative to the module directory. */
  entry: string;
  /** Where it listens, and the port a window must see answer before it opens. */
  port: number;
  /** The variable that moves it, for a second worktree or a second machine. */
  portEnv: string;
}

export interface App {
  /**
   * The module directory, the `~/.openflow/<name>` state bucket, and — for an
   * app that serves its own build — the URL scheme. One word, three jobs, so
   * they cannot drift apart.
   */
  name: string;
  /** What the Dock, the menu bar and ⌘-Tab read, and what the window is titled. */
  title: string;
  /** Behind the page before it paints, so a cold start is not a white flash. */
  background: string;
  /**
   * This app's vite dev server, as an offset from `OPENFLOW_PORT_BASE`.
   *
   * One variable moves a whole worktree out of the way of the next, which is
   * what makes two checkouts against one device possible. The offsets are a
   * hundred apart and shared with the two benches — set 0, the widget bench
   * +100, the device bench +200 — so `set/docs/dev-server.md` is where the whole
   * set is written down.
   */
  ui: number;
  /** Absent for an app that is only a window. */
  server?: Server;
}

export const APPS = {
  set: {
    name: 'set',
    title: 'set[flow]',
    background: '#0a0a0b',
    ui: 0,
  },
  visuals: {
    name: 'visuals',
    title: 'visual[flow]',
    background: '#000000',
    ui: 300,
    server: { entry: 'server/index.ts', port: 17900, portEnv: 'OPENFLOW_VISUALS_PORT' },
  },
  // `satisfies` rather than an annotation: every entry is checked against `App`,
  // and `APPS.set` still reads as the one app rather than as "some app or
  // nothing", which is what a `Record` index would have made of it.
} satisfies Record<string, App>;

/** The names, in the order they were added — the order every tool reports in. */
export const NAMES = Object.keys(APPS);

/** One app, or a clear error naming the ones there are. */
export function app(name: string | undefined): App {
  const found = name ? (APPS as Record<string, App>)[name] : undefined;
  if (!found) {
    throw new Error(`no such app: ${name ?? '(none named)'} — try ${NAMES.join(', ')}`);
  }
  return found;
}

/**
 * Where this app's vite dev server actually is.
 *
 * The base is read here rather than baked in, because a main process cannot load
 * `vite.config.ts` and both sides have to arrive at the same number from the
 * same variable.
 */
export function uiPort(one: App, env: NodeJS.ProcessEnv = process.env): number {
  const own = env[`OPENFLOW_${one.name.toUpperCase()}_UI_PORT`];
  return Number(own) || (Number(env.OPENFLOW_PORT_BASE) || 5173) + one.ui;
}

/**
 * Where this app's own server listens.
 *
 * Its own variable rather than an offset from anything: a backend port is a
 * thing another machine dials, and the second-machine arrangement is one this
 * repo actually supports.
 */
export function serverPort(one: App, env: NodeJS.ProcessEnv = process.env): number {
  if (!one.server) throw new Error(`${one.name} has no server`);
  return Number(env[one.server.portEnv]) || one.server.port;
}
