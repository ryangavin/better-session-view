# Serving an app's own build

`desktop/src/serve.ts`.

An app with no server of its own is a file server over a `vite build`, and it serves
that over a scheme of its own rather than `file://`. Two calls: `scheme(app)` before
`whenReady`, because Electron requires a privileged scheme to be declared early and does
not forgive it — registering late fails silently and the window loads nothing — and
`serve(app, dist)` once ready.

It buys two separate things, and an app that skips it loses both.

**Root-absolute URLs work.** A built page asks for `/assets/…` and whatever else sits in
`public/`, because a server was serving them. Under `file://` those resolve to the
filesystem root and 404; under a scheme with `standard: true` they resolve against the
origin and work untouched. So the renderer needs no `base`, and dev and desktop stay one
build.

**A stable origin**, which is what `localStorage` is keyed by. Everything an app
remembers about how it looked lives there, so `set://app` surviving a rebuild is the
difference between settings that persist and settings that evaporate. `file://` is an
opaque origin and promises nothing.

The scheme is the app's `name`, so it cannot drift from the state directory or the
module.

## The handler is a file server

Which means it answers for its root and nothing above it. `path.normalize` then a prefix
check, before any read — a URL is attacker-shaped input even when the only thing sending
one is your own page, and the guard is two lines.

Unknown extensions get `application/octet-stream` rather than a guess. The table is
short on purpose: it is what a vite build actually emits.

## When not to

visual[flow] does not use this. Its server is already answering on a port, so it has a
real origin already — `location.host` works, `/media/*` works, and the `localStorage`
that holds the keystone corners is on the same origin a browser would have used. An app
with a backend should load from it, not from a scheme.
