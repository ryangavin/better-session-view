# Where separation comes from

`mix/electron/runtime.ts`, `mix/python/pyproject.toml` and `mix/tools/prepare.ts`.

Demucs v4 is Python: `demucs==4.1.0` on torch, with model checkpoints cached in torch's
own directory. On Apple silicon it runs on MPS, and the numbers matter for what the UI
has to promise — from `demucs/README.md`, 20 seconds of audio:

| model | sources | 20s clip | |
|---|---|---|---|
| `htdemucs` | 4 | 4.1s (4.9×) | the default, one transformer pass |
| `htdemucs_ft` | 4 | 31.1s (0.6×) | four fine-tuned checkpoints — the best of these |
| `htdemucs_6s` | 6 | 8.0s (2.5×) | adds guitar and piano; piano bleeds badly |

At 4.9× a four-minute track is under a minute, and at 0.6× it is seven. Both are long
enough that a job is something you start and come back to, which is the shape the UI has
to take — not a spinner.

## The packaging question, and the answer

Several gigabytes of Python and model weights cannot go inside a `.app` the way
visual[flow]'s Link addon does. There were three answers and for a while none of them
was chosen:

**A workspace the user already has.** What the probe used to do: point at `demucs/` in
this repo, which is a research spike with its own `.venv`. Right for developing against,
and useless to anybody else — a packaged build resolved it to a path inside its own
bundle that has never existed.

**A venv the app builds on first run.** Cheap to ship. The objection recorded here was
that it puts a Python toolchain problem in front of a musician.

**A frozen binary per architecture**, built in CI. The largest download, no runtime
toolchain, and — the argument that looked decisive — the only one that could be
notarised cleanly.

**The second one won, and what changed the argument was `uv python install`.** uv fetches
its own standalone CPython, so nobody is asked to install anything: the app ships one
static binary and a lock file and builds the rest itself. The notarisation argument then
turned around completely, because it is the *frozen* answer that has the signing problem:

| | ships | first run | what has to be signed |
|---|---|---|---|
| user's workspace | nothing | they install `uv` and a Python project | nothing |
| **`uv` + a lock** | **+42 MB** | **~220 MB: the wheels and a Python** | **one extra Mach-O** |
| frozen per arch | ~1 GB per dmg | weights only | every `.so` in a frozen tree, under the hardened runtime |

A venv or a PyInstaller tree *inside* the bundle is thousands of Mach-Os that each need a
signature and have to survive the hardened runtime — and torch `dlopen`s its own
extensions, which is the fight this doc predicted. An environment built into Application
Support after install is outside our signature entirely: our own process writes it, so it
carries no quarantine attribute and Gatekeeper never assesses it. It also means an app
update is a hundred megabytes rather than one and a half gigabytes, because the engine
survives the update.

## What is where

The bundle carries three things it did not compile:

```
mix[flow].app/Contents/Resources/app/
  bin/uv              the pinned binary — mix/tools/prepare.ts fetched and checked it
  python/separate.py  the worker, which is ours
  python/pyproject.toml, uv.lock    what the engine is
```

and builds the rest under `~/Library/Application Support/mix[flow]/runtime/`:

```
  env/     pyproject.toml, uv.lock and the .venv uv syncs from them
  python/  a managed CPython, fetched by uv rather than found on the machine
  cache/   uv's cache — shared with the venv rather than a second copy of it
  built.json   what was built, and from what
```

One directory, so the answer to *make it do all that again* is delete this folder. First
run: about 220 MB down and about 620 MB on disk. A model checkpoint is a further 84 MB
the first time you use one, and `htdemucs_ft` is four of them — they arrive during the
*loading the model* stage a job already reports.

**`du` will say 1.2 GB and be wrong.** The uv cache holds a copy of everything the venv
does, and on APFS those are clones rather than copies: deleting the whole 578 MB cache
after an install returns **9 MB** of actual disk. Measured, because it is the difference
between keeping the cache and pruning it, and pruning it would make the next lock change
re-download a gigabyte to reclaim nothing.

