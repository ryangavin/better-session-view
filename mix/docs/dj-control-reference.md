# DJ-control reference and Play-view gap review (draft)

> Historical baseline and design reference. The implemented policy is documented in
> [Prep and Play](play-view.md); measured coverage is in [validation](dj-controls-validation.md).

## Glossary

| Term | Meaning in this reference |
|---|---|
| Playhead | The source-audio position currently playing, or the position held while paused. A waveform's fixed line represents it even when the waveform moves. |
| Beat | One pulse in the musical timing map. It is not a fixed number of seconds. |
| Bar / downbeat | A bar groups beats according to meter; the downbeat is its first beat. Four beats make one bar **only in 4/4**. Four bars in 4/4 are 16 beats. |
| BPM | Beats per minute. At constant tempo, one beat lasts 60/BPM seconds. |
| Beat grid | A map between musical beats and source timing. Editing the map does not itself transform audio; a playback process can use it to stretch audio. |
| Quantization | Two distinct operations: snapping a stored position to a grid, and scheduling an action for a grid boundary. A snapped Cue does not imply Play waits until the next beat. |
| Quantize resolution | The spacing of eligible grid points, such as one beat or half a beat. It is independent of a loop's length. |
| Sync: tempo / phase | Tempo matching equalizes beat rate; phase matching aligns the positions within beats. Neither alone establishes matching song phrases or downbeats. |
| Timing master | The clock/tempo reference followers use. It can be a deck or a shared clock; these are different designs. |
| Temporary / deck Cue | A replaceable return position for one loaded deck. It is separate from the current playhead and headphone routing. |
| Cue audition | Momentary playback from temporary Cue while the control is held, with a return on release unless Play has taken over. |
| Headphone Cue / Phones | Selects audio for monitoring. It does not set or recall a playback position. |
| Memory cue / Hot Cue | Memory cue: a saved position for later recall. Hot Cue: a performance trigger for a stored position or loop. Exact launch and persistence rules depend on product/mode. |
| Seek / audible scrub | Seek changes position. Audible scrub also produces sound while the position moves; repeated seeks are not necessarily a usable scrub engine. |
| Loop In / Out | Start and end boundaries of a repeating source region, normally represented as [In, Out). |
| Exit / Reloop | Exit stops repetition; Reloop reinstates remembered loop boundaries. Neither is inherently Stop or Slip. |
| Slip | An underlying timeline continues during a supported temporary operation; ending that operation returns playback to that timeline. |
| Stem | A separated component such as drums or vocals. In this app, individual stems can already play different sections. |
| Dry / wet | Unaffected audio / effect output. A send amount and an insert dry/wet balance are different controls. |
| Effect tail | Output remaining from previous input after new input stops, such as echo repeats or reverberation. |
| Effect amount / feedback | Amount controls contribution or application; feedback returns output into processing and can change persistence. Turning amount down need not change feedback. |
| Effects-group toggle | Proposed app control that suspends new processing for a defined group while retaining configuration and allowing its tails to continue. Its scope is not yet chosen. |
| Routing / assignment | Where audio goes: deck-to-main, crossfader side, effect input, headphone output, or Link feed. |

## Reading this draft

Prepared 2026-09-07. This is research, source audit, and an implementation proposal, not a shipped-feature specification or permission to implement every item. **R** means verified Rekordbox manual behavior; **H** means verified behavior for the named hardware; **P** means proposed app behavior; **U** means unresolved. Source verification means the manual says it, not that hardware was exercised.

Rules use **start → action → result; Q** to make position, playback state, and quantization explicit. Q=none means no proposed snapping/scheduling; Q=unspecified means the cited source does not establish the exact timing. “Immediate” excludes normal audio-engine latency; it does not promise zero milliseconds.

Latest direction: a loaded track is a small set of independently launchable stem clips, with section-row launches analogous to scenes. Preserve mashup combinations. The recommended hybrid model below supersedes treating divergent stems as an error to reunify. It is a proposal for review, not approved product behavior. A possible Apple silicon friend test informs usability priorities only; packaging is outside this audit.

### Sources and page coordinates

