# The library

`mix/electron/manifest.ts`, `mix/electron/library.ts`, `mix/electron/youtube.ts`,
`mix/src/components/Library.tsx`.

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

**A refusal is per file, not per batch.** Dragging several files can include a stray `.DS_Store`
or a PDF, and one of those must not stop the eleven WAVs beside it. What was refused and
why comes back with the count that succeeded.

The Import button opens a multi-file picker. Dropping files anywhere on the window takes
the same path: the page hands browser `File` objects to the isolated preload,
`webUtils.getPathForFile` resolves only those genuine dropped files, and the main process
passes the resulting paths to `addFiles`. The renderer never receives a filesystem path
and cannot invent one through the bridge.

The dashed drop target is window-wide because dropping on a waveform should not navigate
the app to a local file. It appears only after a library folder has been chosen and while
no other import is running.

## YouTube is another source, not another kind of track

Paste a YouTube video URL into the rail and press **Fetch**. The app runs its bundled,
checksum-pinned official `yt-dlp` executable with `bestaudio`, imports the one file it
wrote through `addFiles`, and removes the temporary download. The file in `audio/` and the
manifest row are therefore exactly the same as a Finder import; no URL or machine path is
recorded in the portable library.

The boundary is intentionally narrow:

- only HTTPS YouTube, youtu.be and youtube-nocookie hosts are accepted;
- every accepted link is reduced to its video id first, so playlist, radio, timestamp and
  tracking parameters are discarded rather than changing what yt-dlp extracts;
- playlists are reduced to the linked video, live streams are refused, and at most one
  file is downloaded;
- user yt-dlp configuration, plugin directories and remote components are disabled;
- the best audio-only stream is kept without transcoding. YouTube commonly serves that as
  Opus in a WebM container, so `.webm` is an advertised library format now;
- the official executable carries the current YouTube scripts, and Electron's signed
  binary is supplied as its Node runtime so a Finder launch does not depend on a shell
  installation.

`tools/prepare.ts` fetches immutable release bytes and verifies their published SHA-256
before `electron-builder` signs the executable with the rest of the app. It stays separate
from the Python separation environment: importing a URL must not install torch first.

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

Its filename — and, if a catalogue recognised it, who it is by and what it looks like.
`bpm`, `key` and `seconds` are still `null`, and `null` is drawn as unknown rather than
as zero. The library row shows the file's own type where the key and tempo would go,
which is honest and better than a column of dashes; the idle page says "length not read
yet" instead of inventing an estimate. Tempo and key are detection and are not here yet.

**The filename is read first, offline** — [`guess.ts`](../electron/guess.ts). `Artist -
Title`, with the track number off the front, the video id `yt-dlp` was told to append off
the end, and `(Official Video)` gone while `(feat. Rosalía)` and `(Live at Massey Hall)`
stay. That last distinction is why the bracket rule is a deny-list: strip every bracket
and four different recordings collapse into one title.

**Then the catalogue is asked** — [`art.ts`](../electron/art.ts), the iTunes Search API,
chosen because it needs no key and no account, so a build works the day it is installed.
What leaves the machine is the guessed title and nothing else: no track id, no path, no
identifier that persists between calls. The cover comes back into `art/<id>.jpg`, relative
like every other path here, because a library that needed the internet to draw itself
would not be portable, only mobile.

### The two guards on writing without being asked

The lookup runs automatically at import, so it writes to a person's library with nobody
watching. Two rules keep that honest, and both are about the same failure — a filled-in
row looks exactly like a correct one.

**A track whose filename gave up no artist is not looked up at all.** That is the bounce
out of a DAW, `mixdown_v3`, and a catalogue searched for it returns a real song by a real
artist with real art, every time. Renaming somebody's rough mix after a stranger's record
is the worst thing this could do, and the filename already said it does not know.

**A match has to be recognisable in what was searched for** — three quarters of its
title's words have to be words that were asked for. `Weird Fishes / Arpeggi (Remastered)`
passes a search for `Radiohead Weird Fishes`; `Bounce Back` does not pass `bounce final
FINAL`.

Past both, the artist and the album are taken and **the title is not**. A filename that
already said `Artist - Title` is a better source than a search's first result, which for a
remix or a live take is confidently the studio version.

**A lookup can never fail an import.** Offline, refused, rate-limited, nonsense back —
every one of them answers with nothing, and the track keeps the name its file gave it.
A library is worth more than its metadata.

### Correcting it

Everything above is a guess, so all of it is editable: the separation screen carries the
title, artist, album and cover, and a **Look up** that runs the same search against
whatever the fields now say and shows the candidates rather than applying one. One result
is a fact; five results are a question, and a question is the honest thing to draw when a
title exists as a single, an album cut, a remaster and two live takes.

Only those four fields can be written back — `Edits` in
[`manifest.ts`](../electron/manifest.ts) is deliberately not a `Partial<Track>`. `file`,
`model` and `stems` are facts about the disk rather than about the music, and a window
that could rewrite them could point a track at somebody else's stems.

## What separation writes back

Nothing here is simulated any more. A finished separation records three things against
the track — the model, the sources, and `stems/<id>/<model>` as a **relative** path like
everything else in the manifest — and it fills in the track's length, because the
separator is the first thing in this app that actually decoded the file. Until then a
length is null and is drawn as unknown rather than as zero.

The write is `recordStems`, and it is the same read-change-write-atomically every other
change here uses, because two facts have to land together or neither should: where the
stems are, and which model made them. A manifest naming a model with no directory beside
it is the one state the window cannot render honestly. The stems themselves, and the
sidecar that describes them, are [`stems.md`](stems.md).

What is **not** written here is the mix — the faders, the mutes, the slices. Those live
in `localStorage` on this machine, so carrying the folder elsewhere carries the audio and
the stems but not the balance. [`playback.md`](playback.md) has why, and what it would
take to change.

## Not yet

- **Reading the file's own tags**, which would beat both the filename and the catalogue
  when they are there — and are there for a properly ripped library, which this app has
  not met yet.
- **Removing a track**, which is a manifest edit plus a decision about whether the audio
  goes with it.
- **Re-scanning the folder**, for audio somebody dropped in by hand.
