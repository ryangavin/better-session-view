# Naming

## The scene name is the record

A scene name looks like this:

```
[CHORUS] @128-Bm NIGHTFALL
 └ role ┘  │   │  └ song ┘
           │   └ key
           └ bpm
```

All three parts are optional. **Role first, facts second, name last**, so a column of
scene names reads as structure rather than as a list of titles.

This is the whole design, not a formatting preference: **the name *is* the mapping.**
Scenes have no stable id in Live, so there's nothing to key a sidecar file to. Putting
the song and the role in the name means they survive a restart, travel with the `.als`
to the gig laptop, and are visible in Live itself. Every time the app reads your set it
re-reads the names and works out which scene belongs to which song. Nothing is stored on
the side, and there is nothing to lose.

In the grid the role is lifted out into a colored chip, so Live holds
`[CHORUS] @128-Bm NIGHTFALL` and you read `@128-Bm NIGHTFALL · CHORUS`.

### Why those two punctuation marks

`@` and `-` are the only punctuation the facts need. After an `@`, a digit begins a
tempo and a letter begins a key — so `@128-Bm`, `@128` and `@Bm` are all readable with
nothing further, and the `-` simply drops with whichever part is missing.

The role keeps its brackets for a different reason: a role is recognised by
*vocabulary*, so a tag has to stay visibly there even when its name is unfamiliar. A
bare word would go silently missing the moment you renamed the role.

Names are parsed from the front and never guessed at in the middle, so `Arp Jam 2` keeps
its whole title rather than having the `2` read as a tempo, and `Em Dash` keeps its
whole title rather than having `Em` read as a key.

The song is **written in caps and read case-insensitively** — `NIGHTFALL` and
`Nightfall` are one song. The caps are presentation, not identity.

### If your set is named the old way

An older convention put the facts at the end: `Nightfall 128 Bm [chorus]`. That still
reads — the app understands both, and picks whichever gets more out of a given name, so
your songs still show up.

**Any rename converts that scene** to the current convention. A set moves over scene by
scene as you work through it, and a half-converted song still collects into one entry.
You don't have to convert anything in one go.

## Renaming scenes

Select some scenes — click a scene name, ⇧-click to extend, or click a **song title** to
get every scene of that song. The rail opens with three fields: **song**, **bpm**,
**key**.

The rule that makes this work across a mixed selection:

> **A field you leave alone stays as it is on each scene. A field you clear is cleared.**

That's what lets you select two songs' worth of scenes, set one shared key, and not
flatten their different names. A blank field means "these scenes disagree" when it
arrives and "delete this part" once you've emptied it, so the app tracks which fields
you actually *touched* rather than reading the values alone.

- Fields prefill from what the selection already agrees on. Where scenes disagree you
  get a **`mixed`** placeholder rather than one scene's answer spread over the rest.
- **bpm and key are validated as you type** and will block the button. A bad key is a
  rename you'd have to undo across a whole song.
- A preview line shows what you're about to write. Read it — it's what makes the
  leave-alone rule legible.

Then press **Rename N scenes**.

Renaming preserves each scene's role tag, so renaming a song across eighteen scenes
doesn't disturb the roles you assigned them.

## Tempo is a separate button

Under the fields is **Set tempo on N scenes** (or **Clear tempo on N scenes** when the
bpm field is empty).

**This is deliberately not part of Rename.** Everything else in the panel changes what a
scene is *called*. This changes what the set *does* — Live takes a scene's own tempo the
moment that scene fires. Folding it into a rename would mean a naming pass quietly
altered playback.

So `{bpm}` in a name and Live's actual `Scene.tempo` are two different things, and you
set them separately. Clearing the tempo is how you hand a scene back to the song tempo.

Unlike scene color, tempo reverses cleanly — turning one on is fully undoable.

## Renaming clips

Clip names are written from a **pattern** rather than typed one at a time. Select some
clips, and the Inspector's **Rename selected** field takes a template:

```
{bpm} {key} {label} {role}   →   128 Bm Arp Jam 1
```

Tokens that have no value are dropped and the whitespace closes up, so a missing `{key}`
never writes a literal `{key}` into a clip name and never leaves a double space.

Naming keeps a preview and an explicit **Rename N** button — unlike color, which writes
the moment you click a swatch. The asymmetry is on purpose: a color is instantly legible
in the grid and costs nothing to change, but a name overwrites something you can no
longer see.

Writes that would change nothing are filtered out. Renaming a scene where 22 of 30 clips
already carry that name writes 8, and the progress bar says 8 — a count that included
no-op writes would be a lie about how much work is happening.

## What the app read back

The **Songs** and **Unmapped** counts along the bottom edge are derived fresh from the
names on every snapshot. Click either to open the songs list; click a song there to
select its scenes.

**That list is read-only on purpose.** Its job is to answer "did the app read my set
correctly" — and it can't give you a misleading answer if it has nothing to write with.

Two things it won't smooth over:

- A song whose scenes **disagree** about a fact shows every value in amber rather than
  picking one. Showing a single value as though it were the answer is how drift hides.
- A song found in **more than one run** gets a flag rather than an error. Two runs is a
  reprise, or it's two different songs sharing a name — only you know which.
