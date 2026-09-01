# The separation engine

`mix/electron/models.ts`, `job.ts`, `separate.ts`, and `mix/python/separate.py`.

A source file and a model id go in; a directory of stems, a sidecar describing
them, and a row in the library's manifest come out. Where the Python
*environment* comes from is a separate and still-open question —
[`demucs.md`](demucs.md) — and nothing here depends on its answer.

## The four files, and why it is four

| | |
|---|---|
| `models.ts` | the registry: what will run, what it emits, what it costs |
| `job.ts` | what a separation *is* — the cache key, the output paths, the sidecar, and the worker's commentary turned into something a window can draw. No process in it, so it is the part that is tested |
| `separate.ts` | the child process, the queue of one, and cancellation |
| `python/separate.py` | the worker |

The split between the middle two is the same one `manifest.ts` and `library.ts`
already make: the code that decides what lands in a person's library is the code
that gets tests, and everything that needs a process or a window is kept out of
it so that it can.

## The worker talks in JSON, not in a progress bar

Demucs writes a tqdm bar to stderr. A bar is a picture of a number, and
reconstructing one from carriage returns and block glyphs is a parser that
breaks the first time the terminal width changes.

So the worker goes through `demucs.api` instead, which takes a callback and
hands it the real quantities, and prints **one JSON object per line on stdout
and nothing else**. stderr stays human, because that is where torch's warnings
and a stack trace go and those are for a person reading a log.

```
{"event":"stage","stage":"loading the model","model":"htdemucs_ft","device":"mps"}
{"event":"opened","load":1.46,"sources":["drums","bass","other","vocals"],"perSource":[…]}
{"event":"read","seconds":240.43,"samples":10603008}
{"event":"progress","done":0.31,"source":"bass"}
{"event":"written","source":"drums","file":"drums.wav","rms":-20.74}
{"event":"done","residual":-34.62,"wall":23.91,"realtime":10.06,…}
```

A line that is not JSON is **ignored rather than fatal**. The worker promises
stdout is only ever JSON, but it runs inside somebody else's Python process, and
a library that prints a deprecation notice on import must not be able to kill a
job that is otherwise going fine.

### Progress is counted, not sampled

The chunks run on a thread pool and finish out of order, so the highest
`segment_offset` seen is not how far along the job is — a percentage derived
from it jumps forwards and then back. The worker counts *completions* against a
total it works out the same way `demucs.apply` works out its offsets, and emits
one line per whole percent. A four-minute track is about forty lines.

### Per-stem progress exists for exactly one model, and that is honest

`htdemucs_ft` is a bag of four checkpoints whose weights are an identity matrix
— one fine-tuned model per source — so its bag index *is* a source name, and it
genuinely separates one source at a time. Every other model produces all its
sources in one pass and they finish in the same instant.

The worker checks the weights rather than special-casing the name, and reports
`perSource: null` where there is nothing per-source to say. The window then
draws the honest thing: four meters for the model that has four answers, and a
list that lights up as files are written for the models that have one. Four
identical meters would have been the overall bar drawn four times with four
different labels.

## The output contract

Everything here is a measurement from `demucs/README.md` rather than a taste.

**Stems must sum, and by default they don't.** Each stem is independently
rescaled to avoid clipping, which leaves four stems summing to within only
−13.8 dB of the original. The worker writes float32 with clipping protection
off, which takes that to the model's own error and nothing else — measured
end to end through this engine, the four written files sum to −34.5 dB against
the source on the reference clip. Anything that fades stems against each other
is wrong without this.

**A sidecar, always.** `stems.json` beside the audio records the model, the
checkpoint, the source's hash and format, the sample rate and depth, the device,
the wall clock, and the measured residual. Without it you cannot tell a bad stem
from a bad source six months later, and that distinction is most of the support
burden. It also carries an empty `steps` list, which is where post-processing
goes when there is any — the width fix in `demucs/width.py` halves the
side-channel artifact and narrows the voice, so it is a judgement call, and a
judgement call has to be recorded rather than defaulted.

