# mix[flow] release smoke playbook

Run this against one identified candidate. This is a procedure, not a release pass.
Behavior expectations come from [Play](play-view.md), [library UI](window.md),
[keys](keys.md), [controllers](controllers.md), [audio settings](audio-settings.md)
and [engine setup](demucs.md). Historical results in
[DJ validation](dj-controls-validation.md) are not results for a new candidate.

## Choose a safe run

The coordinating task owns the shared server, native app lifecycle and integrated
browser preview. Agree a window before audio, MIDI, reloads, library switching or
resizing; silence and an idle-looking screen are not permission. Other tasks must
not launch/restart the app/server or open a competing shared preview. Reuse the
coordinator's `http://localhost:5673` tab. If it is inaccessible, report UI checks
blocked and request coordinator evidence. Do source checks while waiting.

Three evidence levels must stay separate:

| Level | What it establishes | What it cannot establish |
|---|---|---|
| Source | Type/regression checks against recorded files | Running bundle, real device or sound |
| Browser | Renderer gestures; actual Web Audio sample captures | Packaged IPC, cold setup, native file dialogs or physical output |
| Electron + rig | Native build, filesystem persistence, listening, MIDI and Link | Other machines/devices/platforms |

## Discover manually, then retain the regression

Agents first explore a meaningful workflow in an agreed isolated browser/native window,
record its concrete trigger and expected result, then promote stable expectations into
Playwright. Prefer user-visible actions and real engine outcomes; avoid replaying a long
fragile click script or replacing the app with an emulator. A newly found defect gets a
small failing regression and an owning task. Keep physical controller, musical listening
and output-latency observations manual even when their underlying commands have tests.

### Browser-first automated slice

```sh
npm ci
npx playwright install chromium
npm run test:mix:browser
# A bounded repeatability run; every failure is retained, no automatic retries:
npm run test:mix:browser -- --repeat-each=3
npx tsc -p mix/e2e/tsconfig.json
```

Dependency installation belongs to an isolated setup window; `npm ci` runs this repo's
existing native preparation hooks. On an already prepared checkout, run only the last
three commands. Playwright is pinned in the root dev dependencies; Chromium is its
matching downloaded browser, not the user's browser profile. Downloads are development
setup, not runtime CDN dependencies of mix[flow].

`mix/e2e/playwright.config.ts` owns a separate Vite process at `127.0.0.1:15773`, uses
one worker and tears it down on completion. `MIX_SMOKE_PORT` can select another unused
test port. It refuses to reuse a process already on that port. This test-only lifecycle
is allowed; it never starts/stops the shared preview or native app. Each test gets fresh
browser storage. HTTP/WebSocket requests outside the test origin and MIDI access are
blocked; no preload/reach adapter or controller is installed by the fixture.

`/harness/smoke.html` mounts production Library, column hooks, PlayView,
useMixerViewModel and MixerEngine with the existing generated `dj-fixture.ts` assets.
The small host supplies in-memory rows/filter state; it does not emulate Electron or
assert native import/analysis persistence. Monitoring is disabled. A read-only probe
reports engine state/phase; tests issue commands only through actual UI input.

The first slice covers filter recovery/sorting, real column drag and saved widths/order
after reload, native browser drag into only the intended paused deck, Cue pointer capture
and outside release, keyboard latch, and Sync-on/off latch with a running reference.
The phase checks deliberately begin audition off beat, assert alignment/preservation
**while Cue remains held**, then verify release keeps playback advancing. Otherwise a
later follower-maintenance correction could hide a broken latch. These are source-phase
and state assertions; they do not measure speaker onset latency or waveform discontinuity.
Use B1–B3 for captured samples and the rig rows for listening/MIDI.

Read `report/mix-playwright-results.json` for all outcomes, source-state and phase
attachments; failure screenshots/traces live in `report/mix-playwright/`. Copy this
evidence with the candidate identity before another run replaces it. A harness/selector
failure is distinguished from a reproduced product defect. These checks supplement the
source gate, not the full-app native smoke.

### Small separate Electron smoke

After the browser gate, the coordinator launches the identified native candidate in a
disposable account/profile and verifies its first window renders, the essential preload
API connects (including current key backend generation), and its real folder/import
boundary works on a temporary fixture. Record app path/version and native error output.
This remains a small coordinated native check: no broad Electron automation or browser
IPC emulator. Run E1–E3 separately for packaging, first setup and actual separation;
browser fixture success proves none of these. This first Playwright slice does not yet
automate native launch/connectivity because isolated native-profile startup is not
established here.

