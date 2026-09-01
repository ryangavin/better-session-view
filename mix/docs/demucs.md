# Where separation comes from

`mix/electron/demucs.ts`.

Demucs v4 is Python: `demucs==4.1.0` on torch, run through `uv`, with model checkpoints
cached in `~/.cache/huggingface`. On Apple silicon it runs on MPS, and the numbers
matter for what the UI has to promise — from `demucs/README.md`, 20 seconds of audio:

| model | sources | 20s clip | |
|---|---|---|---|
| `htdemucs` | 4 | 4.1s (4.9×) | the default, one transformer pass |
| `htdemucs_ft` | 4 | 31.1s (0.6×) | four fine-tuned checkpoints — the best of these |
| `htdemucs_6s` | 6 | 8.0s (2.5×) | adds guitar and piano; piano bleeds badly |

At 4.9× a four-minute track is under a minute, and at 0.6× it is seven. Both are long
enough that a job is something you start and come back to, which is the shape the UI has
to take — not a spinner.

## The open question, and it is a packaging one

Several gigabytes of Python and model weights cannot go inside a `.app` the way
visual[flow]'s Link addon does. Three answers, and none is chosen:

**A workspace the user already has.** What the probe does today: it points at `demucs/`
in this repo, which is a scratch project with its own `.venv` and its own `uv.lock`.
Exactly right for developing against, and useless to anybody else.

**A venv the app builds on first run**, with `uv` either found on the PATH or fetched.
Cheapest to ship and the slowest, most networked first launch — and it puts a Python
toolchain problem in front of a musician, which is the failure mode with the worst
ratio of "obvious to us" to "recoverable by them".

**A frozen binary per architecture**, built in CI. The largest download and no runtime
toolchain at all. It is also the only one that could ever be notarised cleanly: a
hardened runtime and a Python that `dlopen`s its own extensions do not get along by
default, and that is a problem to discover now rather than the first time a stranger
opens the `.dmg`.

`OPENFLOW_DEMUCS` names the workspace, so the answer can change without much here
changing. **`demucs/` in this repo is explicitly not part of open[flow]** — its own
README says so — and mix[flow] pointing at it is a development convenience, not a
dependency.

## The probe

`ready()` answers "could this machine separate anything" and is deliberately **not**
`demucs --help`: that imports torch, which is three to five seconds and a spinner on a
window that has only just opened. `uv --version` plus the workspace on disk answers the
same question — is the toolchain here, does it have a project to run — in about ten
milliseconds.

It never rejects. A missing toolchain is the ordinary first run, and it is something for
the window to say rather than something to fail on. `ENOENT` from a machine that has
never installed `uv` arrives as an `error` event rather than an exit code, so both are
handled.

## What a job is

Built, and its own document: [`stems.md`](stems.md). The command is not the
demucs CLI, because that reports progress as a tqdm bar — the worker goes
through `demucs.api` and prints JSON. What runs is:

```sh
uv run --project <workspace> --quiet python mix/python/separate.py \
    --input <track> --out <scratch> --model <checkpoint>
```

The worker is **ours** and lives in `mix/python/`; only the environment it runs
inside is the workspace's. That is the seam this whole file is about: whichever
of the three answers above wins, it changes `--project` and nothing else.
