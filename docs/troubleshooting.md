# Troubleshooting

## The two status pills

The header carries a connection pill and a LOM pill. Both have to be good before
anything works.

| | means | do |
|---|---|---|
| `connecting` / `closed` | the browser can't reach the device | check the device is still on a track in Live and the status line reads `connected to Live` |
| `lom waiting` | the server is up, but Live isn't answering | give it a moment after loading the device; if it stays, see below |

The app retries the connection about once a second, so a device that comes back is
picked up without reloading the page.

## The device's status line, in Live

| it says | it means |
|---|---|
| `starting…` | the patcher loaded, Node hasn't booted |
| `server up` | listening, but the handshake with Live hasn't completed |
| `connected to Live` | working |

**Stuck on either of the first two? Options ▸ Max ▸ Open Max Window.** Every error and
every timing line lands there. That's the first place to look for anything the browser
can't tell you.

Common causes:

- **Two copies of the device.** Only one can run — they'd fight over port 17800. A second
  instance posts a warning rather than crashing, but it won't serve anything.
- **The three files got separated.** `SessionBridge.amxd` loads `bridge.js` and `lom.js`
  from beside itself. If you moved only the `.amxd`, it will never get past `starting…`.
- **The device was loaded before Live finished opening the set.** Delete it from the
  track and drag it back on.

## The log

The bug icon in the header toggles it, and **it opens itself whenever something fails**.

Every write in this app reports there rather than throwing, so if a rename or recolor
didn't take, the log is where it says why. Log text is selectable — an error message you
can't copy is one you retype by hand.

## Nothing appears in the grid

The empty state says *Load the device in Live, then hit ⟳ in the header.* If the set is
loaded and you still see it:

- Check both pills. Without a connection there's nothing to read.
- Press the **sync** icon to re-walk the set by hand.

The set normally loads by itself the moment Live reports ready. That happens **once per
session** by design: a walk that fails leaves nothing loaded, and retrying automatically
would hammer Live with the walk that just broke. So after a failed load, the sync button
is the retry.

## Swatches are missing

The palette is derived from Live the first time it's needed and cached. A failure never
blocks your set from loading — you get the grid without swatches rather than an error
where the grid should be.

**Re-derive palette** in the rail is the retry, and it's also what to press after a Live
upgrade.

## A song looks wrong

Most of these are the grid reporting something rather than failing:

| | |
|---|---|
| `mixed color` on a header | some scenes of the song are colored and some aren't — see [Color](color.md) |
| values in **amber** | the song's scenes **disagree** about a fact. Both are shown rather than one being picked |
| `part 2 of 2` | the song appears in more than one run. A reprise, or two songs sharing a name |
| a song is missing entirely | its scene names don't match the convention — check [Naming](naming.md). Unmapped scenes are counted along the bottom edge |

## A rename or recolor did nothing

Check the count on the button before pressing it. Writes that would change nothing are
filtered out, so recoloring a scene where every clip is already that color really does
write zero — the count is honest rather than inflated.

If the count was non-zero and nothing happened, the log will have the error.

## Undo didn't fully work

Two known cases, both by design:

- **A scene that had no color can't be given none back.** Live has no writable "no
  color". The log says how many scenes that affected.
- **Reordering scenes has no undo at all.** See [Undo](undo.md) and
  [The running order](running-order.md). Save before you reorder.

## It's slow on a big set

Every snapshot prints a phase breakdown to the browser console (⌥⌘I on macOS), plus a
projection to a full-size set:

```
⏱ snapshot  243 clips · 100 scenes · 1041ms end-to-end
  lom: tracks / scenes / slot scan / clip reads
  v8 → dict        JSON.stringify + Dict.parse
  node getDict     Max dict → JS object
  wire + parse     payload size
  react commit
projection to 848 scenes (×8.5, linear): ~8.8s end-to-end
```

The counts along the bottom also show `LOM walk` and `Slot scan` times. Every phase is a
linear scan, so the projection is honest.

If it's the grid rather than the walk, try the **S** column width — fewer visible columns
is less to render.

## Getting help

Bug reports go to
[Issues](https://github.com/ryangavin/better-session-view/issues). Worth including:

- your Live version and OS
- what the device's status line said
- anything in the Max window (Options ▸ Max ▸ Open Max Window)
- the app's log, which you can select and copy
