# Play behavior specification

This is the intended product behavior, not a description generated from today's code.
The user-approved policy below is normative for this preview. Implementation evidence
belongs in [validation](dj-controls-validation.md); mechanics belong in
[Prep and Play](play-view.md). A failing implementation must not rewrite the expectation.
The [reference audit](dj-control-reference.md) records source manuals and proposals;
a proposal there is not automatically approved behavior.

## Sources and decisions

The [Rekordbox manual, p168](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=168)
describes matching a sync master's tempo and beat positions, and transferring master
when its track is replaced/unloaded. Its [two-player instructions, p121](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=121)
identify the first player to start as the initial master. Its full-waveform display is
described on p130. These establish reference behavior, not measurements of our engine.

Our approved choices add automatic leadership handoff on pause/end, a four-beat launch
boundary for synced loops/sections, and independently positioned stems. These are
explicit product decisions; the manuals do not establish a single universal policy.
A bar here means four saved-grid beats. Other meters need a separate decision.

## Distill capabilities before interfaces

Behavior means something the musician can accomplish. Rekordbox is the initial primary
reference for capabilities and musical expectations, not a layout or control taxonomy
to reproduce. Source UI groupings must not become our domain boundaries by accident.

Each distilled record separates:

- **Concepts:** the musical objects and relationships, such as source position, beat
  phase, loop region, timing leader and headphone mix.
- **Capability:** the outcome a musician needs, stated without a control name:
  preview privately, repeat a region, align playing material, reposition without stopping,
  inspect the complete source, or transfer timing responsibility.
- **Constraints:** what must stay true, such as the audience mix remaining unchanged,
  the leader retaining its tempo, or independent stem offsets surviving a group move.
- **Examples:** initial state → semantic action → observable outcome, including failure
  and cancellation. These can become Gherkin later without referring to CSS or buttons.
- **Evidence/provenance:** exact manual edition/pages, whether a rule is explicit or
  inferred, and our approved differences. One manual can contribute several capabilities;
  several UI surfaces can implement the same capability.
- **Delivery mapping:** our controls, commands, engine tests and browser steps that
  currently provide the capability. This mapping can change without rewriting its intent.

For example, “preview selected material privately while the audience mix stays unchanged”
is a capability; pressing Phones is a delivery mapping. “Repeat a musical region while
remaining aligned to the timing leader” is another; In/Out and quick loop are alternative
ways to accomplish it. Keep source-specific gestures in the evidence/delivery layer.

Refinement repeatedly extracts these records from a bounded manual topic, checks for
already-known concepts/capabilities, records conflicts or missing outcomes, and adds
acceptance examples. Do not infer a universal convention from one product's grouping.
The quick start chooses a useful path through capabilities; the reference manual explains
our current delivery mapping. Neither is the authoritative source of musical intent.

## Two independent acceptance checks

**Capability coverage:** can a musician accomplish the intended task through this app?
Map each capability to a short user journey: entry point, meaningful actions, visible
feedback, completion and escape/recovery. Check that controls are reachable, states are
understandable, and the journey completes without hidden prerequisites. An engine command
with no usable UI route is not a delivered capability. A browser check proves a journey
exists; usability review checks whether a musician can discover and understand it.

**Correctness:** does that journey produce the specified outcome and preserve its
constraints? Run the semantic scenario against deterministic engine tests, then the actual
UI route, and measure emitted audio where timing or routing is the claim. A lit button or
successful command dispatch is not evidence that the sound changed correctly.

One end-to-end scenario may verify both checks; this distinction does not mandate
separate suites. A UI support declaration is a claim to verify, not self-certification.
Layered checks isolate failures, and complete journeys verify the wiring.

The same capability/scenario identifier should link the source rule, intended outcome,
our UI journey, engine assertions, browser evidence and audio measurements. Keep coverage
and correctness separately marked: missing, implemented but unverified, verified, or failing.
Changing an interface updates its journey mapping; it does not change the capability.

Example: private preview → choose the source for headphone monitoring and adjust its
level → hear it in headphones while the audience mix stays unchanged. Coverage checks
that complete journey is available. Correctness compares the main and Phones signals,
including after channel fader changes. A new interface can satisfy the same example.

## Acceptance scenarios

| Rule | Given → when → expected result | Regression evidence |
|---|---|---|
| Local tempo ownership | No Link/leader → load tracks → no active global tempo. Start a gridded deck → it leads at its own mapped tempo. | engine: first-track tempo; header: leader tempo |
| Followers do not retime the leader | A plays → load B with another tempo, enable B Sync/start B → A's speed/position are unchanged; B matches tempo and beat phase. | engine: follower isolation and phase recovery |
| Leadership handoff | B started first; A also plays → pause/stop/end B → A leads. A synced follower retains its current tempo. | engine: election/handoff; real engine handoff capture |
| Sync stays engaged | Synced B follows A → scrub B and release → B remains playing and Sync stays on; fractional beat error is corrected. | engine: scrub recovery; real worklet run |
| Synced loop entry | Deck plays with Sync → request loop → audio continues until next leader bar; then whole-beat region repeats without shifting beat phase. | engine: queued loop; real worklet loop alignment |
| Audible positioning | Focus plays, other stems differ → drag focus → focus continues audibly at moved position; others are unchanged. Group move applies a common beat displacement. | engine: playing scrub; widget pointer regression; captured gap bound |
| Cancellation | Drag playing/paused source → cancel → restore gesture-start position/loop and original playing/paused state. Cue checkpoint stays untouched. | engine: cancellation; existing Cue regressions |
| Whole waveform | Loaded source of any length → Fit → show sample zero through source end in a fixed view, with moving playhead. Zoom returns to scrolling. | engine: whole-source extent; widget Fit; browser inspection |
| Continuous audio transitions | Sound plays → enable/disable Sync, jump, scrub or change a loop → old audio continues until its replacement is ready, with bounded crossfade/discontinuity rather than an unintended silent gap. Preparation failure preserves existing playback. | captured transition checks; voice scheduling regressions |
| Layout | Compact performance view → expose loop controls, square transport and Fit → required controls remain reachable inside their groups. | browser bounds and screenshots |

## Repeatable refinement

1. Choose an interaction family, then read only the matching manual pages. Record the
   edition/page and distinguish explicit source rules from inference and our decisions.
2. Write examples before changing behavior: initial state, command sequence, timing,
   affected sources, final state, and things that must remain unchanged.
3. Cover transitions across playing/paused, leader/follower, Sync/Link, loop/Slip,
   Cue held/released, source groups, pending operations and audio boundaries. Prefer
   a small deliberate matrix over every possible combination.
4. Reproduce each reported gap as a failing regression. Keep expected outcomes
   independent of implementation helpers; include a counterexample that must fail.
5. Verify in layers: deterministic engine rules; captured audio for timing/routing;
   browser interactions for discoverability, geometry and gesture lifetime. Passing
   mocked audio nodes does not establish the emitted sound. Physical hardware remains
   a separate evidence category.
6. Update validation with measured results and unresolved gaps. Update the topic doc
   and wiki in the same change. A quick start teaches the smallest successful scenario
   from this specification; it must not turn a current defect into a permanent rule.
7. Recheck affected scenario families after the next refinement. Change an expectation
   only for an explicit product decision, recording why and which examples change.

This follows [executable specification by example](https://cucumber.io/docs/gherkin/reference/)
and [model-based testing](https://arxiv.org/abs/1504.01928). We use existing Vitest and the
real-audio harness; a new framework is not required. API contract tests such as Pact
address a different boundary and do not replace these product behavior checks.
