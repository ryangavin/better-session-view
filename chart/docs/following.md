# Following the bridge

How the chart gets what it shows, and why running it changes nothing about the set.

```
Live ─ SessionBridge :17800 ─WS─> chart server :18000 ─SSE─> phones
           (loopback)                    (the band's wifi)
```

## One connection, however many people are looking

Everyone in the band opening the chart is **one** client of the bridge, not six. The
server holds the single WebSocket; the phones get an SSE stream of a projection. That
matters for two reasons beyond tidiness: the device's Status line counts connected
clients and would otherwise read whatever the room size is, and every phone joining would
otherwise be one more socket for the bridge to broadcast every `playState` frame to.

It obeys rule 5 exactly — `snapshot` without `fresh`, so the device answers from what it
already holds and Live is not touched. It never sends `observe` or `watchSelection`; those
are the device's own and a client cannot subscribe to them. Two viewport watches go out
and no more: `watchPlay`, which is the whole question this asks, and `watchTransport` for
the tempo. Starting the chart, stopping it, or losing it mid-set leaves the bridge's
knowledge of the set exactly as it was.

**A delta is answered by asking for the set again**, not by patching a copy. The bridge
already maintains the held set and rebuilds the model from it; keeping a second copy here
would be a second answer to a question that has one. `snapshot` with no `fresh` costs the
device a message and a payload.

## Reconnecting forever, in both directions

The chart may well be running before the machine with Live on it, and somebody will close
the set between songs. So `followBridge` retries every second with no limit and no error
to surface — it is either connected or it is trying, and the phone is told which.

`askAgain` covers the case that looks like success and is not: **a connected bridge is not
a bridge that can answer.** The device refuses every request with `device not ready` until
`init()` has run in `lom.ts`, so one whose device is still coming up is reachable and
unhelpful. It asks once a second until `rev` says a set landed.

The phone half needs none of that, because `EventSource` reconnects on its own. That is
most of why the stream is SSE.

## Server-Sent Events, and no dependencies at all

**A phone reading the chart has nothing to say.** It cannot fire a clip, rename a scene or
move anything, so a duplex socket would be a back channel that exists only to be misused
later. SSE is one-way by construction: there is no request type in
[`../protocol.ts`](../protocol.ts) to add one to.

That choice is also why this module installs nothing. Node has had a `WebSocket` **client**
since 22, so the connection to the bridge needs no package; the other two halves of this
project carry `ws` because they also need a *server* — the device to serve browsers,
visuals to serve the renderer. Serving phones over SSE is `node:http`, which is already
there. `chart/` has no `package.json`, no `node_modules`, and runs from a fresh clone.

## The stream is quiet

Frames are coalesced at 250ms and sent only when the JSON differs from the last one. Firing
a scene moves every track's play state, and the bridge reports that as one message per
observer; a quarter of a second is below noticing and turns the burst into one push. A
tempo readback landing on the same chart sends nothing at all.

A phone left on a music stand for an hour therefore receives one comment heartbeat every
fifteen seconds and whatever the band actually did. The heartbeat is not decoration: a
venue's captive network may put a proxy between the phone and the laptop, and a buffered
or idle-closed event stream looks exactly like a chart that has frozen.

## Why `core/` is imported for one constant and nothing else

`chart/server/chart.ts` reads a scene's role and key off `SetModel.factsByScene` rather
than parsing a name, and that is a design rule — see [reading the set](reading.md). There
is a mechanical reason it could not do otherwise even if it wanted to.

**`core/` spells its internal imports the TypeScript way** — `import { … } from
'./derive.js'`, a specifier naming a file that does not exist until something compiles it.
Bundlers all resolve that to `derive.ts`; **Node's type stripping does not**, and running
`node chart/server/index.ts` fails on the first such hop. So a Node process can import a
`core/` file only when that file imports nothing itself, which is true of `livePalette.ts`
and of very little else.

This is why `visuals/server/show.ts` carries a private `roleOf` regex rather than calling
`roles.ts`. It is a real constraint on any Node-side client of this project, and the answer
taken here was to put the per-scene facts on the wire instead of finding a way to re-read
the names — the mapping being read exactly once is the better property anyway, and it is
the one `SetModel` exists for.

## Binding the LAN

`0.0.0.0` here, where the device binds `127.0.0.1`. The device's client is a browser on the
same machine; this one's clients are other people's phones, so loopback would defeat the
point.

It remains a deliberate exposure. There is no authentication and it answers anyone who can
reach the port, so it belongs on rehearsal or show wifi and not on a hotel network. What is
exposed is a song title and a list of sections — **nothing reachable from the LAN can
change the set**, because the write half of the protocol never leaves loopback.
`BSV_CHART_HOST=127.0.0.1` takes it back for anyone who wants that.