Bluetooth headphones are a **possible latency confound**, not a diagnosed cause.
Record output device/connection and compare wired/local output in an agreed listening
window before attributing perceived Cue delay to either the app or Bluetooth. Engine
phase assertions and a user's immediate-idle-Cue report cannot establish end-to-end latency.

The main browser app can use the real Electron backend through the dev reach
adapter. Treat its import, detection, separation and metadata buttons as real writes.
Only the generated DJ/FX fixtures below are independent of the user's library.

Allow about 10 minutes for source checks, 10 for captured harnesses and 20–30 for
warm native smoke. Cold engine/model downloads and separation are separate, variable
duration tests. Hardware/listening needs a named operator and available rig.

## Record and prepare

1. Record date, operator, OS/architecture, commit, dirty paths, Node/Electron versions,
   server URL, app path/version/build time, native backend generation, output interface,
   channels/rate, MIDI model/ports, Link peers and fixture paths. A dirty checkout is
   provisional; save its diff with the evidence and rerun affected checks after it settles.
   Confirm backend generation **4** for the original-song key controls; an old process
   is blocked until the coordinator rebuilds/restarts it. A page reload cannot rebuild IPC.
2. Create a temporary fixture root (example: `mktemp -d /tmp/mix-smoke.XXXXXX`). Keep
   `inputs/`, `library/` and `evidence/` inside it. Record this exact root. Use copies of
   authorized audio, never the real library: a short steady original (A), a different
   tempo original (B), a short ending track (C), and silence/unmetered audio (D).
   Add a zero-byte `.wav` for a deterministic decode failure. For listening, A/B must
   be musical material; synthetic tones do not prove musical key or sound quality.
3. In the agreed native window choose the empty `library/` through the app's folder
   picker. Import A–D; use Prep's metadata editor to give A/B the same artist and
   different albums, C another artist, D no artist/album. Save the exact table as the
   filter oracle. Do not manually fabricate manifests or overwrite detector evidence.
   Separate A using the default four-stem model for the warm fixture; keep B stemless.
4. For genuinely cold setup use a disposable macOS account/test machine with no
   mix runtime/model cache and no Homebrew/toolchain dependencies. A temporary library
   alone does **not** isolate Application Support, localStorage or model caches.
   Do not clear the user's runtime or change HOME to simulate first launch.
5. Record current library, UI settings and routing before any shared-profile trial.
   Avoid changing the user's controller connection; an unplug or Disconnect also
   changes persistent behavior. A separate profile/account is preferable.

## Source gate (no server or playback)

From the repository root, preserve output and exit status for each command:

```sh
git rev-parse HEAD
git status --short
node --version
npm test -- --project=mix --reporter=default
npm run typecheck
git diff --check
```

Use `--reporter=default` to avoid competing writes to the shared HTML test report.
For release, the coordinator also runs the full repository `npm test` and
`npm run build:mix`, then `npm run pack:mix` for the actual artifact. Build preparation
can download/compile native tools; coordinate it with the owners. `npm run build`
alone builds the Ableton device, not mix. Never use the broad destructive `npm run qa`
as a shortcut for this smoke run.

Useful focused reruns are the existing `mix/src/play/engine.test.ts`,
`renderIsolation.test.ts`, `decks.test.ts`, `mix/src/controllers/launchkey.test.ts`,
`continuous.test.ts`, `mix/src/components/Library*.test.ts`, `mix/src/listing.test.ts`,
`mix/src/useLibraryColumnWidths.test.ts`, and `mix/electron/{runtime,job,manifest,keyDetection}.test.ts`.
Pass explicit existing paths to Vitest; a matching unit test never substitutes for the
native/hardware row below. File names without prefixes here are in the preceding directory.

## Captured browser checks (coordinator's preview)

Capture the URL, source revision, result text and screenshot for each run. Navigate
only after the preview is handed over; returning to the app can recreate its renderer.

