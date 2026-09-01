# The library

`mix/electron/manifest.ts`, `mix/electron/library.ts`, `mix/src/components/Library.tsx`.

A folder you chose, the audio inside it, and one manifest that makes the pair portable.

```
<library>/
  library.json          the index — every path in it relative to this file
  audio/
    Nightcrawler.mp3
    Copper Wire.mp3
    AC-DC live.mp3
```

## Portable means one thing

**Nothing inside the folder records where the folder is.** That is the whole design, and
every other decision here falls out of it. Tracks name their audio as `audio/…` with
posix separators; the manifest sits at the root so "relative to the manifest" and
"relative to the library" are the same sentence. Put the folder on a drive, carry it to
the machine at the venue, open it there, and it works.

The one machine-specific fact — where the folder *is* right now — has to live outside it,
because a library cannot tell you where to find it. It goes in this app's own state
directory (`~/.openflow/mix/electron/settings.json`), which is the same place the window
bounds go and for the same reason.

There is a test for exactly this claim, and it is the one worth keeping: no track's `file`
is ever absolute, or starts with `..`, or contains a backslash.

## Importing copies

A library that referenced files where they already sat would break the first time
somebody tidied their Downloads folder. The point of a library is that it still works
next year, so `add` copies.

`copyFile` rather than a stream, which lets the OS clone on APFS — importing a folder of
WAVs off the same volume is nearly instant rather than a real read and write.

Names are sanitised into something a filesystem accepts and a person still recognises:
`AC/DC: live` becomes `AC-DC- live`, leading dots are stripped so nothing becomes a
dotfile, and a name that sanitises to nothing becomes `track`. Collisions get `-2`, `-3`
and **never overwrite** — importing the same filename twice gives you two tracks, which
is the safe way to be wrong.

**A refusal is per file, not per batch.** Dragging in a folder means a stray `.DS_Store`
or a PDF, and one of those must not stop the eleven WAVs beside it. What was refused and
why comes back with the count that succeeded.

## The manifest is written once, and atomically

Once per import, after every copy has either worked or failed — writing per file would
leave a half-updated index if the disk filled on the ninth of ten, and an index that
disagrees with the audio beside it is the one state this is meant never to reach.

Atomically, because this file *is* the library: the audio beside it is worth little
without the index. It is written to `library.json.writing` and renamed over the top, and
`rename` within a directory is atomic on every filesystem this will meet. A crash
mid-write leaves the previous manifest intact rather than a truncated one.

## What it refuses to guess

**A folder with no manifest is a new library**, not a broken one — that is what choosing
an empty folder means. It reads as empty and the file appears on the first import.

**A manifest that will not parse throws**, and the window says so and offers to pick a
different folder. It is emphatically not replaced with an empty one: that would turn a
typo into data loss. Nothing is changed on that path, and the empty state says so, because
the useful thing to know when something is wrong is what has *not* happened.

## What a track knows on the day it arrives

Its filename, and nothing else. Nothing has read its tags, decoded it, or run detection,
so `artist`, `bpm`, `key` and `seconds` are all `null` — and `null` is drawn as unknown
rather than as zero. The library row shows the file's own type where the key and tempo
would go, which is honest and better than a column of dashes; the idle page says "length
not read yet" instead of inventing an estimate.

Filling those in is the next thing this file needs, and it is two separate jobs: tags are
a parser, and tempo and key are detection. Neither is here yet.

## What is still simulated, and why it does not touch the folder

The separation is a timer. When it "finishes", the result is held in
`mix/src/state.ts`'s `pretend` map for as long as the window lives, and is **never
written to the manifest** — recording a fake separation in a file the user owns would be
writing a lie into their library. So the flow is complete end to end (import → choose a
model → watch it run → lanes) while exactly one step of it is pretend, and the pretence
cannot outlive the window.

## Not yet

- **Drag and drop onto the rail.** `add` already takes explicit paths for it, but Electron
  removed `File.path`, so the renderer needs `webUtils.getPathForFile` exposed through the
  preload before a drop can name a file.
- **Removing a track**, which is a manifest edit plus a decision about whether the audio
  goes with it.
- **Re-scanning the folder**, for audio somebody dropped in by hand.
- **Stems**, which will land at `stems/<track id>/<source>.wav` and be recorded on the
  track — relative, like everything else.
