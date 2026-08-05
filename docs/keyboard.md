# Keyboard reference

**⌘ on macOS, Ctrl everywhere else.** Written as ⌘ throughout.

Shortcuts are ignored while you're typing in a field, so the rename box keeps its own
editing keys — including its own ⌘Z.

## Transport

| | |
|---|---|
| `Space` | start the song, or stop it if it's rolling |
| `Esc` | stop all clips, keep the song rolling |

## Moving and firing

| | |
|---|---|
| `↑ ↓ ← →` | move the active cell — silent |
| `⌘` + any arrow | move **and fire** what you land on |
| `⌘⏎` | fire the active cell without moving |

With nothing active yet, the first arrow press *places* the cell on the first visible
scene rather than moving it.

Arrows walk what's on screen. A collapsed track group or a folded song is skipped, so
`⌘↓` can't descend into scenes you can't see and fire them.

`←` from the first track column lands on the scene name; `→` from the scene name goes
back to the first track.

## Editing

| | |
|---|---|
| `⌘Z` | undo the last write — one level, no redo |

## Mouse

| | plain | modified |
|---|---|---|
| **clip cell** | select | `⇧` extend a block · `⌥` toggle one · `⌘` **fire** |
| **scene name** | select the row and its clips | `⇧` extend over scenes · `⌘` **fire the scene** |
| **▶ in the scene gutter** | **fires the scene** — no modifier needed | |
| **song header** | fold or unfold that song | drag to reorder |
| **song title** | select every scene of that song | |
| **track group header** | collapse the group | |
| **collapsed group column** | expand it again | |
| **track name** | — | `⌘` **stop that track** |
| **role chip** | open the role menu | |
| **swatch** | writes immediately | |

Note `⌥` rather than `⌘` for adding to a selection — ⌘ is spoken for by launching.

## The rule behind all of it

Unmodified input never makes a sound. Everything plain is organizing — selecting,
folding, moving. Add ⌘ and Live responds.

The two exceptions are the **▶ button**, whose only job is firing, and **⌘Z**, which
isn't a grid gesture at all.
