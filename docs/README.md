# User manual

Better Session View is a session manager for large Ableton Live sets. It gives you a
real UI for the work Live's own grid makes slow: naming and coloring clips and scenes
across a hundred-song set, tagging what each scene is *for*, and pushing the running
order around before you commit to it.

Live stays the audio engine and the source of truth. This app reads and writes your set
through a Max for Live device — it never touches your `.als` file.

## Start here

| | |
|---|---|
| [Installing](installing.md) | getting the device into Live and open |
| [Reading the grid](the-grid.md) | what you're looking at, and how to get around it |
| [Playing things](playing.md) | ⌘ is the "talk to Live" key — read this before clicking around |

## The work

| | |
|---|---|
| [Naming scenes](naming.md) | the convention, and renaming a whole song at once |
| [Roles](roles.md) | tagging what a scene is for — intro, verse, chorus, jam |
| [Color](color.md) | clips, songs, and coloring a whole set from a rule |
| [The running order](running-order.md) | dragging songs into the order you want |

## When it goes wrong

| | |
|---|---|
| [Undo](undo.md) | what comes back, and the one thing that doesn't |
| [Keyboard reference](keyboard.md) | every shortcut on one page |
| [Troubleshooting](troubleshooting.md) | the status line, the log, and common stalls |

Bugs and questions go to
[Issues](https://github.com/ryangavin/better-session-view/issues).

## The two things to know up front

**Nothing makes a sound unless you hold ⌘.** Plain clicks and plain arrow keys select,
fold and move. Add ⌘ (Ctrl on Windows) and Live responds — a clip fires, a scene
launches, a track stops. That's what makes the grid safe to click around in while
you're labelling a set. See [Playing things](playing.md).

**Live's ⌘Z will not bring back anything this app writes.** Renames and recolors go
straight into Live's object model, which doesn't participate in Live's undo history.
The app provides its own single-level undo instead. See [Undo](undo.md) — including the
one operation that has no undo at all.
