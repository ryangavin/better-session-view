# Color

Three separate things get colored, and they answer different questions:

| | what it tells you |
|---|---|
| **the song** — a band across its scene rows | where you are in the set |
| **the role** — clips inside a song | the shape of the song |
| **the clip** — one cell at a time | whatever you need it to |

## Color writes on click

Click a swatch and it's written. No preview, no confirm.

That's deliberate, and it's the opposite of how naming works. A color is instantly
legible in the grid and picking a different one costs nothing, so the swatch *is* the
action. A name overwrites something you can no longer see, which is why that side keeps
a button.

The fast path this buys is the one the app exists for: **click a scene name, click a
swatch** — the scene's whole row of clips, recolored, in two clicks.

Writes that would change nothing are filtered out. Recoloring a scene where 22 of 30
clips are already that color writes 8, and the progress bar says 8.

## A song is one color

Coloring a song is **song-scoped, not selection-scoped**. Touch any scene of Nightfall,
press a swatch in **Song color**, and all twelve of its scenes are painted — reprise
included. The panel tells you which songs and how many scenes before you press anything,
because the write reaches rows you may not be able to see.

That's a deliberate loss of flexibility. A solid block of color in Live's own session
view is what a hundred-song set is navigated by, and a per-scene brush is precisely what
puts holes in it.

Two things follow:

- **Roles color clips, never scene rows.** See [Roles](roles.md).
- **A half-painted song shows as a fault, not as a color.** Its header says
  `mixed color` rather than picking one of them. "Some scenes painted, some not" is
  drift, and the grid reports it instead of hiding it.

The song's color rides on its header as a bar down the left edge plus a wash across the
row, so a fully folded set is a column of bands.

Live's palette contains colors dark enough to vanish against the app's background, so
the band is lifted just far enough to stay visible. The hue survives — that's the whole
point of showing Live's color.

## Coloring the whole set from a rule

**color…** at the head of the scene column opens the rule picker. Four rules:

| | says |
|---|---|
| **by key** | which songs will mix into each other |
| **by bpm** | where the set changes gear — the palette walks with the tempo |
| **rainbow** | nothing, but a hundred songs are told apart |
| **random** | the same, dealt |

You get a **preview of every song's new color**, then one **Apply**. That shape is the
point: doing this through the grid is one write per song, each with its own round trip
and re-read, and the waiting is what stops anyone *trying* an arrangement.

Three behaviours worth knowing:

- **A song the rule can't answer for is left alone**, and named in the list. No key means
  no color — not "the no-key color". Painting a song by a fact nobody wrote down is how a
  color stops meaning anything. A song whose scenes *disagree* about the fact counts the
  same way.
- **The count on the button is scenes, not songs.** Apply the same rule twice and it says
  `every song already carries its color` rather than claiming a hundred writes.
- **The modal stays open after applying**, unlike the running order. The write is
  undoable, nothing has been renumbered, and trying a second rule against what the first
  did is the point of having four. The preview repaints itself.

**Deal again** on `random` is a different deal, not a different rule — colors come from a
shuffled bag, so every allowed color is used before any repeats and no two songs in a row
match. Independent random draws clump, and a clump of one color across three adjacent
songs is exactly what a band is for.

### Choosing which colors a rule may use

Live has 70 clip colors and several are hard to tell apart at the size a scene row draws
them. **Eight chosen colors read better across a hundred songs than seventy do.**

The rule picker lets you pick the allowed set — start from the whole palette and remove,
or start from nothing and pick the few you want. The choice is remembered on this
machine, because it's a preference about how you like to look at a set rather than a
fact about this set.

Leaving it untouched means "whatever the palette holds", which is deliberately not the
same as ticking all 70: a future Live that shipped more colors should hand them to
someone who never chose, and not to someone who did.

## The palette

The app derives Live's actual palette the first time it needs it, and caches it
machine-wide. You don't have to ask for it.

It's derived once per Live version rather than per snapshot, because the derivation has
to briefly add and remove a clip — doing that on every read would mark your set dirty
and churn Live's undo history every time.

**Re-derive palette** in the rail is there for after a Live upgrade, and as the retry if
the automatic attempt failed. A failure never blocks your set from loading: you get the
grid without swatches rather than an error where the grid should be.

## One wart

**Undo cannot take a scene color back off.** Live has no writable "no color", so a scene
that started with none can't be restored to none — the app logs a line saying so rather
than letting the undo button promise more than it delivers. See [Undo](undo.md).
