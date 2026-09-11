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

## Cue acceptance follow-up

The coordinator subsequently relayed the user's physical confirmation that **Cue
audition begins immediately when nothing else is playing**. Only that idle immediate
Cue observation is user-verified; its exact input path and Sync setting were not
specified in the relay. It does not establish immediate Cue with a running second
deck, or either latch timing outcome.

The playbook now separates N8a (immediate Cue with idle/running reference, Sync off/on),
N8b (deliberately offbeat audition, Sync-on Play latch aligns to the running reference
and survives Cue release), and N8c (Sync-off latch preserves audition timing without
snap). Repeat each through UI and MIDI. The controls owner has the implementation
request. **Running-reference immediate Cue and synced/unsynced latch scenarios remained
NOT RUN/unverified at that follow-up**, before the browser slice below was added.
Earlier test totals above do not validate this requested behavior.

## First Playwright slice

The user subsequently requested browser-first exploration followed by retained
Playwright regressions, with only a small separate native smoke. No prior Playwright
runner/dependency existed. Added pinned `@playwright/test` 1.63.0, its matching Chromium
153.0.8010.12 and a test-owned Vite server on 127.0.0.1:15773. The generated fixture
mounts actual Library/PlayView/MixerEngine; no preload, native library, controller or
shared preview is used. Each case has a fresh isolated browser context, muted engine
monitoring, and guards against external HTTP/WebSocket and MIDI access.

`npm run test:mix:browser` passed **6/6** in 15.2 seconds. The bounded repeatability run,
`npm run test:mix:browser -- --repeat-each=3`, passed **18/18** in 40.7 seconds, with
zero retries/skips/flaky results (05:25:34 UTC start). It covers filter recovery/sorting,
column drag/width persistence across reload, target-only deck drag without auto-play or
Prep selection, pointer Cue release outside its button, keyboard latch/release, and
two-deck offbeat Sync-on/off latch source phase. Assertions inspect read-only real
engine state while commands come through production UI. Both latch cases check phase
while Cue is still held, before follower maintenance could conceal a broken latch.

| Source-phase evidence (beats) | Audition | After Play latch | After Cue release |
|---|---|---|---|
| Sync off, three runs | −0.499229 / −0.476009 / −0.487619 | Same as audition | Same as audition |
| Sync on, three runs | 0.280181 / 0.280181 / 0.285986 | 0 in each run | 0 within floating-point precision |

This is **browser engine-state/source-phase evidence**, not physical MIDI confirmation,
measured audio onset latency or musical listening. The immediate-idle-Cue user report
remains the only user-confirmed timing observation. Bluetooth headphones are a possible
latency confound raised by the user, not a proven diagnosis. Native launch/preload,
import/separation/packaging and physical routing remain outside this automated slice.
An isolated native-profile startup procedure is not yet established here; the playbook
reserves that small smoke for the coordinator instead of launching the user's app.

HEAD was `114b784ed6fd572105eecd030d6616520c2a15f6` with the controls owner's uncommitted
Cue engine patch present. The patch is a test dependency, not part of the smoke commit;
repeat against the eventual frozen candidate. The first trial exposed ambiguous test
selectors because strips and waveforms share a drop label; scoping to the strip fixed
the runner. No product failure was reproduced. The report output path was subsequently
made absolute to keep it at repository `report/` rather than under the config directory.
The retained repeat report is local `report/mix-playwright-repeat-results.json`; future
normal runs write `report/mix-playwright-results.json`. Preserve reports with candidate
identity before rerunning. Typechecking the e2e config/fixture passed.

After correcting report location, the complete six-case run passed again in 13.4
seconds; the final explicit post-release phase assertion passed both affected cases
in 7.9 seconds. Reports are retained locally as `report/mix-playwright-full-results.json`
and `report/mix-playwright-results.json`, respectively. A full-repository typecheck
initially caught an optional-position type error in the concurrent controls test; the
controls owner corrected it, and the full repository typecheck rerun passed (exit 0).
This was not a runtime failure.

## Next bounded run

After the coordinator freezes the candidate and provides a safe window: record its
source and native build identity; rerun the source gate; execute B1–B3 in the existing
preview with speakers untouched; then N2–N6/N12 in a temporary native library. Reserve
N7–N11 and H1–H4 for the named listening/hardware operator, and E1–E4 for a disposable
packaged account. Keep every transition result and report unavailable rows as blocked.
Cold packaging, key IPC, physical routing, Link and remaining controller evidence
prevent a release-ready claim from this checkpoint.