| ID | Actions | Pass evidence |
|---|---|---|
| B1 | Open `/harness/dj-controls.html`. Leave **Toggle speakers** untouched. Run **Run captured engine audio checks**. | Every reported check passes; retain all metrics, not just the last green line. Generated captures do not go to speakers. This proves this fixture's graph output only. |
| B2 | Run **Run transition checks** five times, retaining each run. | Every run stays within its reported step/gap thresholds. Historical native→Sync intermittently exceeded a 0.03 adjacent-sample step. Any recurrence fails; five passes are a bounded regression sample, not proof of inaudibility. Never retry until green and discard failures. |
| B3 | Run **Run stereo meter checks**; open `/harness/fx-highpass/` and wait for its automatic offline render to finish. | Stereo relationship and every FX HP check pass. Retain dry-identity, filter, bypass and tail results. This does not prove physical headphone channel assignment. |
| B4 | Back at DJ controls, **Load six-stem fixture**. Keep monitoring muted; inspect controls, then use Play/Cue/loops only in this fixture. | No clipped essential controls at current viewport; independently controlled guitar/piano fit. Capture compact layout at an agreed size, never resize the user's active preview without coordination. |

## Native warm smoke

Each row has its own result. Use UI labels and fresh accessibility/screenshot state;
do not assume old element coordinates. Take before/after evidence for a persisted
change. Unless a row explicitly starts sound, decks must remain paused.

| ID / precondition | Actions | Expected visible, audible or persisted outcome |
|---|---|---|
| N1 / empty fixture library | Launch candidate in the coordinated window; cancel an Import picker, then import A–D. | Starts in Play; usable empty guidance. Cancel adds nothing. Imported copies appear once, originals unchanged; original-only tracks can load without separation. Errors are readable, with retry/change-folder paths. |
| N2 / B without analysis | Drag B onto deck A's strip, then C onto deck B's waveform. | Correct targets load; Prep selection is unchanged. Finding-the-beat/decode status resolves or gives a useful error. **No automatic playback**. Saved original waveform appears in the already-mounted library row without reload. Sync needs a valid grid; silence must not acquire a fabricated confident grid. |
| N3 / metadata oracle | Search part of A's title; clear only text with Escape/×. Select Artist, Album, Key in turn; select Unknown; try no-result text; Reset filters. | Exact matching rows agree with recorded metadata. Artist changes clear Album/Key; choices remain usable at zero results. Reset clears all four filters. Browsing starts no analysis or audio. |
| N4 / at least three rows | Sort Song twice, then Artist, then Recent twice. Drag Key before Song; resize Song and Key; use width-handle arrows/Home. Resize library separator. | Direction/order visible and correct; unknown metadata stays last. Width changes affect one column; Analysis/Stems stay fixed. No accidental sort during resizing, row misalignment or blocked Import. Record sizes/order for N12. |
| N5 / copied track only | Open key editor; choose a different major/minor key and Save. Run **Detect from original**, then canonical **Update library keys**. Re-separate that copied track. Reopen editor; finally **Use detected**. | Default evidence names original-song libkeyfinder, not bass-only analysis. Manual key survives every operation and is used by filters; Use detected removes only the override. Unknown is allowed. Opening editor neither loads nor auditions. Preserve before/after manifest and detector identity; no claim that every estimated key is musically correct. |
| N6 / A separated, B stemless | Drag into each of A–D; replace a paused deck quickly with a second track. | Four correct headers/waveforms, paused. Latest drop wins; no late result replaces it. A has Full/stems; B cannot switch into unavailable stems. Missing/corrupt copied file yields deck-local error and another drop retries. |
| N7 / coordinated listening, four loaded decks | Play/pause each deck; verify a paused position resumes. Run short C to natural end, first with another deck playing, then as the last participating source, Link off. Repeat at zero gain. | Independent decks; no unrelated source starts/stops. Last source stops standalone clock (natural end on engine tick), retains position/settings; another playing source keeps it alive. Zero gain still counts. Replay after end starts at first mapped beat/file start. |
| N8 / paused away from Cue | Tap Cue to store; hold at Cue and release; hold then Play and release; repeat keyboard Space hold + Enter latch. Test pointer release outside button and blur in fixture window. | Tap stores checkpoint; hold auditions; release returns and pauses. Play latches and later release does not stop. Playing Cue returns/pauses. Focused Cue affects one source; deck Cue retains source participation/positions. No stuck audition after cancel/blur. |
| N8a / two loaded gridded decks, known Cue on B | With all decks idle, hold B Cue with Sync off, then on; release between trials. Play A as reference and repeat both trials, pressing B Cue deliberately between reference beats. | Cue audition begins immediately in all four cases, without waiting for a beat/bar or snapping its onset to A. Sync does not delay Cue. Release without Play returns B to its Cue and pauses it; A continues unchanged. Record onset against the press/reference, separately from latch alignment below. |
| N8b / A running, B Sync on at saved Cue | Deliberately press and hold B Cue slightly off A's beat. While still holding, press B Play, then release Cue. Repeat through the keyboard Cue hold/Enter path. | Audition starts immediately off beat; **Play latch beat-aligns B to the running reference**. B continues aligned and playing after Cue release, with no return to Cue or stop. Observe/listen before Play, after Play and after release so a delayed audition cannot masquerade as correct latch alignment. |
| N8c / same setup, B Sync off | Repeat the deliberate offbeat Cue hold → B Play → Cue release through pointer and keyboard. | Audition starts immediately. Latch preserves its audition timing **without a beat snap**; releasing Cue leaves it playing from that timing. A remains unchanged. Record the contrast with N8b using the same fixture. |
| N9 / grid saved, Sync off first | Quick loop; halve/double; move; Exit/Reloop; capture In/Out. Beat jump forward/back paused and playing; try backward at file start. Enable Sync on follower, play leader, edit tempo then **1× / Normal speed**. | Loops show valid bounds and repeat; Exit continues, Reloop retains paused/playing state. Jumps preserve Cue, exit addressed loops; invalid boundary rejects the whole move visibly. Follower tracks leader; load alone never changes tempo. 1× restores leader's loaded grid BPM, unavailable under Link/no leader. Listen for clicks/gaps through Sync, scrubs and loop boundaries. |
| N10 / A playing in approved audio window | Switch Full/stems, stop one stem and switch away/back; move stem gain, deck fader, trim, EQ/filter; test crossfader A/B/Thru. Add FX, sweep HP, bypass then clear tails. | Mode handoff does not jump position or start paused audio; stopped stem choices survive. Zero gain silences the selected path; neutral settings restore it. Dry signal unaffected by FX HP; HP Off bypasses, existing tails decay on bypass, clear discards tails. No zipper/dropout or lagging final values. |
| N11 / representative library, active fixture audio | Move fader continuously for 10 seconds, release at known value; scroll/filter library, resize a column; repeat with controller debug open/closed if available. | Value follows gesture and ends exactly; no accumulating delayed changes. Meter/waveform frames remain responsive and no audible stalls. Record machine, row count, viewport, trace/frame stalls and input-age counters where available. Unit render isolation and visual smoothness are separate evidence. |
| N12 / record settings first | Coordinator reloads renderer then quits/relaunches candidate. Reopen library/key editor/settings. | Library, manual keys and saved analysis survive on disk; column sort/order/width, panel width, audio preferences and FX HP survive in their documented stores. Prep remembered state survives. Play deck assignments/Cue/mix settings are window-session state: do not require deck restoration across reload. Nothing resumes automatically. Recheck N2/N5 after a native rebuild. |

