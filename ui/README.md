# ui/

React 19 + Vite. Builds to `bridge/public/`, which the device serves.

## Where the reasoning lives

Each area has one doc under [`docs/`](docs/). **Read the row you need, not the set.** Every
doc is self-contained, so the index below is meant to be enough to pick one and stop.

| doc | read it before touching | source |
|---|---|---|
| [snapshot lifecycle](docs/snapshot-lifecycle.md) | the connection, the walk, deltas, staleness, or anything that writes | `lib/client.ts`, `hooks/useBridge.ts`, `useBridgeSession.ts`, `useLog.ts`, `useDeviceState.ts`, `useSnapshotLookups.ts`, `lib/snapshotTiming.ts`, `components/BridgeProvider.tsx`, `SyncModal.tsx` |
| [the grid](docs/grid.md) | the clip table, selection, the active cell, column widths, the song index, the status strip | `components/ClipGrid/*`, `SongIndex.tsx`, `StatsBar.tsx`, `Stat.tsx`, `hooks/useGridSelection.ts`, `useGridKeyboard.ts`, `useViewportColumnWidth.ts`, `lib/selection.ts`, `keys.ts`, `columnWidth.ts`, `songIndexColumns.ts` |
| [songs and folding](docs/songs.md) | song blocks, the header row, folded shapes, the mapping read back | `components/ClipGrid/SongHeaderRow.tsx`, `SongsModal.tsx`, `NewSongModal.tsx`, `hooks/useSongLayout.ts`, `lib/rowMarks.ts` |
| [scenes and roles](docs/scenes-and-roles.md) | the rail, the title fields, the role vocabulary, the role menu | `components/ScenePanel.tsx`, `Rail.tsx`, `Inspector.tsx`, `RoleMenu.tsx`, `SetConfigModal.tsx`, `TagChip.tsx`, `hooks/useSceneTitles.ts`, `useRoleAssignment.ts`, `useVocabulary.ts`, `useClipInspector.ts`, `useRailAndLog.ts` |
| [color](docs/color.md) | swatches, song color, scene color, the palette | `components/SwatchGrid.tsx`, `ColorSelect.tsx`, `hooks/useSongColor.ts`, `useColorRules.ts`, `lib/allowedColors.ts` |
| [moving scenes and clips](docs/moving.md) | either drag grip, the move plan, the drop indicator | `hooks/useSceneDrag.ts`, `useClipDrag.ts` |
| [bulk workflows](docs/bulk-workflows.md) | the running order or coloring by rule | `components/ReorderModal.tsx`, `RecolorModal.tsx`, `BulkWorkflow.css` |
| [the header](docs/header.md) | the Live control bar, transport state, glyphs | `components/Header.tsx`, `Icon.tsx`, `Control.tsx` |
| [mixer panel](docs/mixer.md) | meters, faders, sends, the stop row | `components/ClipGrid/TrackMeter.tsx`, `TrackSends.tsx`, `useMeterResize.ts`, `hooks/useMixer.ts`, `useMeters.ts`, `lib/mixerStore.ts`, `meterScale.ts`, `liveParam.ts` |
| [the device chain](docs/device-chain.md) | the footer showing a track's devices, and the one place `widgets/` chrome is used | `components/DeviceChain.tsx`, `hooks/useDeviceChain.ts` |
| [track groups](docs/track-groups.md) | group columns and collapsing | `hooks/useTrackColumns.ts` |
| [undo](docs/undo.md) | the undo entry, or any new write path | `hooks/useBridge.ts` |
| [performance notes](docs/performance.md) | **anything that reaches a memoized row** — props on `Row`, `SongHeaderRow`, or callbacks from `App` | `components/ClipGrid/Row.tsx`, `SongHeaderRow.tsx`, `App.tsx` |
| [layout and CSS](docs/layout-and-css.md) | any stylesheet, a token, or a `z-index` | `src/shared.css`, `App.css`, `components/Control.css` |
| [dev server](docs/dev-server.md) | the dev loop, HMR, or the provider/App boundary | `src/main.tsx`, `components/BridgeProvider.tsx`, `vite.config.ts` |

Cross-cutting: **performance notes governs every component under `ClipGrid/`** regardless
of which feature you came for — a prop that changes identity per render re-renders 848 rows.

The matching domain logic is in [`core/`](../core/README.md); it has its own index.

## Files

