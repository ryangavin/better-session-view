# The desktop app

`set/electron/main.ts`, `set/electron/preload.ts`, `tools/build-electron.ts`.

set[flow] used to be a page the Max device served. That put 595 kB of base64 web app inside
Live's own process, and it made the session manager open whenever the device was loaded.
Both were the wrong way round: the device should bridge Live and nothing else, and a set
manager is something you open when you are working on a set — deliberately, and not during
a show.

So it is a window now. `npm run set` builds the renderer, builds the shell, and launches it.

## It is Electron, and the reasoning changed rather than being wrong before

`tools/README.md` argues at length for driving the already-installed Chrome instead of
bundling one, and that argument still holds *for the visuals rig's browser*. What changed is
that the device is no longer a web server, so there is no URL to point a browser at — the
choice is not "Chrome or Electron", it is "ship a window or ship a server". Electron is the
only one of those that leaves the device carrying nothing.

Tauri was considered and rejected: on macOS its webview is WKWebView, not Chromium, so every
shader and every layout in this project would need re-validating against an engine it has
never run on. That matters more for visual[flow] than here, but one engine across both apps
is worth more than either.

**Unpackaged, on purpose.** No `.app`, no electron-builder, no signing identity, no updater
— the same trade `CONTRIBUTING.md` makes for the device, for the same reason. The cost is
visible and accepted: the menu bar says *Electron*, the Dock icon is Electron's, and ⌘-Tab
cannot tell the two apps apart. The window titles can, which is what a person actually reads.

## A scheme of its own, not `file://`

`protocol.registerSchemesAsPrivileged` claims `set:` before the app is ready, and
`protocol.handle` serves `set/dist` from it. Two separate things make that the right choice
over loading the built `index.html` off disk:

**The paths already in the build.** The page asks for `/assets/…` and `/logo-white.png` —
root-absolute, because until now a server was answering. Under `file://` both resolve to the
filesystem root and 404. Under a `standard: true` scheme they resolve against the origin and
work untouched, so no `base` is needed — which matters because `base` would apply to the dev
server too, and one build for both is the thing worth protecting.

**A stable origin.** `localStorage` is keyed by origin, and it holds the column widths, the
song index columns and the allowed-colours migration flag. `set://app` is the same origin
after a rebuild, after a move, after a reinstall. `file://` is opaque and promises none of
that.

The handler carries the traversal guard the device used to carry for this same build, and a
MIME table that — unlike the device's — has an entry for `.png`, so the logo is no longer
served as `application/octet-stream`.

## Where the state lives, and why it is the first line of the file

`app.setPath('userData', …)` runs before anything else, because an unpackaged Electron app
defaults to `~/Library/Application Support/Electron` — one directory shared with
visual[flow] and with every other unpackaged Electron app on the machine. This one points at
`~/.openflow/set/electron`, beside the schemes, honouring `OPENFLOW_HOME` like everything
else here.

Moving it later would move the storage with it, which is why it is not something to tidy up
afterwards.

**A one-time loss, when you first open the app:** the origin moved from
`http://127.0.0.1:17800`, so saved column widths and the song-index column choice do not come
across, and the allowed-colours migration runs once more. There is no honest way around it —
importing from the old origin would mean loading the old origin, which means the server this
change exists to delete.

## What crosses the context bridge

One string: where the device is. The main process is the one that read `OPENFLOW_PORT`, so it
is the one that knows, and it hands it over through `additionalArguments` rather than an
environment variable — a sandboxed preload's `process` is a documented subset and `env` is
not reliably in it.

`set/src/lib/bridgeUrl.ts` is the only reader, and it falls back to `ws://${location.host}`
when there is no preload — which is the vite dev server, unchanged, still proxying `/ws`
through to the device. That fallback is why `npm run dev:set` needed no changes at all.

Nothing else is exposed. The app speaks one protocol over one socket; `contextIsolation` is
only worth having if what crosses it stays this small.

## The build

`tools/build-electron.ts` esbuilds `main.ts` and `preload.ts` to **CommonJS** in
`electron/dist/`. Both halves of that are forced: Electron's bundled Node does not strip
types the way Node 24 on your PATH does, and a `sandbox: true` preload must be CJS. It takes
a module name, so visual[flow] uses the same script.

It is deliberately **not** part of `npm run build`. That script is what CI enforces and what
produces the device; it has no business needing an Electron binary. `npm run set` builds what
it needs at launch, which also means `set/dist` can never be stale.

## What has no tests, and why that is correct

Nothing under `electron/` is reachable from vitest — a main process is not something a test
runner can enter. The gnosis graph will show these files with no observed edges, and that is
the honest picture rather than a gap to paper over with a fake test. What *is* testable is
the one decision the renderer makes, and `bridgeUrl.test.ts` covers all three of its cases.