## Pending stable-tempo acceptance

These are release requirements for the forthcoming grid/Sync design, **not verified
behavior or a specification of an unchosen algorithm**. The **Stable musical tempo
and beat grids** task owns the design and the grid/voice-rate contracts. Implementation
is authorized and in progress; automated acceptance still awaits the stable contract. Coordinate
with that owner before promoting these cases into deterministic Playwright tests.
Keep the existing immediate-Cue and Sync-on/off Play-latch tests unchanged as regressions.

| ID / setup | Actions | Required acceptance evidence |
|---|---|---|
| T1 / one to four loaded decks, no explicit speed change or Link | Play only one deck; repeat with that sole playing track in each deck position and with other decks loaded/paused. Load or replace another paused deck. | The sole playing track is leader regardless of slot or load order. Its musical BPM remains stable; other loaded tracks do not alter its authority or rate. Check UI leadership/tempo **and actual voice/clock state**. |
| T2 / leader at normal speed, recording with steady pulse but displaced/noisy transients | Play across transient irregularities, including with Sync armed on the sole playing deck; use **1× / Normal speed** after an explicit speed edit. | At normal speed the leader follows the original recording naturally, without local stretching to chase transient markers. Verify unity source advancement/rate and the actual native/stretch path or equivalent rate contract, not just a 1× label. Musical BPM/grid evidence is stable despite transient noise. |
| T3 / running leader and follower with a different musical BPM | Engage follower Sync; play through several correction spans and transient irregularities, then perform a supported seek/loop transition. | Follower follows the leader's stable musical BPM. Corrections are smooth over the design's longer musical span; there is no transient-by-transient rate jitter. Record timestamped actual voice-rate/source-advancement and phase traces plus grid targets across the span. Listening remains separate. |
| T4 / same decks, explicit speed command | Change playback tempo, observe both decks, then return to normal speed. | The explicit speed request has its intended audible/engine effect; stable-tempo handling does not ignore or immediately undo it. UI, effective voice rates and grid/clock targets agree. Normal speed restores the leader's natural original-speed behavior. |
| T5 / Link authority available | Enable Link, change peer tempo, exercise local follower Sync and observe the authority transition back to standalone. | Link tempo/phase remains meaningful; local natural-speed policy must not silently override external authority. Check native peer behavior and effective voice/grid state alongside UI. Keep H2's independent-clock and no-unintended-peer-Stop checks. |
| T6 / tonal and percussion fixture, fresh default settings | Confirm **Preserve pitch** defaults on; change speed with it on, then off. Exercise a loop and Cue/Play latch on both paths. | On retains source pitch while speed changes; off couples pitch to the tempo ratio like vinyl. This is independent of key sync. Measure rendered tonal frequency and source advancement, not the toggle label alone. Reported/integrated position must agree with rendered output on both paths, including through loop/Cue transitions. |

