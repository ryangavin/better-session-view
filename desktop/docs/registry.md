# The registry, and what an app costs

`desktop/src/apps.ts`.

Every app that opens a window, and the handful of facts about each that more than one
place needs. It is the file you add an app to, and — with the driver in
[`packaging.md`](packaging.md) — very nearly the only one.

```ts
mix: {
  name: 'mix',
  title: 'mix[flow]',
  background: '#0b0a0a',
  ui: 500,
},
```

## Why it exists

Adding the third app meant editing ten unrelated files, and none of them were near each
other:

| | before |
|---|---|
| `package.json` | five scripts — `build:x`, `x`, `dev:x-app`, `pack:x`, and a lane in `dev` |
| `tools/build-electron.ts` | a `servers` map, and the error text listing the apps |
| `tools/build-icons.ts` | an `APPS` array |
| `tools/install-apps.ts` | another `APPS` array |
| `tools/version.ts` | a list of manifests, with the non-workspaces appended by name |
| `x/electron-builder.yml` | ninety per cent a copy of another app's, comments included |
| `x/tsconfig.electron.json` | plus a `tsc -p` in the root `typecheck` string |
| `vitest.config.ts` | a project, and a coverage `include` |
| `.github/workflows/` | a `build:x` step in ci, a manifest in the release guard |
| `x/vite.config.ts` | the dev-port offset, restated for the fourth time |

The way you found the one you had missed was a build that failed a step late — or, for
the port, two dev servers quietly fighting over 5473.

Now: the registry, an `electron-builder.yml` that says what the app is called, a
tsconfig, and a vitest project. Everything else reads the registry or globs for what is
there.

## The rules it keeps

**Nothing is imported.** The build tools read it under Node, the vite configs read it
while configuring, and the main processes read it from inside an esbuild bundle. One
`import` of `electron` would break two of those three.

**Runtime facts only.** What a bundle is *called* — `appId`, `productName`, the artifact
name — stays in that app's `electron-builder.yml`, because that is the file a packager
reads and there is no way to hand it this one. The overlap is exactly two strings per
app, and they are identity rather than behaviour.

**`satisfies`, not an annotation.** Every entry is checked against `App`, and `APPS.set`
still reads as *the* app rather than as "some app or nothing" — which is what a `Record`
index would have made of it.

## Ports

`ui` is an offset from `OPENFLOW_PORT_BASE`, so one variable moves a whole worktree out
of the way of the next — which is what makes two checkouts against one device possible.
The offsets are a hundred apart and shared with the two benches, which are not apps and
are still counted in their own configs:

| | offset |
|---|---|
| set[flow] | 0 |
| the widget bench | +100 |
| the device bench | +200 |
| visual[flow] | +300 |
| chart | +400 |

`uiPort()` also reads `OPENFLOW_<NAME>_UI_PORT`, so a single app can be moved without
moving the base.

A `server` port is not an offset from anything. A backend port is a thing another machine
dials, and the second-machine arrangement is one this repo actually supports — so it is a
number with a variable of its own, and `serverPort()` reads both.

## Adding one

1. An entry here.
2. `<name>/electron/main.ts` and `preload.ts` — see the shape in [`../README.md`](../README.md).
3. `<name>/vite.config.ts`, with `uiPort(APPS.<name>)` as its port.
4. `<name>/index.html` and a renderer.
5. `<name>/package.json` — `"main": "electron/dist/main.cjs"`, and a version, which
   `npm run dev:version` will then keep in step. Add it to the root `workspaces` unless
   it has dependencies of its own, in which case read rule 12 in `AGENTS.md` first.
6. `<name>/electron-builder.yml` — `extends`, `appId`, `productName`, `artifactName`,
   and the output directory. Four lines and a comment.
7. `<name>/public/mark.svg`, which is what `build-icons` rasterises the `.icns` from.
8. `<name>/tsconfig.json` and `tsconfig.electron.json`, and both in the root
   `typecheck`.
9. A `vitest.config.ts` project, if it has tests.

`npm run app -- run <name>` works from step 5. Nothing in `tools/`, nothing in
`.github/`, and nothing in `.gitignore` has to be told — the build outputs are globbed
as `*/dist/` and `*/electron/dist/`.

mix[flow] was the app that proved this: a registry entry, the nine steps above, and
nothing else in the repo changed except the docs saying it exists.
