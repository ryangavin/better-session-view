# Archived design-system export

`ds-bundle/` preserves the existing `bsv-widgets@0.1.0` design-sync export as a
reference artifact: bundled components and local React runtime, usage/type references,
styles, preview pages, screenshots and build/render metadata. Its original export
README describes how to open those previews. The captured render report marks Meter
and Widget previews as blank; this archive records that state rather than claiming a
fresh successful visual verification.

This directory is not a package, npm workspace, or runtime dependency. Current widgets
source lives in `openflowfm/widgets`; the application consumes `@openflow/widgets` at the
commit pinned in the root package manifest. Do not develop widgets in this archive.

The obsolete bench build, local story map (which embeds a machine-specific source path),
and design-sync recompile marker remain ignored. Source/build hashes and captured
preview evidence are retained as provenance for the archived export.
