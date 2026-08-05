# Reading the grid

The grid is scenes down, tracks across — the same shape as Live's Session View, with
room to actually read it. Everything else in the app opens from it and closes again.

```
┌─ header ─ status pills · playback · fold · S M L · log · snapshot ─┐
├─ track groups ────────────────────────────────────────────────────┤
├─ track names ─────────────────────────────────────────────────────┤
│ order…  color… │                                                  │
│  ▾ 128 Bm NIGHTFALL ·············· mixed color · part 2 of 2      │  ← song header
│  ▶ 12  [CHORUS]  @128-Bm NIGHTFALL │ ■  ■     ■ │                 │  ← scene row
│  ▶ 13  [VERSE]   @128-Bm NIGHTFALL │ ■     ■    │                 │
├─ the rail opens on the right when you pick something ─────────────┤
└─ counts along the bottom edge ────────────────────────────────────┘
```

## Two panes that start closed

Neither is what you came for, so neither is in the way until you want it.

- **The rail** (right) opens the moment you pick something to work on — a clip, a scene
  name, or a song title. Its `×` closes it and gives the grid back its width. You can't
  get stranded: clicking any of those three opens it again.
- **The log** (bottom) is behind the bug icon in the header — and it **opens itself when
  something fails**. Every write reports into it rather than throwing, so if a write
  didn't take, that's where it says so.

The **counts** along the bottom edge don't open or close. They're one line high, and
they're for glancing at after a snapshot or before an apply.

## Selecting

Two kinds of selection, deliberately separate:

- **Clips** — click a cell. ⇧-click extends a block, ⌥-click toggles one cell.
- **Scenes** — click a **scene name**. ⇧ extends over scenes. Selected scene rows get an
  amber left edge.

Clicking a scene name also selects every clip in that row, which is the fast path the
app exists for: **click a scene name, click a swatch** recolors the whole scene.

Scene selection is its own thing because a scene with no clips still needs to be
taggable with a role. So "which scenes am I about to tag" is never a guess.

Blocks only pick up cells that actually **hold a clip** — sweeping over 4,000 empty
slots would make the selected count a lie.

### The active cell

Exactly one cell is *active* — the one the arrow keys move, and the one the name field
will edit. It's separate from the selection. The scene name column counts as a cell, so
the active cell can sit there; `←` from the first track lands on the scene name, and `→`
takes you back.

Arrow keys walk what's **on screen**. A collapsed track group or a folded song is
invisible to the arrows as well as to your eye, which is what stops `⌘↓` descending into
scenes you can't see and firing them.

## Songs

The app reads your scene names and works out which song each scene belongs to. It does
this on every snapshot — nothing is stored on the side. See [Naming scenes](naming.md)
for the convention it reads.

Each run of scenes belonging to one song gets a **full-width header row** above it.

- **Click a header** to fold that song down to just the header row.
- **Click the song title** in a header to select every scene of that song — across all
  its runs — and unfold it first.
- **Drag a header** to move that whole run of scenes. See
  [The running order](running-order.md).
- The **hamburger** in the header folds or unfolds every song at once. A hundred songs
  fold to a hundred rows, which turns the set into a table of contents.

Folding is a view state. It never writes to Live, and it survives a re-snapshot.

### What a folded song tells you

```
▸  124  F#m GLASS TUNNEL··············· │  ■■  │      │ ■■■■ │  ■
   └────────── the scene column ───────┘ └ the sections each track plays ┘
```

The facts lead — bpm, then key, then the name — and every slot keeps its width whether
or not the song fills it, so the next song's name is where your eye already is. A song
that states neither fact shows `---` and `--` rather than a gap: a dash means the set
never named one, which is a thing to go and fix.

Out in the track columns, each track gets **one small square per section it plays** —
so you can see that the sparkle pad is in the choruses and the jam, not merely that it's
used somewhere. Colors come from your role vocabulary; hover a cell for the names and
counts. Clips on scenes with no role get a neutral grey mark, so a track used only in
untagged scenes still reads as used.

A few things you'll see on a header:

| | |
|---|---|
| `part 2 of 2` (or `2/2` folded) | this song appears in more than one run — a reprise, or two songs sharing a name |
| `mixed color` | some scenes of this song are colored and some aren't. A song is meant to be one color |
| amber values | the scenes of this song **disagree** about a fact. Both values are shown rather than one being picked |

None of those are errors. They're the grid telling you something to go and decide.

## Track groups

Group tracks are the header row above the track names, spanning their members. Click a
group header to collapse it; click the folded column to expand it again.

A collapsed group becomes one column showing **how many of its tracks have a clip in
that scene**, tinted with the group's color — so you can still see where the material is
without expanding.

Collapsing never writes to Live. It's re-seeded from Live's own fold state on every
snapshot, so your local toggles win until the next one. Selection is left alone when a
group collapses, which does mean the selected count can exceed what's on screen.

## Column widths

**S / M / L** in the header, roughly:

| | track column | fits in ~1100px |
|---|---|---|
| `s` | 40px | ~26 tracks |
| `m` | 74px | ~14 tracks |
| `l` | 116px | ~9 tracks |

The setting sizes the **track columns only**. The scene name column stays put, because
the question the setting answers is *how many tracks fit on screen*, and a scene name is
the same length whatever the answer is.

Live tells us nothing here — the Live object model has no Session View column width, so
these are ours to pick. Your choice is remembered on this machine.

## Re-reading the set

The set loads by itself when you connect. The **sync** icon in the header re-walks it,
which is what you want after changing something in Live directly.

Every snapshot prints a timing breakdown to the browser console, and the counts along
the bottom show the walk and slot-scan times. On a big set this is worth a look — see
[Troubleshooting](troubleshooting.md).
