# `newSong.ts`

Set-owned validation and scene-creation planning for the New Song dialog. The helper
returns scene additions without performing a write. It uses the same title formatter
as Set's scene editor and the bridge model's song identity and tempo limits, so a new
song reads back through the existing naming convention.

Protocol scene-addition types come from Set's explicit `protocol/global.d.ts` tsconfig
include. Runtime execution still belongs to the bridge; this file only builds the plan.