```
index.html            vite entry
vite.config.ts        build target + dev proxy
src/main.tsx          root — wraps App in the bridge provider
src/App.tsx           the composition root — hooks in dependency order, wiring
src/shared.css        design tokens, global reset, shared fields and primitives
src/App.css           app shell, empty state and log
src/components/       one component per file
  *.css               component styles, imported by the component that owns them
  BridgeProvider.tsx  owns the connection, above App — see docs/dev-server.md
  Control.tsx         shared button, group, select and grouped-field primitives
  ClipGrid/
    ClipGrid.tsx      scenes × tracks — colgroup, sticky header, group bands, the tbody
    Row.tsx           one scene's row, memoized
    SongHeaderRow.tsx a song block's header row, memoized
    constants.ts      surfaces, contrast ratios, shared empties
    dropEdge.ts       which edge of a row a scene drag's drop line lands on
    TrackStatus.tsx   Live's Track Status Display, over the stop button
    TrackMeter.tsx    a track's meter column — level, fader and its controls
    TrackSends.tsx    one track column in the naturally sized sends section
    useMeterResize.ts makes the meter row's top border resize its height
  Header.tsx          Live control bar, Arrangement position, playback, view controls
  Icon.tsx            compact-control glyphs, as inline SVG
  StatsBar.tsx        bottom status — readiness, stat tiles, key hints + log toggle
  Stat.tsx            one tile
  Rail.tsx            the rail's chrome; App nests the panels inside it
  SongIndex.tsx       browser-style left pane; song facts + jump navigation
  ScenePanel.tsx      song/tag/bpm/key fields, the role picker, song color
  Inspector.tsx       rename pattern, clip color, role→color, apply
  ColorSelect.tsx     current color closed, the palette in a popover open
  SwatchGrid.tsx      the palette as clickable swatches, shared by every picker
  RoleMenu.tsx        the picker that hangs off a scene's role chip
  SetConfigModal.tsx  set-owned naming defaults + role definitions
  SongsModal.tsx      what the app read back out of the set — read-only
  ReorderModal.tsx    the running order — drag songs, apply once
  NewSongModal.tsx    plan and create a new song's scenes
  SyncModal.tsx       blocking feedback while the snapshot behind the grid is replaced
  TagChip.tsx         the outlined song-tag pill — song headers and the reorder modal
  RecolorModal.tsx    coloring every song from a rule
src/hooks/            one hook per file
  useBridge.ts        React face of the client; composes the two below
  useBridgeSession.ts the context App reads it back out of
  useLog.ts           the shared say sink
  useDeviceState.ts   default artist, roles + allowed colors stored in the Live device
  useSnapshotLookups.ts  the lookup Maps every other hook reads
  useTrackColumns.ts  rendered column order + group collapsing
  useViewportColumnWidth.ts  Auto and 8/16-bank widths from the grid viewport
  useSongLayout.ts    derivation, song folding, folded-header shapes
  useGridSelection.ts both selections + the active cell (and its ref)
  useGridKeyboard.ts  the window keydown effect
  useSceneDrag.ts     drag state + the move plan (and its ref), for both grips
  useClipDrag.ts      the same, for dragging clips between slots
  useRailAndLog.ts    rail/log visibility, error-opens-the-log
  useSceneTitles.ts   TitlePatch, rename + tempo ops
  useSongColor.ts     song-scoped coloring
  useColorRules.ts    the allowed colors, and coloring every song from a rule
  useVocabulary.ts    merged vocabulary, in-use keys, roleColors
  useRoleAssignment.ts  role writes + the floating menu's state
  useClipInspector.ts clip color + rename pattern
  useMeters.ts        the high-frequency meter stream, as an external store
  useMixer.ts         mixer strip state over that store
  useCloseOnEscape.ts / useDismissOnScroll.ts /
  useAnchoredPosition.ts / useMenuKeyboard.ts   generic overlay behavior
src/lib/
  client.ts           typed WebSocket client, framework-free
  selection.ts        clip addressing + selection set
  keys.ts             the launch modifier, and who owns a keystroke
  columnWidth.ts      fixed + viewport grid widths, arithmetic and persistence
  songIndexColumns.ts which index columns are shown, and how wide that makes it
  allowedColors.ts    one-time migration from the old localStorage setting
  rowMarks.ts         play state flattened to memo-safe strings
  snapshotTiming.ts   the console phase breakdown + error text
  mixerStore.ts       the external store behind the meters and the mixer
  meterScale.ts       dB range, ticks, and Live's normalised meter position
  liveParam.ts        a Live parameter read into widgets/'s model of one
```

## The one dependency pointing out of the app

`ui/` reaches into [`widgets/`](../widgets/README.md) for the controls a DAW is made of —
today just the drag and the local-value hold behind the mixer's volume, pan and sends.
That direction is one-way: **nothing in `widgets/` may import from here.** `liveParam.ts`
is the whole boundary, and everything Live-specific about a control stops there.

Pure helpers under `src/lib/` can have colocated Vitest coverage. `npm test` runs those
alongside the core suite without requiring a browser or Live.
