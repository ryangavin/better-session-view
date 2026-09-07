# DJ control validation — 7 September 2026

Worktree `c028`, branch `codex/mix-dj-controls`, based on `c6d6020`. This milestone
preserves independent source positions and stem-section launching. Policy lives in
[Prep and Play](play-view.md); the [reference](dj-control-reference.md) records the
original audit and proposed direction rather than claiming every proposal is shipped.

## Automated checks

- Full repository `npm run typecheck`: passed.
- `npm test`: 89 files, 849 tests passed.
- `npx vite build --config mix/vite.config.ts`: passed; existing large-chunk warning.
- `git diff --check`: passed.

Engine regressions cover divergent source checkpoints, stopped-stem participation,
relative movement/clamping/rollback, pending audition takeover, Full mode preservation,
marker Q separate from launch timing, manual/quick loops, variable-tempo bounds, atomic
invalid edits, Slip versus ordinary exit, effect state retention and obsolete Cue release.
Momentary tests cover pointer cancellation, capture loss, window blur and keyboard takeover.

## Actual audio output

Open `http://localhost:5673/harness/dj-controls.html` with the worktree's `dev:mix-ui`
server and choose **Run captured engine audio checks**. Generated buffers drive the
actual MixerEngine graph. OfflineAudioContext renders native source, loop, FX and
four-channel Phones checks. A separate real-time AudioContext captures the engine's
Signalsmith worklet through `capture-worklet.js`. These are output measurements, not
mock-node assertions. Test signals do not go to speakers.

All 25 checks passed in the Codex in-app browser. Representative measured results:

| Check | Result |
|---|---|
| Cue saved and restored source time | exactly 0.4713333333 seconds |
| Paused / released output RMS | 1.90e-8 / 1.26e-8 |
| Audition / latched output RMS | 0.05593 / 0.06679 |
| Native pause maximum adjacent sample difference | 0.01390 |
| Audition onset after 1-second action | 1.030354 seconds, including scheduled lead |
| One-beat native loop repeated waveform error | 3.01e-17 relative |
| Longest below-threshold gap through loop/exit | one sample |
| Echo energy after input bypass | 0.05079 → 0.01665 → 0.00554 |
| New burst during bypass | 0.000310 residual, below 1% of first burst |
| Main RMS before/after Phones selection | 0.02262852 / 0.02262849 |
| Phones RMS at unity / half / deck fader down | 0.022729 / 0.011365 / 0.011365 |
| Slip versus ordinary exit, source amplitude ramp | 1.4411 output RMS ratio |
| Synced source pitch at twice tempo | 220 Hz from a 220 Hz source |
| Synced source/output advancement | 0.405333 / 0.202667 seconds |
| Synced pause captured RMS | 5.31e-9 |

The output checks caught startup leakage: default GainNode gain one smoothed toward zero
briefly fed nominally unused FX sends, leaving tails after pause. Initializing sends and
Phones gates at zero before connection fixes the measured failure. Native source stop
also now uses a short fade. The Slip measurement initially used a fractional sample-array
index; flooring measurement endpoints fixed that test helper, without changing playback.

Beat-jump captures measured forward/backward positions at 1.222/1.722 seconds, a
1.9418 amplitude-ramp RMS ratio, and at most one silent sample through the jumps.
Five engine regressions cover paused/mixed-state participation, Cue preservation,
atomic file-edge rejection, variable beat maps and loop/Slip exit policy.
The synced-pause check samples after 500ms to measure settled silence through the two
serial high-pass filters; it is not a pause-latency assertion. The former 350ms window
occasionally measured phase-dependent residual decay just above its 1e-6 threshold.

## Browser interaction

The worktree harness mounts actual PlayView and MixerEngine with generated sources,
without the Electron library/server. Verified by interaction at port 5673:

- Relative paused waveform drag moved drums to 1.6739319965 seconds; bass and vocals
  remained at zero and paused.
- Focused Cue stored that position. Space+Enter continued drums after key release;
  focused Cue returned to exactly 1.6739319965 and paused, leaving other stems stopped.
- Dragging held Cue outside its button and releasing left the source paused at Cue.
- Quick loop, half, double, Exit and Reloop accepted their commands. Exit disabled edit
  controls; Reloop restored active state and editing while remaining paused.
- FX group bypass enabled Clear tails without resetting parameter controls.
- Revised six-stem layout fits 1280×720, 1024×768 and 1366×768 without performance-page
  scrolling; measured client and scroll dimensions agree, with footer bottoms at 714/762px.
- Footer ↑ moved paused drums from 1 to 1.5 seconds and other participants from 0 to
  0.5; ↓ restored them. Focused Cue and Space+Enter takeover remained independent.
- FX click bypassed; right-click on the same footer button opened tail controls. Phones
  opened level/blend controls. Loop settings and Escape dismissal were inspected.
- Shared ButtonFace and Popup replace the separate DJ button/menu styling. Popup button
  widths were corrected after the final visual check exposed inherited loop-row sizing.

The app's global Space handler checks defaultPrevented and excludes buttons/sliders,
so it does not override the focused Cue keyboard interaction.

The development Electron window was reopened and visually inspected after the user
closed it during a stuck desktop interaction. No Electron process exit/load failure was
observed before that close; ownership of the drag overlay remains unconfirmed. Native
library dragging was not repeated. The browser six-stem fixture supplies the layout and
gesture checks, and the development app remains available for review.

## Remaining hands-on checks

Physical touch pointer cancellation/multitouch, a real Link peer, hardware outputs 3/4,
full Electron library loading and musical listening across arbitrary material were not
validated in this milestone. Unit cancellation tests do not replace device testing.
The sine/ramp captures establish timing, routing and bounded discontinuities for the
fixtures; they do not establish transparent sound for every loop boundary or stretch ratio.
Before release, audition divergent drums/vocals loops on real songs, short and long
boundaries, Cue hold/Play takeover on touch hardware, and Phones through the actual rig.

No release, main-branch push or publishing is part of this validation. Wiki changes are
prepared in the separate local wiki checkout for the release owner.

## Follow-up visual review

The reported 1110×964 application viewport (including the library sidebar) now fits
all five loop controls inside every deck. The settings trigger had inherited a width
based on its larger symbol font instead of its 32px grid cell; it now has explicit sizing.
All twelve Play/Cue/Sync faces measure 40×40px using the shared widget surface. Beat-jump
pairs remain stacked. The master crossfader uses the routing/transport subgrid and its
separator matches adjacent transport separators (901px at the reported viewport).
Application client/scroll widths both measure 852px there, without page scrolling.
The 1280×720 app and loaded six-stem harness at 1024×768 were visually inspected;
loop bounds and square faces passed DOM measurements. Compact mixer height includes
its two border pixels (528px), preventing a one-pixel footer overflow. The existing
horizontal strip fallback remains for full app windows narrower than the 852px mixer
plus sidebar. This visual follow-up changes no audio behavior; typecheck and the
production build were rerun, while the prior audio/unit evidence above remains applicable.
