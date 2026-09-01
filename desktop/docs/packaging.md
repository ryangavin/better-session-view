# Building, packing and installing an app

`tools/app.ts`, `desktop/electron-builder.base.yml`, `tools/build-electron.ts`,
`tools/build-icons.ts`, `tools/install-apps.ts`.

## One driver

```sh
npm run app -- build [app…]      # the renderer, with vite
npm run app -- electron [app…]   # main, preload, and a server if it has one
npm run app -- icons [app…]      # the .icns, from that app's own mark
npm run app -- pack [app…]       # all three, then electron-builder
npm run app -- run <app>         # build, electron, and open it
npm run app -- watch <app>       # its dev server and its window, together
npm run app -- dev <app>         # electron, and open it against a running dev server
```

With no app named, everything but `run` and `dev` does all of them — which is why
`npm run pack` and the CI build step need no editing when an app is added.

The familiar names are one-line aliases onto this and still work: `npm run set`,
`npm run visuals`, `npm run pack:set`, `npm run build:visuals`, `npm run dev:set-app`.
An app with nothing special about it needs none of them.

Each app gets the same three dev scripts, and they are worth telling apart:

| | |
|---|---|
| `dev:<app>` | `watch` — the dev server and the window, together. The one to type |
| `dev:<app>-ui` | vite alone, for a browser or a second window |
| `dev:<app>-app` | the window alone, against a server `npm run dev` is already running |

Anything that looks like a flag is forwarded to electron-builder, which is what keeps
`npm run pack:set -- -c.mac.identity="Developer ID Application: NAME (TEAM)"` working.

**`dev` does not start a dev server; `watch` is the one that does.** The distinction
exists because `npm run dev` owns every server in the repo, and an app that started its own
alongside it would race for the port. `dev` rebuilds the main process — which vite knows
nothing about — and opens onto whatever is there, retrying until it answers. `watch` is
`dev` with a vite of its own in front of it, under `concurrently -k` so the two live and
die together.

## Why the main process is built rather than run

Electron ships its own Node, that Node does not strip types the way the one on your PATH
does, and `--experimental-strip-types` is not a flag to rely on inside somebody else's
runtime. So `main.ts` and `preload.ts` are bundled by esbuild.

To **CommonJS**, because a `sandbox: true` preload must be. That is not a limitation to
work around: a sandboxed preload is the whole reason the renderer can be trusted with
`contextIsolation`.

`electron` stays external — it is provided by the runtime and unbundlable, and resolving
it would inline a stub that silently does nothing. Everything else, this package
included, is bundled in. `__dirname` therefore means `<app>/electron/dist` for every
module in the bundle, which is how `preload.cjs`, `server.mjs` and `dist/` are found.

Not minified. This is what you read when a window does not open.

## The shared electron-builder config

Each app's `electron-builder.yml` extends `desktop/electron-builder.base.yml`.
`extends` takes a path relative to the project directory and *combines* `files` glob
patterns rather than replacing them, so an app with a server of its own adds one line
instead of restating the list.

An app's own file says four things: `appId`, `productName`, `artifactName`, and its
output directory. `productName` and the stem of `artifactName` are the two strings that
also appear in the registry — there is no way to hand a packager a TypeScript file, and
they are app identity rather than app behaviour, so they are stated in both registers on
purpose.

Everything else is shared: no asar, a signed disk image, the mac target list, the
category, and the long explanation of what signing and notarisation actually cost.

**The artifact name is not the app name.** `productName` is what the Dock, the menu bar
and ⌘-Tab read, and the brackets are the whole point of it — but they are ruinous in a
filename: `gh release create` glob-expands every asset path it is given, reads `[flow]`
as a character class, matches nothing, and fails before it has spoken to GitHub at all.

## Icons

`build-icons.ts` rasterises `<app>/public/mark.svg` into an `.icns` at pack time — every
tile drawn from the vector at that tile's own size rather than resampled down from one
big render, and inset to Apple's 824-of-1024 grid.

Generated rather than committed: an icon derived from a file already in the repo is an
artifact, not a source. Every app needs a mark, because unpackaged they all say
"Electron" and share its Dock icon, and at Dock size hue is the only thing anyone
actually reads.

## Installing

`npm run install:apps` copies whatever is packed into `/Applications/open[flow]`, with
`OPENFLOW_APPS` for a machine where `/Applications` is not yours to write — it names the
parent, and the `open[flow]` folder is made inside whatever it points at. The folder is the
point: three bundles loose among everything else are three unrelated icons, and in one
place they sort together and the Dock can hold them as a single stack. An install also
clears out the loose copy an earlier one left directly in `/Applications`, so Spotlight is
not offering two bundles of the same name. It is deliberately not
the last step of `pack`: packing writes a build artifact, and putting it where the Dock
and Spotlight will find it is a separate decision — one you want to make after a set
rather than in the middle of one.

It knows the apps from the registry, so it needs no editing either.
