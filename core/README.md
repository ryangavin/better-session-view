# core/

Remaining shared music and display helpers. Session-model ownership lives in
[`bridge/model`](../bridge/model/README.md); Set-only editing and grid helpers live in
[`set/src/lib`](../set/README.md). Pure functions are tested where they are owned.

| source | topic |
|---|---|
| `src/color.ts` | [RGB, luminance, contrast and text colors](docs/color.md) |
| `src/chords.ts` | [Note names, key spelling and degree colors](docs/chords.md) |
| `src/trackStatus.ts` | [Playback display calculations](docs/trackStatus.md) |
| `src/livePalette.ts` | The checked-in 70-color Live palette shared with Chart and the verification tool |
| `src/index.ts` | Existing color and palette exports |

These helpers perform no I/O and import no React or bridge runtime. `trackStatus`
uses protocol types supplied by the explicit global declaration include in its tsconfig.
The Live palette remains here pending a separate ownership decision.

Run `npm test -- --project=core` from the repository root.
