# Undo

## Live's ⌘Z will not bring back anything this app writes

This is the first thing to understand. Renames and recolors go into Live's object model,
which **does not participate in Live's undo history**. Pressing ⌘Z in Live after a rename
here will undo whatever you last did *in Live* — not the rename.

So the app provides its own undo. It's the only way back that exists.

## What you get

**⌘Z**, or **Undo last write** in the rail.

**One level, and no redo.** That's on purpose rather than unfinished: every write
re-reads the set, so a stack would have to stay valid across that, and a stale entry that
quietly restores the wrong thing is worse than having no stack at all.

The entry is used up whether or not the undo succeeded, so a failed undo can't be
replayed into a half-reverted state by pressing ⌘Z twice.

⌘Z in a text field still does what you expect — the app doesn't steal it while you're
typing.

## What comes back

Names and colors, for clips and scenes. The app captures the reverse of every write
before making it, out of the snapshot it already holds — which costs nothing, because a
snapshot already knows every clip's name and color.

Three things are deliberately left out of an undo, and each is a way undo could
otherwise do damage of its own:

- **A cell that had no clip.** There's nothing to restore, and writing a name there would
  fail.
- **A field the write never touched.** Reverting a color you didn't change would be a
  destructive undo.
- **A write that changed nothing.** Which is what makes "nothing to undo" meaningful — it
  says the write had no effect, not that undo failed.

## What doesn't come back

**A scene that had no color at all can't be restored to having none.** Live has no
writable "no color", so the app drops that part of the revert rather than painting the
scene palette slot 0 — an undo that leaves a scene a color it never had is worse than one
that leaves it alone. It logs a line telling you how many scenes that affected.

**Reordering scenes has no undo here, and can't.** Undo works by reading "before" out of
the snapshot, and a snapshot holds nothing that could rebuild a deleted scene's clips. A
move therefore *clears* the undo entry — a ⌘Z that wrote clip names against the wrong rows
would be worse than no undo at all.

Instead, a move asks Live to group itself into one step in **Live's own** history, and
the log says whether Live agreed. Treat that as a safety net that hasn't been proven, not
as a guarantee. **Save before you reorder.** See
[The running order](running-order.md).

## Where failures show up

Every write in this app reports into the log rather than throwing, and **the log opens
itself when something fails**. If a write didn't take, that's where it says so — the bug
icon in the header toggles it by hand.

A hidden log would be the difference between a failed write and a silent one, which is
why it opens on its own.