**`mix/python/pyproject.toml` is not `demucs/pyproject.toml`.** The latter is a research
spike with extras this app does not run, and it is explicitly not part of open[flow].
This one is the four dependencies `separate.py` imports, locked. `uv sync --frozen`
installs exactly what was resolved and consults the network for nothing else, so two
machines that set themselves up a year apart get the same engine.

**Arm only**, deliberately: every dmg this project produces is arm64 and the release
workflow runs on Apple silicon, so the lock resolves for one environment. The day a
universal build is wanted, torch's macOS x86 wheels are the thing to check first.

## The stamp is what makes an update cheap

`built.json` holds a hash of the lock and the uv that built it — the same idea as a
separation's cache key in `job.ts`. A new version of the app with an unchanged lock finds
its engine already there and starts separating; one with a changed lock rebuilds, without
anybody deciding it should. It is written **only on success**, so a cancelled or crashed
setup is simply not built rather than half-trusted.

## The probe

`ready()` answers two questions and they are different ones:

- **`ok`** — could this build separate at all. False only for a bundle missing its own
  parts, or a `uv` that will not run. That is what draws the broken light in the header.
- **`built`** — is the engine there *yet*. False is every machine's first run, and it is
  not a failure: `Idle.tsx` says what pressing Generate will also do, before it is
  pressed, because a progress bar that appears unannounced is indistinguishable from
  something being wrong with the song.

Deliberately not `uv sync --dry-run` and deliberately not importing torch — both are
seconds on a window that has only just opened. Running the bundled `uv --version` and
comparing one stamp answers both in about ten milliseconds.

## Setting up is part of the job

`prepare()` is called by the runner, not by a button. A setup step somebody can skip is a
setup step that produces a bug report about Python, and there is no path to a separation
that does not go through it. It reports through the job's own progress, so the first
separation on a machine says *downloading torch · 111.2MiB* in the same place every other
separation says what it is doing — and Cancel reaches the `uv` child, because minutes of
downloading has to be stoppable.

The stage map in `stageOf` is written against what a **frozen** sync on a cold cache
actually prints, which is not what the ordinary one does — there is no `Resolved` line,
because nothing is resolved. What there is, in order: the Python being fetched, the venv
being made, one `Downloading <package> (<size>)` line as each large download *starts*,
and two summaries. Those per-package lines are the good ones, and they are why the long
minute of a first run reads `downloading torch · 111.2MiB` rather than sitting on a stage
that gives no sign of moving.

## What a job runs

The command is not the demucs CLI, because that reports progress as a tqdm bar — the
worker goes through `demucs.api` and prints JSON. What runs is:

```sh
<bundle>/bin/uv run --project <runtime>/env --quiet python <bundle>/python/separate.py \
    --input <track> --out <scratch> --model <checkpoint>
```

`OPENFLOW_DEMUCS` still names a project, and now means one thing: *use this environment
and skip the setup*. It is how you point mix[flow] at the `demucs/` research workspace,
and it is a development convenience — a packaged app never sees it, because a
Finder-launched `.app` does not inherit a shell environment. That was true before this
change too, and is most of why the old arrangement could not have shipped.

## Building it

`tools/app.ts` runs `<app>/tools/prepare.ts` before an app's main process, for any app
that has one. mix[flow] is the only one that does, and the seam is the same shape as
`visuals/tools/build-link.ts`: the thing neither vite nor esbuild makes.

The uv release is pinned by version **and** by digest. A build step that fetches whatever
is newest cannot be reproduced, and one that fetches over the network without checking
what it got is a supply chain nobody is watching. `mix/bin/` is gitignored — it is
fetched, not committed.

## Measured, on this machine

The whole path, end to end, with the bundled binary and an environment built from the
shipped lock:

| | |
|---|---|
| `uv sync --frozen`, cold cache | 9.8 s, on a fast connection — 32 packages |
| the same, warm | 4.5 s |
| what it downloads | ~220 MB: 190 MB of wheels, of which torch is 111 MB, plus 16 MB of Python |
| on disk | 572 MB of `.venv` and 48 MB of CPython. The 578 MB cache beside them costs 9 MB |
| a 20-second clip through `htdemucs` | 2.45 s wall, **8.19× realtime**, on `mps` |
| residual | −34.4 dB |

torch resolves to 2.13 against `demucs==4.1.0`, and MPS is live.
