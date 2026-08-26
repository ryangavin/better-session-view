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

**Packaged, but not signed and not distributed.** `npm run set` runs it straight out of the
repo, which is the working loop; `npm run pack:set` makes a real `.app`, which is what gives
it a name and an icon of its own. No signing identity and no updater yet — the same trade
`CONTRIBUTING.md` makes for the device, for as long as nobody but its author runs it.

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

## The dev loop, in this window

`npm run set` is a rebuild and a relaunch, which is right for checking what ships and wrong
for the twenty edits before it. `npm run dev:set-app` opens the same shell on the vite dev
server instead of on the scheme, so an edit lands in the window that ships with Fast Refresh
intact — including the connection and the snapshot behind it, which is the whole argument in
[`dev-server.md`](dev-server.md).

It needs a dev server already up (`npm run dev`, or `npm run dev:set` alone) and starts
none. `OPENFLOW_DEV=1` is the switch; `OPENFLOW_DEV_URL` names an address instead, for a dev
server this could not have guessed. The port otherwise comes from `OPENFLOW_PORT_BASE`, so a
worktree that moved its servers takes the app with it rather than being the one thing left
behind.

Three things differ from `npm run set`, all of them on purpose:

- **No bridge flag crosses the preload.** `bridgeUrl()` falls back to the origin the page
  came from, and vite's `/ws` proxy carries it — so the app reaches whatever device its dev
  server was configured for, rather than whatever this process guessed. It is also what
  makes several worktrees on one device work here exactly as they do in a browser.
- **A different `localStorage` bucket**, because `http://localhost:5173` is a different
  origin from `set://app` and storage is keyed by origin. The same split a browser already
  has: column widths set in dev are not the ones the real app opens with.
- **The title says `— dev`.** The page sets its own `<title>`, so the window has to append
  it after the fact and keep appending it. Two windows that look identical and talk to
  different things is precisely the confusion the icons exist to end.

A dev server that is not up yet is the ordinary way in, and it leaves a window showing a
connection error that reads as a broken app, so the window retries on a second rather than
sitting there. `ERR_ABORTED` is excluded from that — it means a load was replaced rather
than that it failed, and retrying it is how you build a loop.

## Packaging

`npm run pack:set` builds the renderer, the shell, an icon, and a `.app` plus a `.dmg`
under `release/set/`. `npm run pack` does both apps.

`npm run install:apps` copies what that produced into `/Applications`, and `install:apps set`
does this one alone. It **replaces** rather than merges — `ditto` into an existing bundle
leaves an old build's files inside the new one, and the app that launches is then neither
version — and it refuses while the app is open, because deleting a running bundle is
permitted and fails later, somewhere confusing. `OPENFLOW_APPS` moves the destination for a
machine where `/Applications` is not yours to write. It is a step of its own on purpose:
packing writes a build artifact, installing is a decision about the machine.

**What packaging is for here, and it is not distribution.** Unpackaged, both apps report
themselves as *Electron*: the menu bar says it, the Dock shows Electron's icon for both, and
⌘-Tab cannot tell them apart — a small thing until you are reaching for one of them mid-set.
A bundle gives each a real identifier, a real name and an icon, and only an `Info.plist` can.

The icons are generated rather than committed: `tools/build-icons.ts` pads the open[flow]
mark onto a coloured square with `sips` and packs it with `iconutil`. The mark is shared on
purpose — these are two halves of one thing — and the **colour** is what separates them,
because at Dock size hue is the only thing anyone actually reads. A shape difference at 32
pixels is not a difference.

`asar: false`, deliberately. The archive is a packaging optimisation that buys nothing for
an app nobody downloads, and it costs a whole class of path problem — `app.asar.unpacked`,
and fs calls that only work through Electron's patched fs.

**Signing is off and switching it on needs no file edit:**

```sh
npm run pack:set -- -c.mac.identity="Developer ID Application: NAME (TEAM)"
```

Notarising as well wants `hardenedRuntime: true`, an entitlements plist with
`com.apple.security.cs.allow-jit`, and a `notarize:` block with an app-specific password or
an API key.

**None of which stops the app opening here**, because quarantine is set by whatever
*downloads* a file, and a bundle you built never had one. `npm run install:apps` strips it
anyway and checks that the strip took, so an installed copy always double-clicks open.

Where the missing signature does bite is a copy that travelled — the `.dmg` on somebody
else's machine. That is not the usual "unidentified developer" prompt you can right-click
past: electron-builder rewrote the bundle without re-sealing its resources, so `spctl` reads
the signature as broken outright (*code has no resources but signature indicates they must
be present*). Signing is the fix; there isn't a gesture that substitutes for it.

## What has no tests, and why that is correct

Nothing under `electron/` is reachable from vitest — a main process is not something a test
runner can enter. Zero coverage here is the honest picture rather than a gap to paper over
with a fake test. What *is* testable is
the one decision the renderer makes, and `bridgeUrl.test.ts` covers all three of its cases.
