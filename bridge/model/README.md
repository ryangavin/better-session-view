# Bridge model

`@openflow/bridge-model` contains the bridge-owned pure session model and edit helpers.
The bridge uses these to maintain the authoritative snapshot; Set uses the same source
for optimistic updates and scene editing. No helper may import Node, Max, WebSocket,
React, Set, or the bridge runtime. Import individual TypeScript sources by package name,
for example `@openflow/bridge-model/derive.ts`.

Only this dependency-free nested directory is an npm workspace. The parent `bridge/`
remains excluded and keeps its own `node_modules/ws`; importing this package cannot
load `bridge.ts` or `lom.ts`. npm links this package at the repository root, where both
Set and the bridge resolve it normally. No bundler aliases or copied sources are needed.

The package's no-emit tsconfig explicitly includes `protocol/global.d.ts`: model shapes
still use the ambient `OpenFlow` namespace. This is a source package inside the current
repository, not a standalone declaration package with an implicit protocol dependency.

| source | topic |
|---|---|
| `src/clipMove.ts` | [clipMove](docs/clipMove.md) |
| `src/derive.ts` | [derive](docs/derive.md) |
| `src/namePattern.ts` | [namePattern](docs/namePattern.md) |
| `src/ops.ts` | [ops](docs/ops.md) |
| `src/roles.ts` | [roles](docs/roles.md) |
| `src/setModel.ts` | [setModel](docs/setModel.md) |
| `src/snapshotDelta.ts` | [snapshotDelta](docs/snapshotDelta.md) |
| `src/songRows.ts` | [songRows](docs/songRows.md) |
| `src/songTags.ts` | Open song-tag syntax and editor suggestions |

`songRows` currently includes both shared song facts used by `setModel` and pure grid
presentation helpers used only by Set. Keeping the existing module together preserves
behavior and avoids a Bridge → Set dependency; splitting facts from presentation can
be a separate change. Browser consumers bundle only their imported helpers.

The tests are colocated and run in `npm test -- --project=bridge`. Bridge-only policy
helpers and their tests live in `bridge/src`, not this package. The LOM remains a script
with no imports and requires verification in Live; these tests do not exercise it.
