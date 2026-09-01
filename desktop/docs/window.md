# The window

`desktop/src/window.ts`, `bounds.ts`, `navigate.ts`, `state.ts`, `dev.ts`.

`open()` is the window every app here opens. What it always does, and what each piece
is protecting against.

## The state directory, first

`state(app)` sets `userData` to `~/.openflow/<app>/electron`, and it is the first line
of every `main.ts` because moving it later moves the storage with it.

An unpackaged Electron app otherwise defaults to `~/Library/Application Support/
Electron` — a directory every unpackaged Electron app on the machine shares, this repo's
included. That is where `localStorage` goes, so leaving it there would mean set[flow]'s
column widths and visual[flow]'s keystone corners in one bucket, each disappearing the
day something else claimed it.

`OPENFLOW_HOME` moves the root, which is also how you run a second copy of an app while
one is open — the single-instance lock is keyed to this directory.

## `sandbox: true`, and what follows from it

Every window is `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
That is the arrangement the whole shape rests on: it is why a preload is built to
CommonJS ([`packaging.md`](packaging.md)), and it is why what crosses the bridge can stay
as small as it does — one string in set[flow], two functions in visual[flow].

A sandboxed preload's `process` is a documented subset and `env` is not reliably in it,
so a fact the main process decided reaches it as `additionalArguments`. `flag()` in
`src/preload.ts` is the reader; `args` in `Opening` is the writer. It is enough for
anything that is one string, decided once, and never written back.

## Where it may go

Two questions, not one, and `govern()` answers both.

**Navigation.** A single-page app never navigates. Anything that tries is a mis-click or
a dragged link, and letting it replace the window is how the app disappears — so
anything that is not this app opens in a browser instead.

"This app" is two cases that cannot share one comparison: under a scheme it is the
scheme, and in dev it is the dev server's origin. `set://app` has no origin to compare
against, because a non-special scheme reports `null` for it.

**`window.open`.** Electron refuses it outright unless something says what to do with
it, so without a handler the one external link in an app is a dead click. The default is
to hand it to the browser. An app that opens real second windows of its own answers
`popup` with the options for them, and gets both behaviours — which is how
visual[flow]'s wall became a frameless fullscreen window on a projector with no change
to the renderer at all: it still calls `window.open` with a features string, exactly as
it does in a browser.

## The frame

`bounds: true` remembers it in `window.json` beside the rest of that app's state, and
restores it after the defaults so a remembered frame wins.

It is read back suspiciously rather than trusted: the file is JSON on disk that a crash
can truncate and a display change can make nonsense of, and a window restored to 12×4
pixels on a monitor that is no longer there is indistinguishable from an app that failed
to start.

## Throttling

Chrome slows and eventually freezes a renderer it decides nobody is looking at, and a
wall window sitting behind a console is exactly that. Electron is the same Chromium and
throttles identically.

It takes both halves: `switches(app)` before `whenReady`, which are process-wide command
line switches, and `throttle: false` on each window, which is the precise version of the
same instruction. Forget them and the symptom is a projector that stutters whenever
somebody brings another window to the front — which happens constantly, and reads as a
bug in the renderer.

On by default, because an app that is a tool rather than a show should be throttled when
nobody is looking at it.

## The dev loop, in the window that ships

`devUrl(app)` returns the vite dev server's address, or `''` — which every caller then
reads as the question "am I in dev" as well as the answer "and it is there".

- `OPENFLOW_DEV=1` points the window at vite instead of at the build. It is the only way
  to get a hot update inside the real shell: what an app serves in production is a `vite
  build`, and a build has no hot anything in it.
- `OPENFLOW_DEV_URL` names the address outright, for a dev server this could not guess.
- `retry: true` asks again after a second when a load fails. Running the app before its
  dev server has finished booting is the ordinary way in, and it otherwise leaves a
  window showing a connection error that reads as a broken app. Never on `-3`
  (`ERR_ABORTED`) — that is a load that was *replaced* rather than one that failed, and
  retrying it is how you get a loop.
- `markDev()` appends ` — dev` to the title, and keeps appending it: the page sets its
  own `<title>`, which wins over the constructor option. Two windows that look identical
  and talk to different things is the confusion the icons exist to avoid.

## Quitting, and not quitting twice

`lifecycle()` is the pair macOS needs said explicitly: `window-all-closed` quits, and
`activate` reopens. These apps are launched deliberately and quit deliberately, so both
halves say so rather than leaving the platform default.

`only()` is the single-instance lock, and a second launch focuses the first. It matters
most for an app that owns a server: a second instance spawns a second one that dies of
`EADDRINUSE` on the spot, leaving a window with nothing behind it.
