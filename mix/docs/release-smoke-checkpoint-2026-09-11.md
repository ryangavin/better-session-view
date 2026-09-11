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

## Offline pitch/groove regression

The tempo owner supplied the concrete DeckVoice/diagnostics contract and requested
actual rendered evidence. Added `harness/tempo-render.html`/`.ts` and
`e2e/tempo-render.spec.ts`: five OfflineAudioContext renders of a 220Hz tone and known
syncopated percussion on a 100BPM grid. Cases are native unity, 120BPM with pitch
preserved, 120BPM vinyl behavior, and both 120BPM paths with a 1.2–4.8-second source
loop. No real-time AudioContext is permitted by the test; no device output is connected.

This test **found an actual scheduling defect**. Before the owner fix, pitch-preserving
nonloop playback rendered silence (RMS 0); the loop rendered partially, with a misleading
117.6Hz whole-window frequency. Native paths correctly rendered 220/264Hz. A read-only
worklet-message barrier did not change the failure. The tempo owner confirmed that
future `outputTime` values in DeckVoice.tick prematurely pruned Signalsmith's active
timeline, and corrected all three boundary/end/loop schedules to use current time as
the pruning point with a separate future output time. The regression passes against
that actual source fix; no mocked DSP or fallback was substituted. An earlier harness
readiness deadline was independently replaced with the real preparation promise.

| Render | Frequency Hz | Max reported-source error | Max groove interval error |
|---|---|---|---|
| Native unity | 220.0000 | <0.001ms | 0ms |
| Pitch preserved 1.2× | 220.3958 | 2.496ms | 1.354ms |
| Vinyl 1.2× | 264.0000 | 0.396ms | <0.001ms |
| Pitch preserved loop 1.2× | 220.3960 | 2.071ms | 1.250ms |
| Vinyl loop 1.2× | 264.0000 | 0.396ms | <0.001ms |

The fixed five-render case passed, then passed **three repetitions / fifteen renders**
with zero retries (4.8 seconds total, 05:54:51 UTC start). Frequency tolerance is 1Hz;
stretch source/groove error must be below 5ms, with observed worst error below 2.5ms.
Native source-peak error allows 1ms because resampling changes which 1700Hz carrier peak
is largest; native inter-onset error remains within two 48kHz samples. RMS and every
expected percussion event must be present, so silence cannot pass position assertions.
The fixture exercises interior groove and loop position; it does not prove every seam,
musical-grid inference, ongoing leader correction, toggle wiring or audible Cue continuity.

HEAD was `65e7251eb0a18382dd268f823588cf907eb02b4d` with the tempo owner's implementation
and fix still in the working tree. Its source commit is a required dependency of this
test. Numerical before/after reports remain local at
`report/mix-tempo-third-results.json`, `report/mix-tempo-fixed-results.json` and
`report/mix-tempo-repeat-results.json`; retain them with the eventual candidate identity.
Physical listening, MIDI and native setup remain separate acceptance evidence.

The complete browser suite then passed **7/7** in 14.7 seconds, including all six
unchanged library/Cue/latch cases. E2e/fixture typechecking and full repository
typechecking passed (exit 0), as did `git diff --check` at this checkpoint.

The owner's requested in-flight retime follow-up added two renders: 120→121BPM at
output second 2, then back to 120 at second 4, for native and stretch paths. It caught
a second real scheduling edge: a future-end schedule at exactly the new segment's
start time pruned that active start because Signalsmith removes segments at or after
the pruning timestamp. The source-position trace still advanced correctly while actual
output went silent. The owner changed boundary guards to queue strictly after the
previous boundary; the seven-render case then passed. Preserved-pitch retime measured
220.3955Hz, 2.306ms max source error and 1.214ms max interval error. Vinyl retime measured
265.1002Hz over the mixed-rate window (expected 265.1), 0.984ms source error and 0.485ms
interval error, with exactly one actual native source node reused. Source advancement
agreed with the piecewise integrated rate within 2.7e-15 seconds on both paths.
Before/after reports are `report/mix-tempo-retime-trace-results.json` and
`report/mix-tempo-retime-fixed-results.json`. Native retime's envelope-peak tolerances
account for a different carrier peak becoming largest as rate changes; the underlying
source-advancement assertion remains within two samples. The final regression also
rejects any settled tonal silence lasting 1ms or longer.

Final verification against the owner's committed source **998052b** passed the full
suite three times: **21/21 Playwright tests in 41.9 seconds**, including 21 actual
offline renders (seven scenarios per pass), with no retries, skips or flaky results.
The original six library/Cue/latch cases are unchanged and all passed. Full repository
and e2e typechecking passed, and the scoped diff is whitespace-clean. The final retained
report is `report/mix-tempo-final-results.json`; real-song, physical controller and
hardware listening remain unverified by this task.

## DSP suite separation

The rendered-audio regression now lives in `mix/dsp/tempo-render.test.ts`, run by
`npm run test:mix:dsp` under Vitest. Chromium remains the actual OfflineAudioContext
and AudioWorklet runtime, using the existing launcher dependency; there are no UI
gestures or Playwright test definitions in this suite. All seven render scenarios and
their assertions are retained. The manual diagnostic page shares the exported renderer.
The earlier 21/21 Playwright result above records the original suite organization.

After separation, the Vitest DSP test passed all seven renders in 1.49 seconds total;
the independent Playwright UI suite passed 6/6 in 13.9 seconds. Its test listing contains
only those six workflows. The UI run used isolated port 15774 because 15773 was occupied;
the occupied process was left untouched. Full repository, DSP and e2e typechecks passed.
New DSP evidence lives in `report/mix-dsp/results.json` and
`report/mix-dsp/tempo-render.json`; UI evidence remains in the Playwright report paths.
No production audio code, native app state, user library or dependencies changed.

## Next bounded run

After the coordinator freezes the candidate and provides a safe window: record its
source and native build identity; rerun the source gate; execute B1–B3 in the existing
preview with speakers untouched; then N2–N6/N12 in a temporary native library. Reserve
N7–N11 and H1–H4 for the named listening/hardware operator, and E1–E4 for a disposable
packaged account. Keep every transition result and report unavailable rows as blocked.
Cold packaging, key IPC, physical routing, Link and remaining controller evidence
prevent a release-ready claim from this checkpoint.