Before automation, obtain from the tempo owner: deterministic original-audio/beat-grid
fixtures (including transient displacement), the stable musical BPM contract, what
normal speed means at the voice path, correction-span/rate/phase bounds, and a read-only
measurement surface. Freeze those agreed tolerances in the test with its fixture; do
not invent a threshold or pass because a rounded BPM label stopped moving. Preserve
each trace and command time so a smooth average cannot hide rapid rate oscillations.
If the required measurement surface or contract is unavailable, mark T1–T5 **BLOCKED**
for automation and leave their manual/physical observations separately identified.

The owner's proposed fixture combines a known tone with a steady percussion grid and
deliberately syncopated/displaced hits. It should expose a stable follower base ratio,
inter-onset groove timing after uniform scaling, and residual phase/rate smoothness
against the raw-grid baseline. Preserve-pitch frequency and rendered-position checks
extend that evidence to both playback paths. These fixture details are proposals until
the owner supplies actual tested data, numeric bounds and probes; do not automate an
assumed correction design. T6 is likewise **BLOCKED** for automation until that evidence
contract is available. Rendered frequency/position checks do not replace real listening.

## Cold setup, failures and physical rig

These are required for the claimed capabilities; unavailable is **blocked**, not pass.

| ID / precondition | Actions | Expected outcome and evidence |
|---|---|---|
| E1 / fresh Apple-silicon test account, packaged app | Record artifact hash/signing result and inventory its resources. Launch without developer tools; import supported originals; start first Generate. | Bundled uv, ffmpeg/ffprobe, yt-dlp, audio query/Link helpers and keyfinder exist with required source/license material. Key detection works without the research environment. Setup explains download/install stages; local runtime stamp appears only after success. Confirm actual bundle identity; source build success is insufficient. |
| E2 / isolated cold account | Cancel during setup; retry. In a separate trial deny network to this disposable environment before cold setup/model fetch, then restore and retry. | Cancellation stops this job; no false ready stamp/completed stems. Offline failure is useful/retryable; no request to install Python/Homebrew manually. Do not disconnect the user's shared machine/network to create failure. |
| E3 / copied A, approved slow-job window | Generate default four-stem model; observe progress to completion. Start a fresh job on copied B, Cancel, then retry. Use zero-byte `.wav` to exercise failure. | Progress resolves to success/error/canceled rather than hanging. Successful float32 stems and `stems.json` are referenced by `library.json`; canceled/failed job does not replace a prior good manifest result. Existing manual metadata remains. Retain job text and before/after manifest. |
| E4 / warm packaged account, network unavailable | Relaunch and play/import local fixture, detect key and use already-cached separation model. | Local workflows need no CDN, developer installation or new engine download. An uncached model may need network: record separately. If URL import is in release scope, separately import an authorized URL online and verify a readable failed-URL path. |
| H1 / actual multi-output rig and listener | Set distinct Master/Phones pairs; cue deck pre-fader, lower deck fader, vary Cue/Master blend and Phones level. Apply an audio rate/device change only in the agreed window. | Listener confirms physical pair isolation and no cue leak into room; meters alone cannot pass. Restart pauses both engines, preserves loaded data/settings, never resumes or stops peers. Unsupported saved rate/device blocks Apply without damaging current audio; stereo-only cue is unavailable rather than folded into master. Record actual channel count (Aggregate Device may be needed). |
| H2 / real Link peer | Enable Link; start/stop last local deck, verify peer clock; edit remote tempo, disconnect Link. | Link clock continues independently when local sources finish/pause. No unintended peer Stop. Tempo follows Link; disconnect retains last tempo. Mark Link Audio sharing separately if advertised: receiver must hear the named feed. Browser UI alone cannot pass. |
| H3 / Launchkey MK4 DAW pair, no other DAW owns it | Find/connect input DAW Out and output DAW In. Check live packet input and outgoing feedback; move faders/knobs; exercise all mapped pads from the controller doc. | Status distinguishes port-open from received input. Faders A–D and focus/EQ/send controls reach correct targets with final values preserved. Physical top pads 3–6 are A–D Play/Pause green; bottom 5–8 A–D Cue orange. Pads 1–2 jump; 7–8 Sync/focused Play; bottom 1–4 loop controls. Observe hardware color/order, not only packet numbers. |
| H4 / same controller, safe playback | Hold Cue then dedicated Play, release; unplug/replug; switch Prep/Play; close debug. Intentionally Disconnect, replug, relaunch; explicitly reconnect to restore. | Hold/Play latches; unplug releases unlatched held Cue. Auto reconnect restores same pair/feedback without starting audio. Debug close does not disconnect. Intentional Disconnect persists opt-out. No-match, denied permission, unsupported/ambiguous device states stay useful and never select a random port. Do not broaden advertised hardware beyond the tested model. |

