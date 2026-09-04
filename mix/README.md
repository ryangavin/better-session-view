# `@openflow/mix`

**mix[flow]** — a mix in, four parts out. Local stem separation with
[Demucs v4](https://github.com/adefossez/demucs): drums, bass, vocals and everything
else, from a file you already have or a YouTube URL, on a machine you already own.

```sh
npm run dev:mix      # working on it: the dev server and the window, one command
npm run mix          # the app, on what is built
npm run pack:mix     # a .app and a .dmg under release/mix/
```

**The app installs its own engine.** Demucs is Python, and none of it ships inside the
`.app`: the bundle carries `uv`, a small LGPL FFmpeg decoder and a lock file, and the
first separation on a machine builds the environment into Application Support —
[`docs/demucs.md`](docs/demucs.md). Nobody is asked to install a toolchain or an audio
decoder, and nothing unsigned goes in the bundle.

**YouTube importing carries its own tool too.** A checksum-pinned official `yt-dlp`
executable fetches the best audio-only stream; it does not wait for the Demucs engine to
be installed and does not use a Homebrew copy — [`docs/library.md`](docs/library.md).

**Everything on screen is real except the slices.** Tracks live in a folder you pick,
copied there on import, indexed by a manifest that makes the folder portable —
[`docs/library.md`](docs/library.md). Pressing Generate runs Demucs against the file and
writes float32 stems into that same folder with a sidecar describing them —
[`docs/stems.md`](docs/stems.md). Those stems are then decoded, drawn and played:
the waveforms are the audio, and the faders move it — [`docs/playback.md`](docs/playback.md).
The bass stem can also become cached MIDI and standard EADG tab —
[`docs/transcribe.md`](docs/transcribe.md).
The grid is measured too: `src/transients.ts` hears where the separated drums hit to
the sample, `src/tempo.ts` reads the tempo and the downbeat off all of them, and
`src/follow.ts` finds every beat of the song and places it — the map in `src/warp.ts`
is the sample of every beat and the only truth about timing, with no BPM stored
anywhere — so a track opens gridded rather than ruled at 120. With warp on the stems
play stretched to the header's tempo, every beat to the grid, through
`src/stretch.ts` — [`docs/playback.md`](docs/playback.md). The window remembers
itself across a reload.
The slices are still eight evenly spaced spans with names, because nothing detects an
arrangement yet, and the export button closes the dialog.

**This is an index. Read the row you're changing.**

| touching | read |
|---|---|
| the library folder, the manifest, or importing | [`docs/library.md`](docs/library.md) — `electron/manifest.ts`, `electron/library.ts` |
| the layout, the colours, which lanes there are, or zooming the timeline | [`docs/window.md`](docs/window.md) — `src/`, and `src/zoom.ts` for the zoom |
| separation: models, jobs, progress, the sidecar, where stems go | [`docs/stems.md`](docs/stems.md) — `electron/models.ts`, `job.ts`, `separate.ts`, `python/separate.py` |
| bass transcription, MIDI, tuning-aware tab, or its cache | [`docs/transcribe.md`](docs/transcribe.md) — `electron/transcribeJob.ts`, `transcribe.ts`, `python/transcribe.py`, `src/tab.ts` |
| playback, the mixer, the waveforms, the beat map, finding the beats, the stretcher, or what survives a reload | [`docs/playback.md`](docs/playback.md) — `src/audio.ts`, `engine.ts`, `warp.ts`, `transients.ts`, `tempo.ts`, `follow.ts`, `schedule.ts`, `stretch.ts`, `remember.ts` |
| whether the beats it found are right: the analysis harness in the app, the arms, the batch run | [`docs/harness.md`](docs/harness.md) — `src/debug/`, `tools/mix-warp.ts`, `src/trace.ts` |
| where the Python engine comes from, how it is installed, and the probe | [`docs/demucs.md`](docs/demucs.md) — `electron/runtime.ts`, `python/pyproject.toml`, `tools/prepare.ts` |
| the window, packaging, or anything shared with the other apps | [`desktop/README.md`](../desktop/README.md) — there is no mix[flow] version of it, and that is the point |

## What is actually here

| file | |
|---|---|
| `electron/main.ts` | the window, the library IPC, and the two local engines |
| `electron/runtime.ts` | the Python engine: where it lives, what built it, and the probe. Tested |
| `electron/manifest.ts` | the library on disk. No electron import, so it is testable — and tested |
| `electron/library.ts` | the dialogs, URL imports, and where the folder is right now |
| `electron/youtube.ts` | the narrow, pinned yt-dlp run and its temporary download |
| `electron/models.ts` | which models will run, what they emit, what they cost |
| `electron/job.ts` | what a separation is: the cache key, the sidecar, the progress. Tested |
| `electron/separate.ts` | the separation child process and cancellation |
| `electron/work.ts` | the one shared local-engine lease for separation and transcription |
| `electron/transcribeJob.ts` | transcription identity, sidecar, paths and progress. Tested |
| `electron/transcribe.ts` | the pitch worker, cache reuse, atomic handoff and cancellation |
| `python/separate.py` | the worker. Talks JSON, writes stems that sum |
| `python/transcribe.py` | the bass worker. Talks JSON, writes MIDI and note events |
| `python/pyproject.toml` | the locked dependencies both workers use, and `uv.lock` beside it |
| `tools/prepare.ts` | fetches pinned `uv` and builds pinned LGPL FFmpeg for the bundle. `tools/app.ts` runs it |
| `electron/preload.ts` | the context bridge |
| `src/audio.ts` | reaching the stems, decoding them, and the peaks that draw them |
| `src/engine.ts` | the transport and the mixer, which are one Web Audio graph — and the stretcher beside the sources |
| `src/schedule.ts` | how a map plays at a tempo: the boundaries, and the playhead back out of them. Tested |
| `src/stretch.ts` | Signalsmith Stretch as one worklet node for every stem |
| `src/remember.ts` | what survives a reload, and what deliberately does not |
| `src/mock.ts` | how a source is drawn, and the one invented thing left |
| `src/zoom.ts` | how much of the track the lanes show, and which part |
| `src/warp.ts` | the beat map: the sample of every beat, and the only truth about timing. Tested |
| `src/transients.ts` | where the drums hit, in three bands, to the exact sample. Tested |
| `src/tempo.ts` | the tempo, which pulse is the beat, and the downbeat, read off every hit with no lean. Tested |
| `src/follow.ts` | every beat of the song found at once and placed on a hit or evenly between two. Tested |
| `src/tab.ts` | standard EADG bass, the fret-path search and tab layouts. Tested |
| `src/tablature.ts` | visible-slice projection for the shared notation widget. Tested |
| `src/midi.ts` | deterministic MIDI rebuilt after octave correction. Tested |
| `src/grid.ts` | how finely the grid rules at that zoom, and what each line is. Tested |
| `src/state.ts` | everything the window knows, in one hook |
| `src/components/` | the header, the library, the three states, the lanes and the warp lane |

Everything else — the frame it remembers, the scheme, the dev loop, the navigation
policy, the updater, the icon, the packaging — is `@openflow/desktop` and
`desktop/src/apps.ts`. This app was stood up to find out what that costs. It cost an
entry in the registry and the four files above.

## Naming

The app is about a mix, and `set/` already has a mixer. That collision is fine and
deliberate: **the words keep their ordinary meanings in both places**. A mixer is a
mixer, a mix is a mix, and nothing here is renamed to avoid an overlap a musician would
never notice. Where the two apps genuinely need the same control, the answer is
`@openflow/widgets`, which is already where a fader lives.

The one word that *was* changed is **slice** — the mockup called it a scene in the code
and a cue in the header, and both already mean something exact in Live.
[`docs/window.md`](docs/window.md) has the reasoning.
