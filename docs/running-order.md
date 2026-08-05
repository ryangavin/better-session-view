# The running order

> **This is the only thing in the app that can destroy work, and the only write with no
> undo on our side.** Read [Undo](undo.md) before using it in anger.

Two ways to reorder, for two different jobs.

## Dragging one song in the grid

**Drag a song header** to move that whole run of scenes. An amber line shows where it
lands, and the line carries the cost:

```
10 scenes · 84 clips copied · 10 deleted
```

That cost is on the drop line rather than in the log on purpose. There's no undo for
this, so what's about to happen has to be readable while the mouse button is still down.
A log line afterwards is too late to be a decision.

- **A drag moves one run, not one song.** A song can appear in several runs, each with
  its own header — dragging `part 2 of 2` moves the part you grabbed. Gathering both runs
  is something you can do by dragging one next to the other, but it won't happen as a side
  effect of grabbing one header.
- **Dropping a song back where it already is does nothing at all.** That's how most drags
  end, and the cheapest way to never delete a scene by accident is to not run.
- **The drop clears your selection and your undo entry.** Every scene index just came to
  mean a different row.

**Fold the songs first.** A folded song is draggable, which is the whole point of
folding — a hundred-song set becomes a table of contents you can reorder.

## Setting the whole order at once

**order…** at the head of the scene column opens the running order. Drag songs into the
order you want, then **Apply**.

One row per song, however many runs it has, because a running order is written in songs.
The draft is free — push it around as much as you like, nothing is written until you
press Apply.

Two consequences the modal says out loud rather than springing on you:

- **Applying gathers a song found in more than one run.** Its row says `2 runs → 1`, and
  a line under the list names the songs it will collect. A reprise stops being a reprise,
  which is a real change to your set that nobody dragged.
- **A scene the app couldn't read isn't in the list**, so it travels with the song it
  currently sits after — or stays at the top if no song precedes it. The count is shown,
  per row and in total. The alternative, pinning it to the index it holds now, would cut
  a song in half the moment the songs above it changed length.

The cost is stated before it runs (`18 scenes · 142 clips copied · 18 deleted`), and
applying **closes the modal and clears the selection**, because every scene index is
about to mean a different row.

It goes to Live as **one plan and one message**, not a move per song. That's what keeps
it a single entry in Live's own history — and a half-applied running order is the worst
state this app could leave a set in.

Only the scenes that actually have to move do move. Moving one song out of a hundred
costs what dragging that one song costs.

## Why there's no undo

Live has no "move scene" operation, so a move is build-then-delete: create blank scenes
at the destination, copy every clip across, carry the scene's properties, then delete the
originals.

The app's undo works by reading "before" out of the last snapshot — which holds every
clip's name and color, and **nothing that could rebuild a deleted scene's clips**. So a
move clears the undo entry rather than replacing it.

What it does instead is ask Live to group the whole move into one step in **Live's own**
undo history. The log tells you whether Live agreed. That mechanism is undocumented, and
this project treats it as unverified — so:

**Save your set before reordering.**
