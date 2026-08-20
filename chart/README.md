# chart/

What the band reads. A one-screen view of the song the set is playing — its name, its key,
its tempo, its sections, and where every playing loop has got to — served to everyone's
phone, with no dependencies and nothing to install.

```
Live ─ SessionBridge :17800 ─WS─> chart server :18000 ─SSE─> phones
           (loopback)                    (the band's wifi)
```

## Where the reasoning lives

**Read the row you need, not the set.**

| doc | read it before touching | source |
|---|---|---|
| [following the bridge](docs/following.md) | the connection, **re-arming the watches**, the two streams and why a phone extrapolates, the tempo nudge, the LAN binding, and the `core/` import constraint any Node client hits | `server/bridge.ts`, `server/index.ts`, `server/loops.ts` |
| [reading the set](docs/reading.md) | which scene is "now", which song, where a fact is printed, the wheels, and what is deliberately not built | `server/chart.ts`, `server/loops.ts`, `protocol.ts` |

## The one idea

**A chart states each fact once, as high up as it is true.**

A song in one key states it in the heading. A song that modulates cannot — so the heading
says nothing about key and every section states its own, which is what makes the section
that changes visible. bpm behaves identically, and so does the tempo: the big number is
what Live is running at, and the name's claim appears only when the two disagree.
Everything else here follows from wanting that to be true without anybody typing it twice:
the facts are read out of the scene names once, by the bridge, and this reads them off
`SetModel`.

## Running it

```sh
npm run dev                # everything, this included: server on :18000, page on :5573
npm run dev:chart          # the server alone: bridge client + host, :18000
npm run dev:chart-ui       # the page with HMR, :5573, proxying /events to the server
npm run build:chart        # the page into chart/dist, which the server serves
```

The server prints every address a phone can reach it on. Whoever is running Live reads one
out; everyone else types it once and adds it to their home screen.

| | | |
|---|---|---|
| server | 18000 | `BSV_CHART_PORT`, `BSV_CHART_HOST` |
| page (dev) | UI + 400 | `BSV_CHART_UI_PORT` |
| bridge it follows | `ws://127.0.0.1:17800/ws` | `BSV_BRIDGE_WS` |

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

## What it is for next

The sections and the wheels are the beginning of the real goal rather than the end of it:
**anyone on stage should be able to see what is coming without having played the song
before.** What it still does not show is chord progressions, which have nowhere in the set
to live yet, and when the *long* loop comes round — each wheel states its own position, and
nothing yet states when they line up, which is the question "when do I drop" actually asks.
Both are argued in [reading the set](docs/reading.md).
