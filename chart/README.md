# chart/

What the band reads. A one-screen view of the song the set is playing — its name, its key,
its tempo with a button either side of it, where every playing loop has got to, and the bass
part as a piano roll, copied note for note out of the clip and coloured by scale degree —
served to everyone's phone, with no dependencies and nothing to install.

```
Live ─ SessionBridge :17800 ─WS─> chart server :18000 ─SSE─> phones
           (loopback)                    (the band's wifi)
```

## Where the reasoning lives

**Read the row you need, not the set.**

| doc | read it before touching | source |
|---|---|---|
| [following the bridge](docs/following.md) | the connection, **re-arming the watches**, the two streams and why a phone extrapolates, the tempo nudge, the LAN binding, and the `core/` import constraint any Node client hits | `server/bridge.ts`, `server/index.ts`, `server/loops.ts` |
| [reading the set](docs/reading.md) | which scene is "now", which song, where a fact is printed, the wheels, the bass roll, and what is deliberately not built | `server/chart.ts`, `server/loops.ts`, `server/bassline.ts`, `protocol.ts` |

## The one idea

**A chart states each fact once, as high up as it is true.**

A song in one key states it in the heading. A song that modulates cannot — so the heading
takes the key of the section actually playing, which is the useful answer on a stage. The
tempo works the same way: the big number is what Live is running at, and the song name's
claim appears only when the two disagree. Everything else here follows from wanting that to
be true without anybody typing it twice: the facts are read out of the scene names once, by
the bridge, and this reads them off `SetModel`.

## Running it

```sh
npm run dev                # everything, this included. Use :18000 — it proxies the page
                           # from Vite, HMR socket and all, so one address works in dev too
npm run dev:chart          # the server alone, :18000, under node --watch
npm run dev:chart-ui       # the page alone with HMR, :5573
npm run build:chart        # the page into chart/dist, which the server serves when
                           # BSV_CHART_UI is unset — which is how it ships
```

The server prints every address a phone can reach it on. Whoever is running Live reads one
out; everyone else types it once and adds it to their home screen.

| | | |
|---|---|---|
| server | 18000 | `BSV_CHART_PORT`, `BSV_CHART_HOST` |
| page (dev) | UI + 400 | `BSV_CHART_UI_PORT` |
| bridge it follows | `ws://127.0.0.1:17800/ws` | `BSV_BRIDGE_WS` |
| the page, in dev | `chart/dist` unless set | `BSV_CHART_UI` |

Working on it without Ableton is the same harness the visuals rig uses:

```sh
npm run dev:fake-live                                            # :17801
BSV_BRIDGE_WS=ws://127.0.0.1:17801/ws npm run dev:chart
```

## One verb, and no others

This server holds **one** connection to the bridge however many people are looking, and
what crosses to the wifi is a projection plus a single verb: `POST /tempo` with `{ by: 1 }`
or `{ by: -1 }`. Relative and one beat at a time, so a phone cannot state a tempo and
cannot move a set by more than a press. Everything else in the protocol stays on
loopback — nothing on the wifi can fire a clip, rename a scene, recolour anything or
reorder a set.

That is why the module is a separate process rather than a route on the device: the device
binds `127.0.0.1` deliberately, and putting a chart on the band's phones without also
putting every write in the protocol there means something narrow in between. Rule 5 in
[`AGENTS.md`](../AGENTS.md) anticipated it — *"a second kind of client — a stage display,
a CLI — should cost nothing and perturb nothing"* — and this is the stage display, now
with one button on it.

## Nothing here is inferred any more

The bass roll drew inferred chord symbols first — every playing MIDI clip merged, drums
judged out by the shape of their notes, the rest fitted to chord templates. It was the one
part of this client that could be wrong while nothing was broken, and on real material it
was: a melody note on a bar line renamed the chord under it, and quantising into windows
moved notes played off the grid on purpose.

The part was written down the whole time, so the roll copies it instead. Every fact on the
phone is now something the set states — the songs and keys in scene names, the notes in the
clip. The inference is still in [`core/src/chords.ts`](../core/docs/chords.md) with its
tests and no caller, for the day the keys player wants a chord chart of their own.

## What it is for next

The wheels and the roll are the beginning of the real goal rather than the end of it:
**anyone on stage should be able to see what is coming without having played the song
before.** What is still missing is the harmony for everybody who is not the bass player, and
when the long loop comes round — each wheel says where it is, and nothing yet says when they
line up, which is the question "when do I drop" actually asks. Both are argued in
[reading the set](docs/reading.md).