**A cache key over the source's contents.** Separation is minutes of GPU and the
inputs are immutable, so an identical run is never worth doing twice. The key is
the file's sha256 plus the engine, the checkpoint and the pinned inference
settings — **the hash, not the path**, because the same song at two bitrates is
two different results and a path-keyed cache would conflate them. A reusable
result also has to still have all its audio on disk; a sidecar whose stems
somebody deleted in the Finder describes nothing.

## Where stems live

```
<library>/
  library.json                     the index; a track names its stems folder
  audio/track.wav                  the source, copied in on import
  stems/<track-id>/<model>/
    vocals.wav drums.wav bass.wav other.wav
    stems.json                     the sidecar
```

Inside the library, and relative like everything else in it, because a library
is a folder you can carry to the venue — [`library.md`](library.md). One folder
per model, so auditioning a second model does not destroy the first.

## Three rules the runner keeps

**One torch job at a time.** Two separations interleaved are both of them slower and
fight over one GPU; pitch transcription uses that same GPU too. `electron/work.ts`
owns one lease shared by both runners. The app already refuses a second instance;
this is the other half. [`transcribe.md`](transcribe.md) has the other client.

**Nothing partial lands in the library.** The worker writes into
`<model>.writing` beside the destination, and it is renamed into place only once
the sidecar is written. A cancelled or crashed job leaves the library exactly as
it was — rather than three stems out of four, which the next run would find and
believe. The scratch is a neighbour rather than a temp directory so the rename
is within one filesystem and therefore atomic, which is the same reasoning
`manifest.ts` uses for the index itself.

**Cancelling kills the named child.** `SIGTERM` first, which Python turns into an
exception that unwinds torch cleanly, then `SIGKILL` if it is still there four
seconds later, and `stopAll` on `before-quit`. An orphaned separation holds the
GPU and there is nothing left in the window that could stop it. A cancel names
its track and kind, because one arriving late — after the job it meant finished
and the next kind started — must not kill somebody else's work.

## What it costs, measured through this engine

Apple silicon, MPS, warm checkpoints. The separation phase only; `load` is
starting Python, importing torch and reading the checkpoints.

| model | load | rate | four-minute track |
|---|---:|---:|---:|
| `htdemucs` | ~4 s | 9× | ~30 s |
| `htdemucs_6s` | ~4 s | 8.5× | ~32 s |
| `htdemucs_ft` | ~5 s | 2.7× | ~1 min 35 s |

**These disagree with `demucs/README.md` and both are right.** Those figures are
cold-process on a twenty-second clip, so they fold four seconds of interpreter
startup into a rate — which makes `htdemucs_ft` look like 0.6× realtime and puts
seven minutes on a four-minute track. Held apart, the fixed cost is fixed and
the rate is a rate, and the estimate on the model page is one a person can plan
around. Checked at both lengths: a four-minute track ran at 10.06× against the
twenty-second clip's 9.35×.

The gap between `htdemucs` and `htdemucs_6s` in the published bench is
checkpoint loading, not inference. Warm, they cost the same.

A first run of any model also downloads it — a few hundred megabytes from
Hugging Face, with no progress of its own — which is why the worker says
`loading the model` before it starts rather than after.

## What is deliberately not offered

`shifts` and `overlap` are pinned in the registry and are not on screen.
Thirteen times the compute moved the measured result by 0.02 dB: they govern
chunk seams and memory, not how the model splits energy it finds ambiguous, and
that decision is in the weights. A settings UI around them would spend an
afternoon on a number that does not move.

## What is next

The registry entry already carries `engine` and `needs` for the reason
`demucs/README.md` gives: **MelBand RoFormer recovers a vocal at 12.1 dB SDR
against `htdemucs_ft`'s 8.2**, and nothing else measured moved a number that
far. It is a two-stem model, so four stems means running it beside Demucs and
folding the disagreement between the two vocal estimates into `other` —
`demucs/hybrid.py` is that, working. Adding it is a second engine in the worker
and a `needs: ['roformer']` the probe has to check, and it changes nothing in
`job.ts` or `separate.ts`.