Run **N8a–N8c again using the controller's mapped deck Cue and Play pads** and record
MIDI results separately from UI pointer/keyboard results. Hold the Cue pad through the
Play press, then release it. Input logs establish which deck received each edge;
listening/source timing establishes immediate audition, synced latch alignment or
unsynced timing preservation. A UI pass cannot pass MIDI, and an idle Cue pass cannot
pass the running-reference or latch cases. These are shared Cue/Play release acceptance
requirements; an implementation request or passing prior latch test does not verify them.

Knobs 1–3 must read and control **FX A, Filter, FX B** in that physical order,
matching the mixer. Verify both displayed labels and actual parameter targets.

## Cleanup and decision

Stop only test playback/jobs; release held Cue, disconnect test Link/MIDI as agreed,
and have the coordinator restore the original library, routing, UI preferences and
preview. Confirm no test job remains active. Retain the fixture/evidence root for
reproduction; remove only that explicitly disposable root later. Never delete original
audio, real metadata, Application Support or a user's chosen library as cleanup.

For each ID record **PASS** (all stated observations captured), **FAIL** (observed
mismatch), **BLOCKED** (missing build/window/device/fixture), or **NOT RUN**. Include
expected/actual, screenshot/result/log paths, first failing action, reproduction rate,
source/build identity and owner. A manual check becomes PASS only after the operator
reports the observed result. A proposal/test assertion is not execution evidence.

Release blockers include failed source/build checks; untested cold packaged setup;
data loss/manual-key overwrite; unexpected playback/stuck Cue; wrong physical routing;
repeatable or unresolved intermittent audible artifacts; missing/old key backend;
unresponsive controls; and missing evidence for advertised Link/controller capabilities.
Route defects through the coordinator to their feature owner. A missing optional rig
can narrow a release claim only by an explicit release-owner decision, never by silently
changing BLOCKED to PASS. Publish a bounded readiness statement naming what was actually
tested; this checklist does not itself authorize a release.

Copy this record into the run's evidence directory:

```text
Candidate commit / dirty diff / artifact hash / backend generation:
OS / CPU / Node / Electron / app path / build time / URL:
Fixture root / metadata oracle / original hashes:
Output device / pairs / rate / MIDI ports / Link peers / operator:
Authorized validation window and restored state:
ID | level | PASS/FAIL/BLOCKED/NOT RUN | expected/actual | evidence | owner
Commands and exit codes:
Failures (retain every transition run):
Release claims blocked or excluded by owner:
```
