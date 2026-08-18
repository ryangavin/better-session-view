# Device faces

A stock Live device drawn as a faceplate rather than a title bar.
`components/devices/eq8/Eq8.tsx`, `Eq8.css`.

**Nothing renders it yet.** It is a complete face with no data behind it and no call site —
see [what it needs to be drawn](#what-it-needs-before-anything-draws-it) at the end.

## Why the face is the app's, and the parts aren't

[`widgets/`](../../widgets/README.md) holds the parts a faceplate is made of: a knob, a
value box, a switch, a `Device` shell, a `Panel`'s aligned lanes. It holds them because a
knob is a knob wherever it's mounted, and the module's whole claim is that it has never
heard of Live.

A face is the other thing. Eight lanes on a shared row grid, an analyzer's controls on one
plate and the output's on another, preset chrome in the title bar — that arrangement is one
particular device and no other, and it is only right to the extent that it matches what
Ableton drew. Putting `Eq8` in `widgets/` would export exactly the knowledge that module
refuses to carry, and the bench would then be a page that has to be right about Live.

So the boundary runs between the parts and the arrangement, and the app composes. It is the
same crossing [the device chain](device-chain.md) already makes for shells, one tier in:
that footer takes a name and two booleans and draws chrome, and this takes a parameter and a
number and draws a control.

## It states its own readings

Every value on the face is the component's own `useState`, seeded from a constant at the top
of the file. It is not that there is nothing to read any more — the parameter tier landed:
an open device publishes `ChainDevice.parameters`, values stream into `ChainStore` and come
back out of `useDeviceParameters`, and `deviceParam` in `lib/liveParam.ts` turns one into
the `Param` a widget takes. What's missing is smaller and duller than it was: **this
component accepts no props.** Nothing can hand it a parameter, so it holds its own.

The seam where that changes is already in the props. Every widget takes an optional
`display`, and it wins outright over the formatter in `widgets/src/param/format.ts` — the
face computes `167 Hz` and `-7.81 dB` itself today, and hands over the moment Live's own
`str_for_value` is on the wire. That is what the optional-and-authoritative rule in
[the parameter model](../../widgets/docs/param-model.md) was for.

## The geometry, which is the part that took the iterations

Three kinds of plate sit on one `Panel`: eight identical band lanes, and a side plate at
either end. They read as one device only if their margins agree, and the two ways they can
disagree are worth writing down, because both were wrong at some point.

**Widths come from one gutter.** `Eq8.css` names `--eq8-gutter` once — the distance from
a plate's edge to the controls inside it — and every plate's width follows from a control
width plus two of them, with the plate's padding a pixel short of the gutter because the
border is inside `border-box`. The controls take their widths from the same tokens, through
`--wdg-number-width` and friends set on the plate. Passing each control a `width` prop
instead is what the file used to do, and it spreads one piece of geometry across a dozen
call sites where a plate and its contents drift a pixel or two apart — which is exactly how
the outer plates stopped matching the lanes.

**Row heights belong to the lanes.** Each track is its lane group's height plus the same
margin, so a lane's three sections sit evenly however tall the group is; the bottom one
holding a value box, a filter menu and the band switch is genuinely taller than a knob, and
the row is taller to match. A side plate holds unrelated groups and fewer of them, so it
does *not* ride that grid — it spaces its own groups over the plate's full height. Making it
share the lanes' tracks is what left the output plate's last pair stranded in the middle of
a row sized for something else. Their captions never had to meet the lanes' alignment lines.

Two consequences worth knowing before adjusting anything:

- **The analyzer plate is airier than the output plate**, because it holds four controls
  where the other holds six. Its spacing is even, but it is even at ~14px where the output
  plate's is ~3px. That is a content difference and CSS can't close it — the fix, if it ever
  wants one, is a fifth and sixth control on that side.
- **Band selection is not drawn**, and that one is only waiting. Live marks the band its
  display has focused, and `Eq8Device.View.selected_band` is settable *and* observable, so
  it can be kept in step both ways — see [`bridge/LOM.md`](../../bridge/LOM.md). Nothing on
  the wire carries it today, which is why the face has no notion of it.

Colours come from the app through the token bridge: every `--wdg-*` token resolves to a
`shared.css` token with its own fallback, which is why the same face works on the widget
bench with no palette around it. See [layout and CSS](layout-and-css.md#widget-tokens) — and
note the direction, because `shared.css` never defines a `--wdg-*` token.

## What it needs before anything draws it

1. **Props, and a binding.** The parameters exist; what doesn't is any way to give them to
   this component, and any decision about how a face finds the three it wants for band 4
   out of a flat list of `DeviceParameterState`. Matching is by `name`, and the names are
   Live's — none of them has been read off a real device yet.

   **The mapping will not be one-to-one, and `bridge/LOM.md` says so:** three of the EQ
   Eight's controls are device *properties* rather than parameters, so they will never
   appear in that list. `global_mode` is this face's Mode select, `edit_mode` is its Edit
   switch, and `oversample` is a control the face doesn't draw at all. A face built only
   from `parameters` loses them silently, which is the failure worth designing against.
2. **A decision about the shell.** `Eq8` renders its own `Device`, title bar and all,
   while `DeviceChain` renders a `Device` per chain entry. One of them has to give: either
   the face becomes a faceplate that a shell wraps, or the chain hands the whole shell to a
   face when it has one. The second reads better — the preset chrome in that title bar is
   the face's, not the chain's — but it means `DeviceShell` picks a component by device kind.
3. **A kind to pick it by, which already exists.** `ChainDevice.className` is
   `Device.class_name` — `Eq8`, not `EQ Eight` and not the title bar, because a renamed EQ
   Eight is still an `Eq8`. Match on that and never on `name`. See
   [`bridge/LOM.md`](../../bridge/LOM.md) for the three-way distinction.

The naming follows from that last point rather than from taste: a face lives at
`components/devices/<class_name>/`, and the folder, the file and the export spell it the
way the wire does. A lookup from `className` to a component is then a table of the same
string three times, which is the point — `EQ Eight` is what the title bar says, not what
anything matches on.