- **R:** [Rekordbox 7.2.18 manual](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf): 266 PDF pages. In the sections inspected, printed page equals the PDF viewer's **one-based** page; zero-based extraction index is page minus one. Visually checked printed page 160 and its Play/Pause icons. Relevant pages: [157 positioning](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=157), [159 Quantize](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=159), [160–161 Cue](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=160), [162–163 loops](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=162), [167 Slip](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=167), [168 Sync](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=168), [174 phones](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=174), [183 FX](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf#page=183).
- **H-AZ-C:** [XDJ-AZ Cueing](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/html/en/000COV_en/Cueing/Cueing.htm); [PDF printed/viewer p78](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/XDJ-AZ_DRI1936C_manual_EN.pdf#page=78). Visually verified the latch instruction's icon as **Play/Pause**, which disappears from text extraction.
- **H-AZ-L:** [XDJ-AZ Looping](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/html/en/000COV_en/Looping/Looping.htm), sections “Setting a loop,” “Fine-adjusting loop points,” “Adjusting the length,” and “Canceling loop playback.” PDF printed pp80–84.
- **H-AZ-F:** [XDJ-AZ Beat FX](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/html/en/000COV_en/Beat_FX/Beat_FX.htm), especially footnotes 1 and 2 beneath the effect table.
- **H-CDJ:** [CDJ-3000 product/control description](https://www.pioneerdj.com/en/product/dj-players-turntables/cdj-3000/), “Advanced Auto Beat Loop,” “Dedicated Beat Jump,” and “Eight Hot Cue buttons.” The linked manual endpoint returned 404; detailed XDJ-AZ rules below must not be relabeled CDJ-3000 rules. CDJ-3000X is also a different model.
- Background only: [Compare DJ Beat Detection Tools conversation](https://chatgpt.com/c/6a9a1776-cd40-83ea-9cd3-05c024e15b20) and [waveform design review](https://waveform-visualization-review.paulcolt.chatgpt.site). Neither was readable through the research browser here. The reported 92-page attachment was not recovered. No claim in this audit depends on them.

## Detailed control rules

P1–P31 describe single-source/coherent-deck control expectations. For independent stem combinations, the later recommended hybrid model specializes their target and checkpoint semantics; it takes precedence over assuming one deck-wide position.

### Play and temporary Cue

**Verified reference**

- **R, pp160–161:** Paused → Cue → replace cue; playing → Cue → return/pause; at cue → hold/release → audition/return/pause. Quantize can move a new cue; In sets real-time Cue at the nearest grid with Q on.
- **H-AZ-C:** Paused Cue sets/replaces the point; playing Cue returns to standby. Held Cue auditions; Play/Pause during the hold latches playback after release. **Q:** the Cueing section does not establish exact quantization. MEMORY saves points; Auto Cue can skip leading silence, with adjustable silence threshold.

**Proposed app contract**

- **P1:** Loaded, paused at position p → Play → start at p; playing → Play/Pause → hold the actual source position. Neither changes temporary Cue c. **Q:** no next-boundary wait by default; synced phase correction is a separate policy (U3).
- **P2:** Paused after intentionally positioning away from c → first Cue press → set c to committed p and stay paused; release stays there. Subsequent press at c auditions. **Q:** commit uses the selected marker policy; audition launch does not resnap the saved marker.
- **P3:** Playing away from c → press Cue → stop and return to c in standby; release does not resume. Repeated subsequent taps restart short auditions from c, rather than cumulatively advancing it. **Q:** return to exact stored c, without a new snap.
- **P4:** Standby at c → hold Cue → play from c; release → return to c and pause. Held audition → Play → continue from current audible position; subsequent Cue release must not jump. **Q:** takeover must not schedule a second launch.
- **P5:** Any held/pending audition → release outside, pointer cancellation, keyboard release, focus loss, replacement, Stop, or view departure → terminate the obsolete audition safely. **Q:** no musical wait. A completed Play takeover must survive an ordinary release, but Stop/replacement still win.
- **P6:** Loaded deck → set/recall Cue → display a persistent marker distinct from the playhead; pause/play moves only the playhead. **Q:** marker shows the committed position, including any snap. Record whether position changed intentionally; a hard-coded proximity threshold alone can mistake a small seek for “already at cue.”
- **U1:** Mouse, keyboard and multitouch access to the hold-plus-Play chord needs a concrete interaction design. One pointer cannot click Play while holding another button. Memory save, recall, Auto Cue and overwrite-on-Hot-Cue are companion options, not approved additions.

### Upper waveform positioning

**Verified reference**

- **R, p157:** Paused → drag enlarged waveform beneath center line → reposition for grid editing. **Q:** unspecified. This passage does not establish active-playback scratching behavior.

**Proposed app contract**

- **P7:** Paused, no drag → pointer down at x → remember x and source position; do not jump. Drag left → advance source position; drag right → move earlier. Release → retain position and stay paused. **Q:** continuous positioning, no snapping on every move, no implicit Cue replacement.
- **P8:** Drag near a track edge → continue dragging → clamp to available audio; do not wrap or lose pre-downbeat audio. **Q:** none; use the source map and audio duration, including negative musical coordinates where valid.
- **P9:** Paused → zoom → change visible range around the playhead, retaining source position and Cue. **Q:** none. A separate overview click-to-seek is optional; it must be visibly distinguishable from the relative upper-waveform gesture.
- **P10:** Coherent deck → reposition → move the original or all applicable stems on one audio timestamp. **Q:** one deck-level decision, not independent per-stem snaps. Full/stems switching should preserve that position.
- **U2:** Active-playback drag could be silent seek, audible scrub, or temporarily paused positioning. Click without movement, cancel/rollback, keyboard fine-seek, interaction with active loops, and the final acceptance of the hybrid targeting model below are open. Do not infer scratching from the presence of a draggable canvas. Recommended first slice: paused positioning only, with explicit scope and pending launches canceled.

### Manual Loop In / Out / Exit / Reloop

**Verified reference**

- **R, p163:** Playing → In → set loop start and Cue; Out → loop from In; Exit → cancel; playing → Reloop → recall loop. Q aligns loop points near beats.
- **H-AZ-L:** Playing → In then Out → repeated region. In/Out during a loop selects boundary adjustment via jog; pressing again or inactivity over ten seconds ends adjustment. Exit cancels; another Reloop/Exit returns to In and loops. Shift+In retriggers In. **Q:** exact snapping and action scheduling are not specified on this page.

**Proposed app contract**

- **P11:** Playing without pending capture → In → commit loop start and temporary Cue, continue playback, show “Set Out” and an In marker. **Q:** snap committed source position if enabled; do not silently schedule In as a future launch.
- **P12:** Awaiting Out, later valid source position → Out → commit end and loop from In. Show both boundaries, length and shaded active region. **Q:** same marker resolution as In; reject a collapsed/reversed result rather than manufacturing a loop.
- **P13:** Loop active → Exit → continue forward at current audible position, keep saved bounds, clear active shading. Inactive saved loop while playing → Reloop → restart from saved In and repeat. **Q:** proposed immediate exit; reloop scheduling remains an explicit policy choice. Paused Reloop behavior is unresolved.
- **P14:** Valid loop → select/drag individual boundary → update that boundary without accidentally resetting the whole loop. **Q:** snap only at commit; reject invalid/minimum bounds and show why. Choose how playback proceeds if the new end is behind the playhead before implementing adjustment.
- **P15:** Capture/exit/reloop → affect only the addressed deck and cancel superseded pending launches. **Q:** one shared operation time for applicable stems. Existing per-stem region capture is useful but differs from a conventional single-position deck; the recommended model below preserves relative offsets; collective section launch is the explicit reunification action.

### Quick loops, beat lengths and companion navigation

**Verified reference**

- **R, p162:** Playing → select beat count and activate → loop; activate again → cancel. **Q:** exact start policy unspecified here.
- **H-CDJ:** CDJ-3000 has **4-beat and 8-beat** loop controls, plus eight Hot Cue buttons and dedicated Beat Jump controls. This confirms the control inventory, not its complete timing state machine.
- **H-AZ-L:** During playback, hold In or press 4 Beat Loop to create four beats; 8 Beat Loop creates eight. In a loop, those buttons halve/double length. **Q:** this page bases automatic duration on BPM; it does not specify phase rounding. Missing detected BPM falls back to 120 on this hardware.

**Proposed app contract**

- **P16:** Loaded deck → select 16 beats / 4 bars (4/4) → choose length without starting playback. Playing → activate → loop that musical range; activate again → exit and continue. **Q:** selected resolution chooses start; selected length chooses end relative to start. Do not call 16 beats “4 beat.” Paused activation/start remains unresolved.
- **P17:** Active 16-beat loop → halve → 8 beats; double → 16 beats, preserving In. **Q:** preserve the committed anchor rather than resnapping it; a shrink past the playhead needs the same explicit policy as P14.
- **P18:** Active loop → move by n beats → translate both bounds, retaining musical length and active state. **Q:** a beat-map translation; choose wrap/phase behavior explicitly. Non-loop Beat Jump should remain a separate intent.
- **P19:** Variable-tempo source → make a musical loop → derive Out with the beat map, not N×60/current-BPM source seconds. **Q:** operate in beat coordinates, then convert to source time. Missing grid should report unavailable musical looping rather than adopt the hardware's guessed-tempo fallback.

### Quantize, Sync and Slip

**Verified reference**

- **R, p159:** Q is per deck; fractional quantize or fractional loops disable Beat Sync. **R, p168:** Beat Sync follows master BPM/beat positions. **R, p167:** supported Slip operations retain background progression and return there when finished. Exact per-action policies need verification.

**Proposed app contract**

- **P20:** Loaded deck → toggle Q or change resolution → update future marker/action policy, preserving playback and existing markers. **Q:** Cue/In/Out snap and launch scheduling need separate fields; avoid a single ambiguous boolean.
- **P21:** Grid unavailable → request quantized marker/loop → show unavailable state or an explicitly selected unsnapped mode. Keep native playback usable. **Q:** no fabricated grid. Resolve nearest versus floor/ceil, ties, and Out collapsing onto In with named policies and tests.
- **P22:** Follower playing → Sync on → follow chosen master tempo/phase; off → continue from actual source position under native timing policy. **Q:** independently controlled in the proposed design, a deliberate departure from R's fractional restrictions; prove small loops work before claiming this independence.
- **P23:** Synced deck → seek/scrub → preserve the user's position until the selected realignment policy applies. **Q:** choose immediate phase correction, release-time correction, or temporary Sync suspension; show any correction. Also specify whether Cue auditions stay exact and how the Cue-to-Play latch behaves when off phase.
- **P24:** Timing source pauses/unloads/disconnects → apply an explicit retain-clock or transfer-master policy; never silently choose whichever stem reports first. **Q:** preserve a continuous master timeline where chosen. Current shared-clock design can remain; a deck master selector is optional, not a prerequisite for Sync.
- **P25:** Playing with Slip armed → supported temporary loop → advance a separate background playhead; exit → return to its current source position and keep playing. **Q:** background advances using the same tempo map/clock; exit scheduling must be specified. Show both audible/background positions and enumerate supported actions. Ordinary Exit without Slip continues at the audible position.
- **U3:** Meter assumptions, grid corrections while loaded, Sync startup versus resume, tempo range, phase tolerance, late scheduling, clock loss and Slip reaching track end need explicit decisions. No assertion here describes Rekordbox's proprietary time-stretch or beat-detection internals.

### Effects application, configuration and tails

**Verified model-specific reference**

- **H-AZ-F:** Configured selected Beat FX → ON/OFF → apply/remove that effect on its selected channel; playback position is unaffected. Controls include selector, channel target, beat fraction, Time, Level/Depth, frequency bands, X-PAD, AUTO/TAP BPM and separate FX Quantize. **Q:** FX Quantize aligns application with analyzed grid; exact boundary rounding is not stated.
- **H-AZ-F:** Footnote 2 applies to Delay, Echo, Ping Pong, Spiral and Reverb: existing effected sound remains after input is cut, including effect off. Footnote 1 excludes these effects from the selected CH1–4 headphone Cue monitoring path. These are effect-specific rules, not proof of a universal all-effects switch. The user's remembered blue button remains unidentified.

**Proposed app extension**

- **P26:** Group configured and active → one group-off action → stop feeding new audio into the group's effects, preserve selected effects, individual enable flags, parameters, sends and assignment; maintain/restore the intended dry path smoothly and leave existing returns audible. Deck position/play state does not change. **Q:** immediate with a short audio ramp unless a separately selected FX launch policy says otherwise.
- **P27:** Off with residual sound → wait → show “off, tail” until output falls below a defined threshold; then show off. Reenable → recall exactly the stored configuration and admit new audio. **Q:** no marker changes; reenable timing policy is separate from delay length.
- **P28:** Effect amount change → vary contribution; feedback/decay change → vary persistence. Do not implement off by setting the visible amount knobs to zero. **Q:** effect time can be tempo-relative; amount ramp need not wait for a beat.
- **U4:** Define group scope: one deck's sends, both global return inputs, an insert chain, or master processing. Current A/B effects are shared returns; disabling one deck's send must not silence other decks' tails. True arbitrary multi-effect chains do not exist yet.
- **U5:** Specify feedback/freeze behavior (a future effect may sustain indefinitely), explicit tail-kill, reenable while tailing, effect replacement, routing changes, tempo changes during a tail and context restart. Never promise all effects naturally decay or that tail preservation means copying hidden proprietary DSP. Current send graph already carries dry audio continuously; restoring dry must not add a duplicate dry path.

### Headphones and companion-control inventory

**Verified reference**

- **R, p174:** Select channel headphone Cue, use Cue/Master mix and headphone level. **Q:** not a positional operation.

**Proposed app contract**

- **P29:** Deck paused/playing → Phones select/deselect → change only monitor routing; main output and all source positions remain unchanged. Allow several visible selections. **Q:** none.
- **P30:** Monitoring selected → Cue/Master mix or headphone level → change monitor balance/gain only. **Q:** none. Label pre/post-fader and pre/post-FX semantics; report missing output rather than leaking monitoring into main.
- **P31:** Auditioning a paused deck through headphones requires its playback Cue/Play operation as well as routing. Phones alone should not start the track. **Q:** inherits the audition's timing, not a headphones quantizer.

Inventory to revisit before declaring the DJ surface complete (each is a review item, not an approved feature):

| Area | Existing app evidence / companion decision |
|---|---|
| Loading | Drag/drop, replacement cancellation, Full/stems, grid-required Sync errors exist. Review load protection during playback and accessible load alternative. |
| Position | Temporary Cue exists; seek, zoom, cue marker, beat jump, fine seek and memory cue bank need work/decisions. Section-name hot cues are an app-specific launcher, not a general editable Hot Cue bank. |
| Tempo | Shared BPM and per-deck Sync exist. Review manual deck tempo, nudge, master indication, pitch/key controls and half/double tempo; these are separate from quick-loop length. |
| Loop | In/Out/Exit/Reloop exist. Review quick lengths including 16 beats, half/double, move, adjustment, retrigger, memory and Slip. |
| Mixer | Stem gain, channel trim/EQ/filter/fader, master controls, meters, A/Thru/B crossfade exist. Review overload visibility and routing clarity; no automatic limiting is documented. |
| FX | Two shared slots with per-effect knobs and sends exist. Review enable/group bypass, wet return control, time/beat selector, FX Q, frequency selection, tap BPM and arbitrary chains separately. |
| Monitoring | Phones selection and output routing exist. Cue/Master blend and independent Phones level are missing. Physical routing still needs verification. |
| Input | Review keyboard/touch parity, hold cancellation, focus, accidental drags, clear empty/loading/queued/awaiting-Out states and help text. |

## Recommended hybrid interaction model

The user's model is a tiny set per loaded track: section rows can launch a combination, while each stem column has independently launchable clips. Calling every combination one song position would discard the feature that makes mashups possible. Keep the section/stem terminology already used by the app; “scene” here explains the collective launch concept rather than requiring a UI rename.

### Recommendation: explicit focus, independent positions, collective checkpoints

- **Deck Play/Pause:** Paused combination → Play → resume each participating stem from its own held position; playing combination → Pause → hold each actual position. Preserve section selections, relative offsets, gains and active loop ranges. On a newly loaded deck with no selections, Play can start all available stems at the initial position, visibly establishing the participating set. **Q:** schedule participants on one output timestamp; do not snap each stem to a new phrase. Collective resume phase policy still needs definition.
- **Stem Play/Pause:** Selected stem → Pause/Play → hold/resume only that voice. Other stems and the shared clock continue. A stem Stop removes participation rather than silently making deck Play revive it. **Q:** resume follows the selected stem launch policy; ordinary pause is immediate. This distinction between paused and stopped must be represented in state, rather than inferred from a single `enabled` flag.
- **Stem Cue:** A focused stem owns a temporary cue with the familiar set/return/audition/takeover transitions P2–5. It affects only that stem; other parts may keep playing. **Q:** snap that cue at commit, recall exact saved position. This provides a meaningful conventional Cue even when no single deck-wide source position exists.
- **Deck Cue:** Treat it as a temporary **combination checkpoint**, visibly labeled/helped as such in stems mode. Store participating stem IDs, each position, current clip selection and each active loop region. Paused after intentional changes → Cue stores that combination; playing → Cue restores it and pauses all deck voices; held Cue auditions the stored combination; Play takes over; release otherwise returns to the checkpoint. **Q:** one operation timestamp; retain all relative beat offsets, with a separately specified commit snap anchored to the focused stem. Do not independently snap every stem and distort the combination.
- **Checkpoint scope:** Recall launch/position/loop state, not fader, trim, EQ, send, Phones, Sync or unrelated stem-cue settings. A checkpoint is session-local and invalidated by track replacement. Full mode has its own scalar original-track Cue; switching Full/stems must not silently overwrite the stored stem checkpoint. Changing participation while paused should visibly mark the combination as changed so the next deck Cue press has an understandable result.
- **Collective section launch:** Press a section name → intentionally launch all participating/available sources at that section's start according to the existing launch contract. This is the explicit way to align them again. An individual stem cell continues to launch only its own clip. Loop/one-shot behavior should be visible on cells; it need not pretend to be identical to Ableton's implementation.

### What the top waveform represents

Use the existing deck row as a **source timeline focused on one stem**, with an explicit stem selector and a persistent focus label. Show that stem's waveform, playhead, cue and loop bounds. Its x-axis still uses the track's common beat map. Display other active stems as named/color-coded position ticks when in range and edge indicators with source beat readings when outside it. Never suggest that spectral paint from the original file is the audible combined output.

Do not change focus merely because another stem is launched or paused; focus must remain predictable during a gesture. On first load choose a documented stable default (recommend drums when available, otherwise the first available stem). An explicit Original/Full view shows the original waveform and original-source position. A later optional expanded view can stack all stem waveforms; this is more informative but consumes substantial height across four decks.

The meter continues to show the real combined output. A rolling output waveform could be useful for level/transient feedback, but its x-axis is elapsed performance time: it has no unique source position to seek. Therefore it should not be the default source-navigation surface.

### Drag targeting and loop semantics

- **Default focused drag:** Paused focused stem → drag its waveform → move only that stem; others retain positions and playback. Provide a clearly named “Move active stems” mode/action for collective positioning. Do not rely on an undiscoverable modifier alone. If other stems are playing, the UI must say that positioning is local to the paused focus. **Q:** continuous preview; marker commit uses explicit policy.
- **Collective relative drag:** All participating stems paused → drag in Move active stems mode → add one beat delta to every participating source position. Compute a common allowable delta from all file bounds so nothing wraps or clamps independently. Preserve musical offsets using each position's beat-map conversion. Release stays paused and does not overwrite either stem cues or the deck checkpoint. **Q:** do not snap each voice separately; any optional final snap changes the common delta.
- **Active loops during positioning:** Recommend that a committed seek exits the addressed voices' active loops, retains saved loop bounds for explicit Reloop, and clears superseded queued launches. Otherwise a voice can snap back into its old clip region on Play. Preview this consequence while dragging; cancel restores the pre-gesture state. Collective movement applies this uniformly to its participants. This is a specific proposal requiring acceptance, not a manual-derived rule.
- **Loop controls:** Deck In/Out captures a region per participating voice on one timestamp and displays a collection of ranges; stem In/Out affects only focus. Quick loops use the same selected beat length independently from each member's start. Exit preserves each audible position; collective Reloop recalls each stored In. The focused range is the main annotation, with a multi-region indication if others differ.
- **Scrubbing during playback:** Defer audible scratch-style manipulation. First support the paused gestures above; explicitly disallow collective seek while any participating voice plays unless a pause-and-position mode is chosen. Later evaluate audible stem scrub without interrupting other voices. It must not accidentally become deck-wide seek.

### Alternatives and tradeoffs

| Option | Benefit | Cost / recommendation |
|---|---|---|
| One original waveform, one global deck position | Closest conventional DJ appearance; minimal controls | Cannot truthfully describe divergent stems. Reject as the default stem model. Keep for Full playback. |
| Original waveform with multiple source markers | Preserves today's spectral overview with modest changes | Audio shape does not match a selected stem. Useful transitional view only if explicitly labeled Original reference. |
| Focused stem waveform plus other-source indicators | Precise navigation with limited vertical space; explicit control target | Requires focus UI and per-stem frame data. Recommended default. |
| All stem waveforms stacked | Every source and loop directly inspectable | Dense across four decks. Recommend optional expansion after the focused model is usable. |
| Composite output waveform | Shows what the combination actually sounds like over performance time | No unique seek mapping to source clips. Optional monitoring display, not source navigation. |
| Scalar deck Cue tied only to focus | Simpler implementation and conventional semantics for one stem | A deck-labeled Cue would unexpectedly leave other stems playing. Prefer explicit stem Cue plus combination checkpoint for deck Cue. |

Remaining decisions: accept the checkpoint scope and save-on-paused-change rule; define which stems a collective section row starts (all available versus current participation); choose collective snap anchor and Sync phase behavior; confirm exit-loop-on-seek; choose physical input shortcuts and focus defaults. These decisions do not block writing this recommendation, but they gate dependent product changes. Do not introduce editable clip arrangements, saved projects or new packaging work merely to deliver this control model.

**Additional validation:** Save a checkpoint with drums at beat 16 looping [16,24) and vocals at beat 48 looping [48,56), different gain/send settings, and bass stopped. Advance, deck Cue, audition, Play takeover and release: restore/retain both distinct positions and loops, leave bass stopped and gains unchanged. Move both paused voices by +4 beats: get 20/52, never 20/20. Move focused vocals alone: drums remains at 20. At a file edge, common-delta clamping must retain the 32-beat offset. Switch Full and back without overwriting either checkpoint. Test cancellation and late queued launches at every step.

## Implementation gap matrix

Audit baseline: isolated worktree HEAD `de680361b2cd2fc9e5366d688a24ac24cde6e44e`. Links below are relative source paths plus named functions and line references at that revision. **Implemented** means source exists, not end-to-end certification. **Mismatch** is against the identified reference/proposal, not an approved bug-fix mandate. P0/P1/P2 indicate suggested order, not incident severity.

| Priority / area | Status and evidence | Expected experience / meaningful check |
|---|---|---|
| P0 waveform positioning | **Missing:** [frames.tsx](../../widgets/src/mixer/frames.tsx), `FrameWaveform` L44–76, renders scroll/loop/playhead but no seek gesture; [model.ts](../../widgets/src/mixer/model.ts), `MixerCommands`, has no seek; [voice.ts](../src/play/voice.ts), `seek`, is internal and halts audio. | P7–10; V1/V8. A low-level seek function is not a usable waveform interaction. |
| P0 Cue transitions | **Implemented, runtime unverified:** [engine.ts](../src/play/engine.ts), `play`/`cue` L138–179; tests L140–150 cover return, audition, takeover and new paused Cue. **Missing:** displayed Cue marker; private Cue is not exposed in widget model. | P1–6; V1–3. Existing paused positioning requires playback/pause or another launch, so reported inability to scrub does not mean Cue is absent. |
| P0 Cue input lifecycle | **Mismatch/coverage gap:** [Toggle.tsx](../../widgets/src/controls/Toggle.tsx) L79–82 handles down/up/leave; no pointer capture, pointercancel, blur or momentary key handlers. [DeckStrip.tsx](../../widgets/src/mixer/DeckStrip.tsx) L59 recognizes held-Cue Play takeover. | P5/U1; V3. Engine supports latch, but physical mouse/touch/keyboard gesture reliability is unverified. Leave cancels when `on` is true; that is not full cancellation coverage. |
| P0 manual In also sets Cue | **Mismatch:** `engine.ts` `deckLoopIn` L303–309 stores loopStarts only, never `d.cue`; In is disabled while paused. | P11; V4. During playback, In then later Cue should return to new In if matching R/H-AZ. Paused In is a separate decision. |
| P0 independent quantization | **Missing/mismatch:** `launch` L212 waits for next bar solely when synced and clock running; `state.quantized` is not consulted. `setQuantized` L395 only publishes. [PlayView.tsx](../src/play/PlayView.tsx) L13 uses externalTransport, hiding the bench launch toggle. Cue/manual loop capture has no grid snap. | P20–23; V4/V8. Q off should not secretly remain bar-queued because Sync is on; marker resolution needs its own behavior. |
| P1 manual capture/exit | **Implemented:** `engine.ts` L303–333 captures source seconds, enforces >20 ms and retains spans. Exit schedules continuation at actual position. **Unverified:** near-boundary latency and different stem positions. | P12–15; V4/V6. Out restarts from In at an audio lead time; UI click time is not actual output time. |
| P1 paused Reloop | **Mismatch against a start-on-reloop proposal; decision pending:** `setDeckLoopEnabled` only restarts voices already playing. It can mark loop enabled while paused without seeking/starting. | Choose paused policy before writing acceptance assertion; V6 records actual state. |
| P1 quick loops/editing | **Missing:** no quick length, half/double, boundary adjustment or loop-move commands in `MixerCommands`; only manual and stem-section spans. Pending In/Out visual state **implemented** in `frames.tsx`. | P16–19; V5. Section loops cannot substitute for arbitrary 16-beat loops. |
| P1 Sync | **Implemented:** `sync` L181–193; `play` L153–158 realigns resumes; [voice.ts](../src/play/voice.ts) prepares/schedules stretch. **Mismatch with exact-position P1 when synced:** Play can alter source position. Uses shared clock, no deck master selector. | P22–24; V8. Note `sync()` uses floor(sourceBeat)+phase whereas resume uses nearest phase; choose consistent policy. Missing-grid error exists. |
| P1 FX group and tails | **Missing:** [MasterStrip.tsx](../../widgets/src/mixer/MasterStrip.tsx) L20–35 has selectors/knobs/sends but no enable/group control; model has no enable/tail state. **Mismatch with tail-preserving replacement:** `engine.ts` `apply` L244–249 disposes old effect on type change. | P26–28; V9. Current sends can be reduced to zero, but that changes their settings and is not the requested group toggle. Tail decay after send cut is a graph-based expectation, not measured here. |
| P1 phones | **Implemented:** `engine.ts` `audio` L47–55 routes main 1/2, Phones 3/4 where available; `adopt` L116–118 uses channel.pre; `setDeck` L402 rejects unavailable routing. **Missing:** Phones gain and Cue/Master blend. | P29–31; V10. [graph.ts](../src/play/graph.ts) puts Phones after trim/EQ/filter, before fader/crossfade and shared FX returns. Physical outputs/Link unverified. |
| P2 Slip | **Missing:** no background source timeline, Slip state or commands in `mix/src/play`/widget contract. Ordinary loop exit exists. | P25; V7. Do not relabel ordinary exit as Slip. |
| P2 stored navigation | **Partial:** `launch` L194–228 provides section hot cues and independent stem section loops. No general memory-cue editing/persistence or editable Hot Cue bank. Cue starts at zero on adopt. | Inventory/U1; validate replacement, leading silence and persistence policy before adding saved state. |
| P1 stem coherence | **Current capability plus proposed design:** source can diverge via `launch(...,stemId)`; waveform uses first enabled source as position reference. `deckLoopIn` captures per-voice positions, not a shared source position. | P10/P15; V11. Preserve combinations using explicit stem focus and collective movement; expose every active source position. See the hybrid recommendation below. |

### What was actually checked

Opened `http://localhost:5673` in the Codex in-app browser and switched to Play. Observed four empty deck waveform targets, Play/Cue/Sync, In/Out/loop controls, Phones, A/B FX selectors/knobs/sends and crossfade controls. Empty-deck controls were disabled. No tracks were loaded or audible scenarios performed in this audit.

Port 5673 belonged to node PID 55456 with cwd `/Users/ryan/The Source/better-session-view`, **not this worktree**. That checkout had the same HEAD but concurrent uncommitted widget/help changes. Its observed UI inventory is corroborating evidence only; it is not proof this isolated branch runs. The other task's reported historical tests were not adopted as fresh results.

Inspected the existing engine/widget tests. Attempted the focused command `npm test -- --project=mix mix/src/play/engine.test.ts --project=widgets widgets/src/mixer/MixerView.test.ts`; it could not run because `vitest` is not installed in this worktree (`sh: vitest: command not found`). No product code changed, no test dependencies were installed, and no playback/hardware pass is claimed.

## Concrete validation scenarios

Use a disposable analyzed 4/4 track with known beat/sample landmarks, pre-downbeat audio, distinguishable aligned stem clicks, and a second variable-tempo fixture. Capture engine source positions, stored Cue/loop bounds, queued audio times and separate output renders. Use actual audio time, not animation-frame timing, for assertions. Proposed behavior requires implementation before these can pass.

- **V1 — primary workflow:** Q off, Sync off, paused → relative drag from p=10 s to 12 s → assert no pointer-down jump, paused release and old Cue unchanged → Cue down/up stores 12 s without starting → three taps return there → hold advances → Play takeover → release keeps advancing. Repeat Full/stems. Record whether the chosen physical chord is achievable.
- **V2 — Back Cue:** Set c, play two seconds beyond it → Cue down/up → all applicable voices paused at c; no main playback after release. Pause alone must not overwrite c. Include a new position only 5 ms away to expose the current 10 ms comparison rule.
- **V3 — cancellation/races:** Hold Cue; release outside, cancel touch, blur window, use keyboard release, switch view, Stop, replace track. Delay AudioContext resume and Sync preparation, then resolve them after cancellation. No obsolete playback may start. Repeat Play takeover followed by ordinary release; it must keep playing.
- **V4 — marker Q:** At 120 BPM use In at beat 8.22 and Out at 12.78. Q off preserves measured positions; candidate nearest one-beat policy commits 8 and 13. Cue returns to In. Half-beat resolution yields 8 and 13 here; add 8.30/12.70 to distinguish 8.5/12.5. Test exact ties, collapsed bounds, negative beats, missing map and variable tempo. Log snap result separately from launch timestamp.
- **V5 — quick loop:** Select 16 beats (4 bars in 4/4) at beat 32 → bounds [32,48); halve → [32,40); double → [32,48); Exit → continuous audible position; Reloop → 32 and repeating. Compare each bound through the variable-tempo map. Shortening behind the playhead, moving near file end, and unavailable grids must follow the chosen policy.
- **V6 — manual edge states:** Await Out visibly; reject Out before/equal/too close to In. Capture while stems differ. Exit near wrap; verify no unintended jump or other-deck change. Pause then Reloop and record position/play state against the chosen policy. A section hot cue should cancel obsolete queued loop operations.
- **V7 — Slip contrast:** At beat 32 start an eight-beat loop, let 20 master beats pass. Ordinary Exit continues from the audible loop position; Slip Exit returns to the underlying beat 52, subject to defined scheduling. Verify second playhead, track-end handling and allowed operation list.
- **V8 — Sync/seek:** Play master clock and follower at different original BPM; scrub follower while paused and, only if supported, while playing. Confirm selected realignment policy and no hidden Cue change. Toggle Q independently at several resolutions. Pause/unload timing source and disconnect Link; verify defined clock policy. Check Cue hold-to-Play off phase.
- **V9 — FX group:** Configure Echo/Reverb with distinct parameters and nonzero deck/master sends. Capture settings. Group off: no new test impulses enter covered effects, old response remains and decays, dry continues without doubling/click, positions unchanged. Reenable while tailing and after silence: settings identical. Check other decks remain audible for deck-scoped off. Exercise feedback/freeze policy, effect/target replacement and context restart separately.
- **V10 — Phones:** Main plus two selected decks; toggle Phones and change blend/level. Source positions and main output render remain identical. Solo monitoring output responds correctly. Lower a deck fader: pre-fader Phones remains; shared FX returns are excluded under current routing. Stereo-only output produces a useful unavailable message, not monitor leakage. Repeat on physical four-channel hardware and Link receiver before certification.
- **V11 — divergent stems:** Launch drums in one section and vocals in another → drag/cue/manual loop. Assert either maintained relative offsets or explicit reunification, according to the chosen policy; never an accidental mixture. Validate the visual reference and each actual source position.
- **V12 — usability:** Mouse, keyboard and multitouch; drag versus file-drop; zoom, long tracks, narrow window, hidden-tab/resume, end-of-track and loading errors. Verify markers remain visible and commands stay responsive without turning React rendering into the audio clock.

## Prioritized implementation plan (proposal only)

### 1. Define the small behavioral contract before changing controls

Resolve U1–U3 for the first delivery: paused waveform positioning, Cue gesture, acceptance of the hybrid control targeting below, marker resolution and Sync resume policy. Resolve group scope U4 separately so FX work can progress independently. Record decision tables in this draft's successor/topic doc. No need to settle optional Auto Cue, editable Hot Cue banks or arbitrary FX chains to deliver paused seek and reliable temporary Cue.

Recommended first assumptions for review: paused relative drag, no click-only jump, exact saved Cue recall, continuous drag with marker-only snapping, independent Q settings, and an explicitly identified shared clock. Adopt the hybrid recommendation below for review: focused-stem dragging, explicit collective relative movement, and deck Cue checkpoints. Reunification belongs to collective section launch, never an ordinary drag or resume.

### 2. Establish source-position and operation ownership (P0 dependency)

In `mix/src/play/engine.ts`, keep the engine authoritative for playhead/Cue/loop/queued operations. Introduce typed seek/position intent and a Cue state machine distinguishing standby, newly positioned, setting, pending audition, audition and Play takeover. Reuse deck operation generations and slot revisions to cancel superseded asynchronous starts. Retain exact stored Cue independently of position; replace the proximity-only 10 ms decision with an explicit positioned state where needed.

In `voice.ts`, retain source-second scheduling and shared output timestamps. A deck seek must define whether it halts, resumes or merely previews; do not blindly expose the existing halt-and-seek primitive as an audible scrub. Stage future audible scrub separately with measured latency/click behavior.

Add a pure helper within `mix/src/play/` for beat-map snap/loop-bound decisions, using existing `warp.ts` conversions. Keep React, Web Audio and DOM out of that helper. Keep musical/audio policy out of widgets. Generalize scalar deck Cue into a checkpoint of participating stem positions and launch/loop state, while retaining independent stem cues; expose per-stem frame positions and explicit focus. Full mode retains a separate scalar cue/checkpoint. If later generalized into core, follow core's no-transport/no-React rules.

**Gate:** V2/V3 state/race tests; deterministic source-to-beat tests including negative lead-in and sample-rate mismatch. These precede UI wiring.

### 3. Expose paused positioning and Cue feedback (P0)

Extend `widgets/src/mixer/model.ts` with semantic seek intents with explicit stem/deck targets, host-reported Cue positions and relevant pending state; adapt via `mix/src/play/useMixerViewModel.ts`. Implement relative pointer geometry and zoom in `frames.tsx` or a focused mixer waveform interaction component. Supply source/beat conversion from the host; the widget handles pixel deltas and input lifecycle only. Distinguish track-file drop from waveform drag.

Use pointer capture plus pointercancel/lost-capture cleanup and keyboard press/release support for momentary controls. Consider a dedicated Cue interaction wrapper if generic `Toggle.tsx` changes would alter every app. Preserve existing held-Cue Play takeover; make its mouse/keyboard/touch interaction achievable and testable. Publish cue markers via low-rate state; keep animated positions in `readFrame`/the existing frame path.

**Gate:** V1–3/V11–12, real browser inspection and actual source-position readings. Prove shared harness checkout identity or run this worktree on a separate verified port before claiming it works.

### 4. Make quantization explicit; complete manual and quick loops (P0/P1)

Replace the unused launch `quantized` boolean policy with separately named marker resolution and launch timing. Implement host decisions at captured audio timestamps; show availability/errors. Update `launch` so Sync is not an implicit substitute for Q. Define tie-breaking and scheduling at/beyond a boundary.

Update `deckLoopIn` to set Cue as well as loop start if adopting the reference. Add semantic quick-loop length, half/double, boundary-adjust and move commands. Reuse `loopSpans`/`loopStarts` only with clear retained/active/pending distinctions; use beat-map endpoints for musical lengths. Extend `DeckStrip.tsx` controls and `frames.tsx` annotations with explicit beat/bar labels. Decide paused activation/reloop and shortening behavior before changing it.

**Dependencies:** steps 1–2; waveform markers from step 3 improve validation but engine loop tests can precede their UI. **Gate:** V4–6/V8/V11, unit operation tests plus real Web Audio wrap/exit renders. Check small-loop scheduling against actual worklet latency rather than only a mocked AudioContext.

### 5. Add FX group application state without destroying configuration (P1)

Define scope in the model, engine and `MasterStrip.tsx`/`DeckStrip.tsx`. Keep stored send/parameter values separate from effective gated input gain. For global A/B group off, ramp **every** covered deck and master send's effective gain to zero while retaining return connections. For deck-scoped off, gate only that deck's contributions; a shared return tail cannot identify which deck created it. Do not mute the shared return or dispose `MixerEffect` to implement off.

`graph.ts` already has wet-only returns; preserve the dry sum and existing internal decay. Add return metering for off-with-tail state. If tail-preserving effect replacement is selected, retain the old return disconnected from new inputs until an explicit decay/kill policy retires it; bound resource use. Keep arbitrary multi-effect chain authoring out of this step unless separately selected.

**Dependencies:** U4–U5 scope/lifetime decisions; independent of waveform implementation. **Gate:** V9 using offline impulse/noise renders through real graph nodes, settings equality and cross-deck isolation. Current feedback is capped at 0.92 for applicable delays; that is app source behavior, not a universal guarantee for future effects.

### 6. Complete monitoring controls and timing feedback (P1)

Add a dedicated Phones gain and explicit Cue/Master blend in `engine.ts`, retaining main-output isolation. Extend widget model/controls and annotate current pre-fader/pre-return tap. Do not equate Phones volume with master fader. Add timing-source/follower status and useful Sync preparation/failure feedback; a deck-master selector can remain deferred if shared clock is the agreed design.

**Gate:** V8/V10; separate channel renders, actual interface outputs and Link receiver. Add output-loss behavior tests. No change to bridge/LOM is needed for these local audio controls.

### 7. Add Slip and optional companion navigation after the core contract (P2)

Slip requires a second musical/source timeline that survives temporary operations, with an explicit supported-action list and engine-owned return scheduling. It is not a flag on ordinary loop exit. Extend the frame model to display the background position. After that, separately scope editable memory/Hot Cue persistence, beat jump/nudge, Auto Cue and expanded FX controls.

**Dependencies:** position/loop/Sync contracts from steps 1–4. **Gate:** V7/V8/V11, track-end and clock-disconnect cases. Avoid making optional companion features prerequisites for the high-priority workflow.

### Delivery and documentation gates

For each future functional change, update `mix/docs/play-view.md` and the matching widgets topic doc; add tests that distinguish meaningful alternative behavior. Update the separate wiki's `Mixing-stems.md` only when the behavior exists, according to AGENTS.md. This draft adds no shipped claims and requires no wiki edit, commit or push.

Run focused engine/widget tests with dependencies available, then required type checks and relevant audio harness checks. Use `http://localhost:5673/harness/mixer-audio.html` for the existing real Web Audio checks and extend it for the actual new audio behavior. Physical headphone/Link and multitouch validation remain separate gates. Report untested cases plainly, including input-method and audio-device limitations.
