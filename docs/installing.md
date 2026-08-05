# Installing

You need **Ableton Live 12 with Max for Live**. Built and tested against 12.4.3 Suite.

## Get the device

Download the latest zip from
[Releases](https://github.com/ryangavin/better-session-view/releases) and unzip it somewhere
permanent — not a Downloads folder you clear out.

Inside are three files:

```
SessionBridge.amxd    the device
bridge.js             the server, with the whole UI baked into it
lom.js                the half that talks to Live
```

**Keep all three together.** The device loads the other two by name from beside itself.
Move the folder, not the `.amxd`.

## Load it

1. Drag `SessionBridge.amxd` onto any track. It's an audio effect with a straight
   passthrough, so it's inert on the signal path — the Master track is a fine home.
2. Wait for the status line to read **connected to Live**.
3. Click **Open Session Manager**. Your browser opens `http://127.0.0.1:17800`.

The set loads by itself — you don't have to ask for it. The snapshot starts as soon as
the device reports it's ready to talk to Live.

## The status line

| it says | it means |
|---|---|
| `starting…` | the patcher loaded, Node hasn't booted yet |
| `server up` | the server is listening, but Live isn't answering yet |
| `connected to Live` | both halves are talking — you're good |

Stuck on either of the first two? **Options ▸ Max ▸ Open Max Window.** Every error and
every timing line lands there. More in [Troubleshooting](troubleshooting.md).

## What it does and doesn't touch

**Nothing you make is stored in the device folder**, so replacing it on an update costs
you nothing:

- Your **role vocabulary** lives in a `bsv.json` beside your `.als`, so it travels with
  the set.
- The **color palette** is cached machine-wide, under Application Support.
- Everything else — names, colors, roles — lives in the set itself. Roles are written
  into scene names, which is why they survive a restart and show up in Live.

The server binds `127.0.0.1` only, and nothing is downloaded at runtime. This is built
to work on stage with no network.

**One device per set.** Two copies would fight over port 17800; a second instance posts
a warning rather than crashing.

## After an update

Live usually reloads the device on its own. If behaviour looks stale, delete it from the
track and drag it back on.
