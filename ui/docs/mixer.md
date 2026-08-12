# Mixer panel

The mixer strips and meters.

## Mixer panel

An Ableton-style stop row starts pinned beneath the visible Session columns and has its
own filled-square header toggle. Each
ordinary or group track has a stop-clips button in its own column; the pinned Songs/Master
cell holds Stop All Clips. The row reads `fired_slot_index = -2` back from Live, so a
pending stop lights the corresponding button rather than relying on optimistic state.
It sits at the grid bottom when the mixer is closed and moves directly above the mixer
and its resize handle when opened. The row replaces the grid's former bottom padding, so
it sits flush against the app footer rather than floating above it. Stop All no longer
appears in the header; Esc remains its keyboard equivalent, and ⌘-clicking a track header
remains a shortcut for one track.

The header's meter icon opens a column-aligned mixer below the grid. Every visible track
gets a full-height output meter, a draggable volume indicator beside it, resettable peak
and exact volume readouts, compact pan, Track Activator, Solo and Arm; Master gets the
same meter, volume and pan treatment in the pinned Songs column. A group track is a real
track, so it gets the same strip, but its Arm control is invisible while retaining its
layout slot. On other tracks Arm remains visible but disabled when Live reports
`can_be_armed = 0`. The activator is the inverse of `Track.mute`, matching Live's enabled
button rather than presenting a backwards Mute state.
Selected Solo uses Live's blue visual language; activator and Arm remain amber and red.

The adjacent sends icon opens a separate Live-style A/B/C section above the meters and
opens the mixer too if it was closed. Each row is a horizontal draggable value field backed by the
corresponding `MixerDevice.sends` parameter; double-click restores Live's reported
default. Master has no sends. The sends section takes its natural height and grows the
whole footer, so toggling it never consumes the meter's resizable height.

Live's `output_meter_*` values already represent positions on its normalized logarithmic
meter. The fill uses that position directly; applying `log10` again makes a half-height
reading appear nearly full. The rail runs from -60 to +6 dB, with 6 dB rules and fixed
green/amber/red zones. Rules are clipped to the meter well; they never paint into the
control gutter, and the brighter 2px 0 dB rule anchors the scale. The peak field holds
the highest position until clicked. Volume and pan
labels come from `DeviceParameter.str_for_value`, so their compact text is Live's own
rather than a second conversion maintained by the client. Double-clicking either draggable
control restores its reported `default_value`. Master and ordinary tracks render the same
56px fader subtree, so the rail, peak/volume fields and pan cannot acquire separate sizing.
Master merely centers that shared subtree in its wider pinned cell. Its track-switch stack
stays in the shared layout but is invisible, so its pan remains aligned with every other
strip. The unused area has no label that could overlap the meter rail.

The optional stop, sends and meter sections are one sticky `<tfoot>`, so table layout
stacks them without independently calculated offsets. Every join uses the grid's same 2px
border; the border immediately above the meters is also their resize handle, with the
cursor providing its hover affordance. Only the meter section changes height, from a
164px minimum; the 220px
default leaves room for a useful volume range and the four offset controls. The output
rail stays 8px in exceptionally tight viewport-fit modes and grows smoothly to 16px as a
roomier column admits a 56px strip; it stops at that width instead of consuming all the
air in an 8-track view. The Activator, Solo, Arm, peak, volume and pan controls use a
26px-wide column at every track width; their heights grow by the same proportion as their
widths. The controls occupy the meter's lower-left side instead of
shortening it, matching Live's compact mixer-strip geometry.

Mixer observation exists only while the panel is open, and the one-observer-per-track-per-
return send layer exists only while its own toggle is on. Output peaks remain in the 30 Hz
`MeterStore`; control readback uses a separate `MixerStore`, and both are external stores
so one changing strip does not render `App` or every scene. The LOM seeds a complete
`MixerState`, then updates a cached strip from each property callback and coalesces pushes
to one per display frame. It does not re-read every track under parameter automation.

Volume, pan and send input are limited to one `setMixer` patch per animation frame and stay
optimistic until Live's observed value catches up. `DeviceParameter.is_enabled = 0`
disables the indicator rather than pretending a mapped, automated or otherwise
unavailable parameter can be written. Mixer writes do not participate in this app's
clip/scene undo.
