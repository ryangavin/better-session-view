# Smoke checkpoint — 11 September 2026

Procedure: [release smoke](release-smoke.md). This checkpoint is not release approval.

## Actual checks in this task

Shared main checkout, Node v26.8.1. HEAD observed as
`e29843cbd40248ebcbae8fbacaa9df0bf28d3fb6` during the test run and
`1587b4c1ee8d6ebe7b2827056b16fcc0bc1a7120` at 05:13:51 UTC afterward.
Concurrent controls/key/waveform work was present. These results describe a moving
working tree, not a reproducible clean release artifact; rerun the affected gate once
the candidate settles. No packaged/native build was run or identified by this task.

| Check | Result | Evidence |
|---|---|---|
| `npm test -- --project=mix --reporter=default` | PASS: 96 files, 936 tests, 8.79 seconds, exit 0 | Local `/tmp/mix-release-smoke-tests.log`; run started 01:10:52 local time |
| `npm run typecheck` | PASS: full repository chain, exit 0 | Local `/tmp/mix-release-smoke-types.log` |
| `git diff --check` | PASS at checkpoint | Exit 0 |
| Existing preview inventory | No in-app tabs accessible in this task | CUA inventory; no new preview created |

The temporary logs are local run artifacts, not durable CI evidence. Browser B1–B4,
native N1–N12, cold E1–E4 and hardware H1–H4 were **NOT RUN by this task**. Their live
execution was blocked by the lack of a coordinated validation window and preview
access. No playback, native restart, resizing, controller connection or library edit
was performed. No source/UI defect was newly reproduced by this task.

## Evidence relayed by the coordinator

The origin coordinator reported a native trial at port 5673 with 24 library songs,
Some Chords loaded on deck A and Launchkey MK4 receiving input. After controller
subscriber isolation, the user physically retested and reported: “it's so smooth”
and “feels like my DJ controller”. This confirms **subjective live responsiveness**
for that trial. It is not measured FPS, a captured trace or all controller acceptance.
The previously reported live lag should not remain labeled unverified after this
positive retest. The owner reported a 300-row render benchmark falling from 18,000
row renders to zero; that is owner-supplied regression evidence, not a measurement
repeated here.

Physical pad color/order confirmation against the latest patch and the requested
FX A / Filter / FX B knob order remain pending at this checkpoint. The key owner is
integrating original-song libkeyfinder with backend generation 4; native rebuild and
import/edit/reanalysis evidence must identify that generation.

The intermittent native→Sync adjacent-sample failure is **historical documented
evidence** in [DJ validation](dj-controls-validation.md), not a regression reproduced
today. Retain it as unresolved acceptance risk until the candidate's repeated captures
and musical listening have evidence; do not infer either failure or resolution from
today's unit pass.

## Next bounded run

After the coordinator freezes the candidate and provides a safe window: record its
source and native build identity; rerun the source gate; execute B1–B3 in the existing
preview with speakers untouched; then N2–N6/N12 in a temporary native library. Reserve
N7–N11 and H1–H4 for the named listening/hardware operator, and E1–E4 for a disposable
packaged account. Keep every transition result and report unavailable rows as blocked.
Cold packaging, key IPC, physical routing, Link and remaining controller evidence
prevent a release-ready claim from this checkpoint.
