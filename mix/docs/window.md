# The window

`mix/src/`. The layout, where the design language comes from, and which controls are
`@openflow/widgets` rather than this app's.

A library on the left and the open track to the right of it, under one header. It came
from an interactive mockup that had already read `set/src/shared.css`, so the tokens were
ours before the layout was — what follows is where it deviated and why.

**There is a hint strip and no status bar.** The strip runs along the bottom of the
centre column, level with the library rail's own footer so the bottom of the window reads
as one band, and it says in a sentence what the pointer — or the focus ring — is on. It
is `HintFooter` from `@openflow/widgets`, and it works off `data-hint` where a control
has one and the control's `title` where it does not, which is why most of this window
explained itself the day it was mounted. See
[widgets/docs/catalogue.md](https://github.com/openflowfm/widgets/blob/main/docs/catalogue.md#what-explains-a-control) for
the precedence rule and why the hovered sentence never reaches React.

At rest it reads *Point at anything to read what it does.* rather than going blank: an
empty band at the bottom of a window reads as something unfinished, and the one line it
can say is what tells a newcomer the band is worth watching.

It lives inside `.mf-centre`, so **Play has no strip** — the four-deck layout is a
sibling of that column rather than something inside it, and a strip spanning the library
as well would stop being level with the rail's footer.

**There is no right rail**, and that is not a deletion so much as three
things finding better homes. The track's name is in the header, where a window says what
is open. The mix summary is in the band above the lanes, beside the buttons that change
it. The slice list is in the export dialog, which is the moment anyone actually names a
slice — a list that sat open all session was eight rows of chrome competing with the
lanes for a job nobody was doing yet. Two columns instead of three buys the lanes nearly
three hundred pixels, which is what they are for.

## Prep and Play

The app starts in Play with Play selected in the header.

The left-aligned Prep/Play segmented control immediately to the right of the logo switches
between single-track stem preparation and the four-deck DJ mixer. Exactly one button is
selected; the logo stays static with no view-dependent highlight. Plain Tab also switches views. The library rail stays the same, and both preparation
state and loaded deck settings survive switching. Editable controls and dialogs retain
normal Tab navigation. Tracks load exclusively by dragging from the library onto deck strips or waveform rows. The header centers the playback controls, tempo and position in both Prep and Play across the
available center region, with the logo and track identity on the left and Settings on the right. Play distributes its logical transport, timing and audio groups evenly across that region; joined controls stay together and the center can scroll horizontally when necessary. Track editing, Snap, Analysis and Export stay in Prep. See [play-view.md](play-view.md) for ownership,
loading, keyboard behavior and the current playback boundary.

## The library rail

The rail's right edge is a drag handle: pointer or arrow keys, from 190px up to the
available body width minus one 260px deck viewport. `useLibraryResize.ts` reads that
limit from the shared `--mf-deck-min` token and keeps the separator's accessible bounds
in step with its actual size. The DJ grid retains its minimum deck widths and scrolls
horizontally inside its own area when the library takes more space.

The chosen width is kept in the session. CSS temporarily caps it to the available space
without overwriting the saved preference. Until it is dragged the stylesheet's own width
stands, so the handle costs nothing to ignore.

The rail starts with a compact row: filter, the shared **↻ Reset filters** icon
(when songs are present), **Recent**, then **Import**. The 24px reset button keeps
its accessible name and tooltip without a text caption. Reset and Import use shared Buttons and Recent uses the shared Toggle, all at the header control height; disabled actions dim only once. The reset keeps the same disabled
state and clears text, artist, album and key together. Search can shrink to 80px;
at very narrow rail widths this toolbar scrolls horizontally rather than clipping controls. Import
opens the ordinary multi-file picker; dropping a YouTube video link anywhere on the window
imports its audio. There is no URL field or Fetch button. Imports disable while another
import is in flight, and the rail footer changes from the folder name to the result or the
useful error.

### Artist, album and key browser

Three side-by-side native listboxes sit below text search: **Artists**, **Albums** and **Keys**.
Each has a bounded 112px scroll area and an **All** entry. They use distinct trimmed,
case-insensitive stored metadata values, with full collaborator credits kept intact.
Missing metadata appears as **Unknown artist** or **No album**, both selectable.

Artist lists the whole library. Selecting it clears album and key choices and narrows Albums
and the table to that exact credit. Selecting Album narrows the table and available Keys
further. Keys uses the saved manual-aware shortlist; Unknown remains selectable. Text search
then applies to those songs, and the table retains its chosen sort and column order.
Lists remain stable while typing, so a text query with no results never hides the way out.
**Reset filters** clears text, artist, album and key together; the text field's ×/Escape clears
only text. Native arrows and type-to-select support keyboard browsing.

These browse choices last for the current window; changing library roots clears them.
A selected value removed by a metadata edit falls back to All. `browseLibrary` in
`listing.ts` derives choices and song results from one library snapshot. No new metadata
inference or key detection is involved, and the song table remains flat.

### A sortable song table

The library is a flat table starting with **Artist**, **Album**, **Song**, **BPM**,
**Key**, **Analysis**, and **Stems** columns. Each 32px
row is one song, with a 22px thumbnail beside its title even when neighboring rows share
artwork. Missing artwork uses the title initial; missing artist or album displays a dash.
There are no group headings, collapse state, indentation, or vertical rules through song rows. Thin separators divide only the column headings.
Alternating rows use a quiet blend of the theme's panel and cell surfaces across the full
table width, including offscreen columns. The stripe follows displayed row position after
sorting or filtering; hover and selection replace it with their stronger existing states.
The sticky column header labels only the values below it, with a slightly lighter surface and UI text color for contrast. A shared `colgroup` keeps
header and row widths aligned; the table's width is their sum, with horizontal scrolling
inside a narrower rail. Defaults are Artist/Album 100px, Song 216px, BPM 64px,
Key 152px, Analysis 80px and Stems 60px (772px total). Long values truncate with
full text on hover. Resizing a column changes only that column, not the rail or filters.

Drag the right edge of Artist, Album, Song, BPM or Key to resize it. Analysis stays
80px and Stems 60px: both remain reorderable, but have no resize handles or keyboard
resize targets. Their old saved width overrides are ignored on load and storage
updates; other saved widths and column order remain intact. The separate 7px handle has a resize
cursor and focus highlight; the label retains click-to-sort and drag-to-reorder.
Focus a width handle and use Left/Right for 8px steps; Home or double-click restores
that column's default. The hover hint explains both controls. `ColumnResize.tsx` captures
the pointer through the gesture and isolates its events from native header dragging.
`useLibraryColumnWidths.ts` defines defaults and minimums (room for header labels,
artwork and analysis controls), caps widths at 1200px, and saves every adjustment
immediately in `mixflow.library-column-widths.v1`, independently of order and audio
session writes. Widths follow stable column IDs through reordering and reopening;
missing/new columns use defaults, removed IDs are ignored, and invalid values are
repaired. Same-origin windows adopt saved widths without echo writes. Storage failures
retain usable in-memory controls. Song rows are memoized so local width updates only
change table geometry, without rebuilding artwork and waveform row contents.

Click a column to sort alphabetically; click the same column again to reverse its primary
order. The arrow and `aria-sort` identify the current column and direction. **Artist**
is the default, with **Album**, then **Song** as ascending tie-breakers. **Album** breaks
ties by Artist then Song; Song breaks ties by Artist then Album. Leading “The” is ignored,
case is ignored, and numeric names sort naturally. Missing metadata stays last in either
direction. **Recent** above the table starts with newest imports first; another click
reverses it. Sort column and direction survive reloads. Old saved collapse keys are ignored.

Drag a column heading onto another heading to move it into that position. A grab cursor
and an underline on the target show the interaction; completing a drag never sorts the
rows. Click a heading to sort as before. Focus any heading and use **Alt+Left/Right** to
move it from the keyboard. There is no Columns menu. Each move saves immediately in
`mixflow.library-columns.v1` local storage, separately from the delayed track session,
so the arrangement survives reloads and app reopen. Existing session orders migrate
without resetting valid positions; unknown or duplicate fields are removed and new
fields are added without reordering the others. Windows on the same origin adopt
the latest saved move; desktop and dev-browser origins keep independent preferences.
Artwork moves with Song. Header drags use their own payload and cannot load
a track onto a deck. Key uses the displayed manual-aware summary, sorts alphabetically,
and keeps Unknown last in either direction. It is inserted after BPM when migrating
an older column order, preserving every existing relative position. BPM sorts numerically by saved average tempo; Analysis and Stems
are display columns whose headings can still be moved.

`src/listing.ts` sorts the full stored artist string, without interpreting collaboration
credits or constructing artist identities. The Artist cell therefore says exactly what is
stored. Sorting and filtering do not rewrite library metadata.

The quick filter matches every whitespace-separated word across title, full artist credit
(including collaborators), and album, without regard to case. `flowdan quest` can therefore
find a collaboration on Quest For Fire. Filtering preserves the chosen sort; **Escape**
in the field or **×** clears it. The footer shows the matching count against the total.

**BPM** shows the saved measured tempo or range; a dash means no reading. Hover explains
grid readiness. **Analysis** shows only a 68×18px whole-song waveform folded from the
existing original-audio scan. A missing or invalid original scan shows a dash, even if
stem scans exist; it never invents a full mix by adding unrelated stem extrema.

**Stems** is a separate reorderable column, initially following Analysis. It shows only
available sources as 6px colored tiles in `STEMS` order: four sources form a 2×2 square,
six a 3×2 grid. One, two, three, or five sources use only their actual tiles; no missing
source placeholders are drawn. Zero sources shows a dash. Tooltips and accessible
labels name the sources. Both waveform and tiles occupy fixed centered 18px areas in
their own cells, so waveform-only, stems-only, both and neither cannot share a visual
stack with the neighboring song. Adding Stems to an older column arrangement places it
after Analysis without moving the person's other columns.

`LibraryAnalysis.tsx` requests the existing `analysis.scans` cache only when a cell becomes
visible, with at most two disk reads in flight. `libraryOverview.ts` reduces its min/max
bins to the miniature and averages each column’s saved low/mid/high energy. The shared
`spectralPainter` uses the current waveform palette and strength, repainting on theme
changes without rereading the cache. The library has no deck identity, so its miniature
always uses frequency paint. It never fetches audio, decodes, measures, or writes a cache. Root or
track replacement clears the view and ignores stale results. A successful scan save emits
`openflow:scans-changed` with the library root and track ID after atomic publication.
`scanChanges.ts` shares one IPC listener across mounted rows and notifies only the matching
track. A visible row rereads through the same two-read queue; an offscreen row waits until
visible. Notifications during a read coalesce into a fresh read, and obsolete results
cannot overwrite it. No polling or remount is needed. Pending, missing and failed cache
reads have distinct accessible descriptions; all keep the existing dash until real data
arrives. Full preparation
facts remain in the row's hover detail and bottom hint strip.

Click anywhere on a row to select the Prep track; the Song button also supports keyboard
selection. Drag any row onto a Play deck's strip or waveform to load it. The drag contains
the same stable track ID in every order and search result; loading still never starts playback.

## The header

Header and beat-grid button groups use the shared widgets control-group surface,
including its active and focus states. Their 2px outer corners match ordinary
buttons and album artwork through the palette’s single `--radius` token. Joined
internal corners stay square; circles and pills retain their shape.


The bar uses 22px controls with 6px above and below, plus its bottom divider. The
logo, track identity, grouped controls and standalone actions share one vertical center.
Clicking the title or artist opens Track Details; Snap uses a magnet; Edit beat grid a grid; Warp horizontal
stretch arrows; Export an arrow leaving a tray; Settings a gear. Every icon action keeps
its accessible name and a descriptive tooltip. Title, artist, tempo, position and status
remain text. Prep and Play keep their transport centered across the full window, using equal-width
side columns. Track identity yields by ellipsis on the left; editing actions and the
joined Debug/Settings group align right.

The title and artist share a keyboard-accessible button that opens Track Details;
renaming happens there alongside the album and cover. The header text truncates when
space is tight. The button is disabled during beat-grid editing. Link Audio and Local audio are two icon toggles — two rings, a speaker — with
their names in the tooltip. The centered controls form three separate compact groups:
Transport holds play/stop, Prep's loop, tempo and position; Timing holds Play's launch
timing, marker quantization and quick-loop length; Audio holds Link Audio and Local
audio, followed by Prep's conditional Link pins and the Link status reading. Each group
has its own outline, with a small gap between groups. Timing appears only in Play;
all controls retain their existing availability and behavior. The Link reading is left
out entirely when it has nothing to say, since an empty child still takes a divider.

**Link Audio** shares the loaded stems as separate stereo inputs in Live. It starts off
on every window load. The adjacent text reports connecting, discovered peers, capture
gaps, or an unavailable publisher; the tooltip supplies the output names or error.
No peers is a valid enabled state. Link also synchronizes playback: the tempo field
shows and changes the shared BPM (20–999), Warp stays on while linked, and starts show
**waiting for bar** until their scheduled phase. Stop and Pause are immediate. New
remote start/stop commands are followed when the peer also enables Start Stop Sync;
joining an already-playing session does not start this app. See [link-audio.md](link-audio.md).

**Link pins** appears while linked: **4 bars** by default, with **8 bars**,
**16 bars**, and **Sections** choices. It controls how often playback is held to
Live's grid while linked, keeping the original feel between pins. Section boundaries
always align. It is its own choice, apart from the export dialog's loop length —
under Link the question is how tightly to follow the room; at export it is what the
files are for — and it lasts for this window session.

**Local audio** controls only the computer's speaker output. Enabling Link Audio turns
it off, and disabling sharing or a publisher failure turns it back on. It can be
overridden while sharing, without changing any Link feed.

The Electron window opts out of background throttling, using both `switches(app)` and
`throttle: false`, because publishing must keep running when Live covers the mix window.

Playback keeps the transport, target tempo and clock; Snap governs timeline gestures.
**Grid** opens the one mode for asking whether the song is right, over the lanes:
beat handles, bar 1, **Find beats** with the algorithms and the full analysis in its
**▾**, the drums under a click on Space, and the section changes the stems suggest as
dashed cuts on the ruler — one row of groups named the way the header names snap. Done
or Enter keeps, Cancel or Escape abandons, and they are its only way out. Beside it the header says the tempo the beats run at — a range where the record
moves — and nothing about how it was found: agreement and the algorithm's name are the
debug workspace's. Warp controls playback, not editability. **Details** beside the
title opens what the track is: name, artist, album, art, and the model that made the
stems with Separate again. There is no Analyze page any more; what it did that was
worth keeping is in the mode, and what it asked that a person was not asking is
behind the bug button.

The title yields by ellipsis rather than wrapping the header. Engine faults still
appear only when there is something wrong.

## Before there are stems, and the details after

`TrackAnalysis.tsx` is the page a track opens on before it has stems: the details, the
model cards and Generate stems, and nothing else, because nothing else can be drawn
yet. Separation runs only on an explicit press. Once a track has stems it opens on the
lanes and stays there.

`DetailsModal.tsx` brings the same form back over the mixer, from **Details** in the
header: title, artist, album and cover, the model that made the stems preselected, and
**Separate again**. Starting a separation closes the dialog and the job's own screen
takes over. It is a dialog rather than a page because none of it needs the waveforms.

## The grid, over the lanes

**Grid** in the header opens `BeatGridEditor.tsx` above the actual mixer lanes. Beat
handles appear only in this mode, independently of the Warp playback switch. The header's
tempo readout stays through the mode and follows the draft, and the editor's own status
reads the draft's tempo range and how many of its beats the kit confirms — see
[track-review.md](track-review.md). A marker on
a downbeat is a bar marker and dragging it stretches the grid: the beats since the last
point a hand set — bar 1 until a hand has set a nearer one — keep their count and their
relative spacing across the new span, and the beats after come along by the same
distance, so a steady grid whose tempo is a fraction off is one drag of its last bar
onto its hit. Every other marker is a beat marker and dragging it moves that beat alone.
The map remembers the beats a hand set (`Beats.set`, saved with the grid) so the next
pull stretches from the last one. Arrow keys do the same as a drag on a focused marker
by 10 ms, or 1 ms with Shift; dragging snaps to nearby hits unless
Option is held. Command while dragging any marker moves every beat by the drag
(`shifted`), for a map that is right and early by a constant — the marker still snaps
to its hit; that replaced a pair of ±10 ms buttons. **Here**, in the `bar 1` group, makes the beat
nearest the playhead bar 1, moving that beat alone onto the kick or snare it is nearest
when one is within a quarter of a beat, and renumbering only otherwise or with Option
held — it used to shift every beat to the playhead, which dragged a good detection off
its hits; **‹** and **›** beside it renumber one beat either way. Clicking the tempo in the status
turns it into a field for typing a steady tempo, which discards tempo variation at that
BPM from bar 1's downbeat; Escape or blur returns the reading. Beside it, ×2, ÷2, ×3⁄2
and ×2⁄3 re-count the same beats at that rate, keeping the detected variation and bar 1
on its hit — `retimed` in `warp.ts`, for a detector that heard the wrong pulse. **Find beats** runs the chosen
algorithm on the drums — what an import runs, unless another is picked — and draws the
result as the draft; Undo puts the old grid back. Its **▾** is a `Select` drawn as the
caret alone: the offered algorithms, the chosen one marked, and **Advanced…** last,
which opens the debug workspace on the beat analysis tab, `state.openDebug('beats')`,
the same modal the bug button opens. That is where a picker on the main row and an
**Advanced…** button beside it went. **Worst bar** seeks and zooms to the
bar reading furthest off its hits, the next-worst on each press, and the warp lane
shades every bar by that reading; its tooltip carries Space and Home, which is where
the mode's instruction paragraph went, the rest of it being what the markers and the
ruler's dashed marks already say in theirs. Space plays the drums under a click at original speed from the playhead to the
end of the stem, the lanes' playhead moving with it, and Space stops it; so does a
correction, main playback, Cancel or Done. `App.tsx` leaves Space to the editor while
the mode is open. It replaced a *Listen with click* button that played four bars.

While the grid is open the ruler offers the section changes the stems suggest —
`sections.ts`, read off `measure()` against the draft grid, so they move with a beat
that is dragged — as dashed marks with their reason. Click one to cut there; leave it
and it is nothing. Cutting, dragging and naming sections keep working with the grid
open. See [track-review.md](track-review.md) for measurement, thresholds and
persistence.

`beatEdit.ts` holds the draft apart from saved `beats` and `offset`. The drawing and mixer
read the draft, but library/session persistence reads only the saved state. **Undo** restores
one action, grouping each pointer drag into one step; Command/Ctrl-Z does the same.
**Cancel** (or Escape) abandons the draft, and **Done** commits it through `saveReview`.
Switching tracks or reloading abandons unfinished edits. Done with no edits preserves the
original map and detector reading. Export is unavailable until Done or Cancel. The header
tempo controls playback and preserves source beat positions.

Metadata remains in `Details.tsx`, committing on blur and reverting with Escape. The model
cards report useful source/speed tradeoffs, not scores. Successful separation follows the
existing path to the mixer; beat review can be reopened with Analyze.

The debug workspace is opened by the bug icon joined to the Settings gear at the right
of the header, in both Prep and Play. `DebugButton.tsx` exports the button and its modal;
App hosts the modal outside the header so header styles do not affect the workspace.

## The lane head is 88px, and that is the whole layout

Every row's drawing starts at the same x, so a transient in the drums lines up with the
one in the bass. That is the only reason the head is a fixed width rather than a
fraction, and it is why the band above the lanes carries a head of its own — it holds
the mix summary and the two buttons that change it, and it exists as much to reserve
that column as to say anything.

**The head is a strip, not a row, and that is what buys the width.** A lane is a few
dozen pixels tall and only ever a couple of hundred wide, so height is the dimension
there is spare of: laid out sideways the fader spent 46px of the scarce one to buy 46px
of travel. Standing up it takes the whole of the leftover height and the whole of the
column's width, with the stem's name and its trim on the line above and mute and solo
side by side on the line below — the thing in the head you cannot miss, and the thing
you cannot fail to hit. There are six stems at most, so no number of them ever squeezes
a lane to where that stops working.

The names are fixed — Vocals, Drums, Bass, Guitar, Piano, Other — so the column is
sized to the longest of the six and nothing else, which is why it can be this narrow. It
is the band head above that is hard to fit rather than the lanes: it carries the actions
for the whole mix, so its zoom readout and its Reset each take a line of their own with
a small button beside them, and the model's name truncates rather than push anything
out. The count of audible stems used to sit there and no longer does — with mute and
solo drawn this large in every lane, `4/6 audible` was restating what the strip already
says.

Its length is CSS's, because how much height the lanes have to divide is not known until
they have been laid out. What has to come back the other way is how long it turned out:
`Slider` gears its drag to `travel`, and a rail drawn taller than the travel it was
geared to is a thumb running ahead of the pointer. A `ResizeObserver` on one lane's rail
answers for all six, since they are all the same height.

A lane at 68px is the density that lets you *see* an arrangement — a breakdown is a
block where the drums stop, and a fill is a darker column you can point at. Clicking any
lane moves the head there: a waveform is what you are looking at when you decide where to
listen from, and reaching back up to a strip at the top to act on it is the sort of gap
that makes a window feel like a diagram of a DAW rather than one.

**A lane reads as its own object rather than as a row of a table.** Three things do
it, and they are the same three a mixer does it with. The separator between lanes is
`--bd`, the border the rest of the window uses, rather than a shade barely off the
background — a hairline you have to look for is not separating anything. The head
column has a surface of its own, so the boundary between a stem's controls and its
drawing is an edge rather than an alignment. And the head carries the stem's colour
as a bar across its top, with the drawing behind the waveform shaded in the same —
which is what makes the stack scannable at a glance: you find the bass lane by its
colour, not by counting rows.

The bar was a stripe down the left edge, and before that a dot beside the name. All
three said the same thing; the top of the strip is where it now sits, because a
narrow head is a column and a column is capped rather than fenced.

**The lane is shaded in blocks, not washed evenly.** Every other cell between the
grid's dividers is lifted, in the stem's own colour, so a phrase reads as a shape
rather than as the gap between two brighter lines — the thing that tells you where
you are when the waveform itself is a wall. The blocks never go finer than a bar
however far the ruling subdivides: alternating sixty-fourths is a zebra, and by the
time you are that deep the bar is what you are trying to see the hit against.
`grid.ts` decides both, so the lanes and the warp lane above them cannot disagree about
which block is lit.

**A lane nobody can hear says so.** Muted, or lost to somebody else's solo, and the
bar goes to `--idle`, the shading all but goes, and the name drops to caption grey. The
waveform was already dimmed; this makes the whole row agree with it, so *what am I
hearing* is answered by the shape of the stack rather than by reading six toggles.

**46px is the floor, not the height.** The lanes share whatever the window has, so a
four-source separation gets the room a six-source one would have used rather than four
rows and a hole underneath them. `Waveform` takes no height when the lanes draw it and
measures the box it was given instead — how tall a stem is depends on how many stems
there are and how tall the window is, which is a question CSS answers better than a
component can. Once the lanes reach 46px the list scrolls rather than going below it.

**Tablature unfolds from Bass rather than living as another track.** The Bass name is its
disclosure: when it is closed the extra row does not exist and Bass is visually identical
to every other stem; hover or keyboard focus reveals the affordance. Open, a continuous
bass-coloured edge and an indented head make the tablature a child of its audio lane. It
is a standard four-string EADG instrument; its head owns Transcribe, Cancel and Reveal.
Its body draws every MIDI note on a string at its exact onset. The fret number is plain,
large monospaced ink interrupting the string; its pitch class chooses that ink, so every C
is red across every octave. Duration is only a quiet one-pixel underline, and vertical
ruling stops at bar lines. At whole-song width every duration remains but colliding numbers
thin; zooming earns each number back. It shares the waveforms' view, grid, playhead,
paging and click-to-seek rather than being a separate document pasted over the bass
waveform. Changing songs folds it away. The worker and fret-path rules are in
[`transcribe.md`](transcribe.md).

Once notes exist, `−8va / 0 / +8va` corrects their octave. It is a layout of the cached
detections rather than another inference: the view moves immediately and the MIDI and
text tab on disk are rebuilt to agree. The string drawing is the shared
`@openflow/widgets` Tablature; this file only adapts mix[flow]'s fret path and timeline
into it.

## There is a lane per stem the model made, and no others

A four-source model folds guitar and piano back into Other. The lanes used to draw all
six regardless, with the two it did not have greyed out and captioned *folded into Other
by demucs ft · 4* — which was honest, and was still two rows of a screen spent on a
control nobody can use, on every track, for a fact that does not change while you are
looking at it.

A lane is on screen the moment the manifest says the model made that stem, which is
before any audio has been read — so opening a track lays out the right rows immediately
and fills the drawings in as each stem decodes, rather than showing captions and swapping
six of them for canvases a second later. The outgoing track's drawings are dropped when
the new one is chosen, because a second of the last song under this song's name is worse
than an empty lane. A lane takes its samples only once its own peaks are there:
`engine.ts` still holds the *previous* track's buffers until the new set is complete, and
a lane that reached for them would draw the song you just left.

**The fact belongs to the model, and the model is already on screen** — named on this
band, and described at the point where somebody chooses it, which is the moment the trade
is actually being made. Wanting guitar on its own means choosing another model in **Analyze**, below the song review.

The library summarizes available stems as colored tiles in its Stems column. Hovering the
tiles names them; missing stems do not add empty lanes to the open track.

`Reset` counts against the stems the song has rather than against all six, so a level
left behind by an earlier separation with a six-source model cannot arm a button against
something nobody can see.

## Zoom, and why the canvases do not grow

The lanes draw the whole track by default, which is right for finding a breakdown and
useless for finding a downbeat: four minutes across nine hundred pixels is a quarter of a
second per pixel, so a kick and the snare after it are the same column.

**Scroll over the lanes zooms; ⇧-scroll pans.** Zoom stays anchored under the
pointer. Shift with a vertical wheel moves back on down and forward on up;
Shift with a sideways trackpad swipe pans in that direction. ⌘/Ctrl-scroll and
trackpad pinch still zoom. The lane list's scrollbar reaches rows in short windows.

**Hold the middle mouse button to cruise around.** Drag up to zoom in, down to
zoom out, and sideways to pull the audio with the pointer. Both axes work together.
Pointer capture keeps the gesture alive outside the lanes; release, cancellation,
lost capture, window blur and track changes end it. The gesture intercepts the
press before lane controls can seek or edit, and suppresses browser autoscroll.

Three things make it feel like a timeline rather than a picture being resized:

**The zoom is anchored on the pointer.** What is under it stays under it. Zooming about
the centre is why so many timelines need a pan after every zoom.

**The playhead is followed by the screenful, not by the pixel.** Rolling continuously
under a stationary head makes the picture unreadable, and the point of zooming in was to
look at something. It pages when the head leaves the view, and only while something is
playing — a view somebody has just set by hand is not dragged off by a stopped head.

**The canvases stay the width they are on screen** and draw the slice they were asked
for. The obvious implementation — a span as wide as the zoom, scrolled — is six canvases
of a hundred million pixels, which no browser will lay out and none of which anybody is
looking at. `zoom.ts` holds the two numbers everything on the timeline maps through: how
far in, and where the left edge is. None of it is written down; where you had scrolled to
is not something a window owes you back after a reload.

## It goes all the way to the samples

The bottom of the zoom is the point past which magnifying stops revealing, and for audio
that point is exact: **there is nothing under a sample.** So that is where it stops —
sixteen samples across a lane, a hand's width apart, drawn as points with the line
between them. That is the sample editor's view, where a point is a value you could nudge
rather than a dot in a line, and it is the last honest stop: past it the points keep
separating and no more audio arrives, which is the same lie a magnified peak drawing
tells at the other end.

That makes the ceiling a property of the *track* rather than a number of times, which is
why `limitOf` takes seconds and a rate. A limit written as a multiple would mean
something different for every song: sixteen times a four-minute track is fifteen seconds,
and sixteen times a two-bar loop is a bar. What is fixed is the view at the bottom of it.
A four-minute track is most of a million times deep, so the wheel curve is set by the
range it has to cross — a gentler one is a dozen swipes to reach a bottom nobody would
find.

## And out past the song

The other end goes past the track filling the lane, to a quarter of it. Fitting exactly
is the obvious floor and it is the wrong one: a shape is easier to judge with air around
it than jammed against both walls, and a song that ends on the last pixel gives no way to
see that it ends.

Out there the arithmetic changes hands. Zoomed in, the window slides along a track wider
than itself; zoomed out, the *track* slides inside a window wider than it, between flush
left and flush right. Both are one clamp — `1 - 1/zoom` is where the left edge sits when
the right edges line up, and which side of zero that falls on is the whole difference. It
also means the song cannot be scrolled off screen out there, which matters because there
would be nothing else to find it by.

**What is outside the song is drawn as outside.** The grid keeps ruling it and the warp
lane keeps numbering it — downwards through bar 1 into 0, −7, −15, the way an arrangement
does — with a wash over it and the first and last bar as its border. Numbering is what
makes it read as somewhere rather than as a margin. The wash is *lighter* than the lanes
rather than darker, which is the opposite of Ableton and is forced: this window is
already nearly black.

**Which drawing you are looking at is a measurement, not a setting.**
[`playback.md`](playback.md) has it: a lane draws peaks while a column of them is finer
than a pixel, the samples themselves once it is not, and a line through the points once
there are fewer samples than pixels. The zoom readout says how much *time* the lanes are
showing — `3:52`, `12s`, `4.4ms`, and more than the song's own length once it is zoomed
out past fit — because at these depths a number of times is arithmetic and a length of
time is the answer to the question.

## The grid, and the two ways of setting it

The band above the lanes is two strips over one timeline. The **slice ruler** is what you
navigate by, and the **warp lane** underneath is where the grid meets the audio: bar
lines are the grid's claim, ticks are what the audio actually did, and green ticks are
the ones detection believes start a bar. When the green ones sit on the bright lines the
grid is right; when they walk off them it is not. A tempo a fraction out does not look
wrong at bar 2 and is unmistakable by bar 60, which is why this is full width rather than
a detail view. While the grid is open, a band along the lane's bottom edge shades each
bar by how off it reads — its beats late or early against their hits, or unconfirmed —
in the danger role, the deeper the worse, and **Worst bar** goes to the deepest; see
[track-review.md](track-review.md).

The ticks come off the same peaks the lanes draw, which is not a shortcut — it is how
detection works, and it means a tick always lines up with the transient below it. A warp
lane that disagreed with the waveforms would be worse than no warp lane, because it would
look like the grid was wrong. They are taken from the **drums** where there are drums,
which is most of the argument for fitting a grid after separating rather than before.

**Both strips rule from one ladder**, `grid.ts`, so the strip that judges the grid and
the strip the grid is judged against cannot disagree about where a beat is. The spacing
is *chosen* rather than computed: every rung is a musical division — sixteen bars down to
a sixty-fourth note — so whichever survives at a given zoom, the lines drawn are lines
somebody could play to. Doubling a pixel gap instead would put lines on three-and-a-bit
beats, which is a ruler for nothing.

It picks the finest rung that keeps lines sixteen pixels apart, which is set by how the
ladder lands rather than by how thin a line is: the rungs are quarters of each other
above a beat and halves below, so a division lives between sixteen and sixty-four pixels
for the whole of its life. A song wide is four-bar lines, thirty bars is bars, eight is
beats, two is sixteenths, and one kick drum wide is whatever fits under it. Ranking is by
what a line *is* rather than by where it falls in the current step, so a bar line stays a
bar line while the grid thins around it — and the lanes draw the four ranks in four
weights, while the warp lane, being 24px of strip, says it in height instead.

Their bar positions are the grid's claim rather than a property of the audio, so editing
source beat positions walks them off the lines or onto them. That is the lane doing its job.

**A grid is the sample of every beat, and the window used to hold it as two
numbers.** Every beat has its sample, the bars are drawn straight between one
beat and the next, and the spacing carries on past either end. No tempo is
stored: what the header shows is read off the spacing, and a tempo change is
nothing but the spacing changing. Before anything has been measured the beats
are the even ruling a typed tempo makes — which is the tempo and the downbeat the
window used to hold, and the downbeat still matters: a song with a quarter of a
second of air in front of it could not be gridded at all when bar 1 was the top
of the file. `warp.ts` holds the map, and `playback.md` has how the beats are
found.

**Automatic analysis finds every beat and places it.** The drums are heard in three
bands — kick, snare, hats — each hit placed at the start of its attack to the
exact sample; the tempo and which pulse is the beat are read off all of them,
with no lean toward any tempo; and the beats are then found for the whole song
at once, matched to the hits under a smoothness cost, so a breakdown is counted
through at the spacing it had and the first kick after it lands on the beat it
is. In Edit beat grid mode, the markers on the warp lane are those beats — every one when a beat has
room, else every bar — and they are the map, not marks on it: drag one and the
grid bends under the pointer. The readout beside the button says the tempo the
beats run at, and a range where they moved.

**It runs on its own when a track is opened that nothing has been decided about**,
which is what makes it worth having — it costs a few milliseconds, and the
alternative is lanes ruled at 120 over a song at 128, which is not a neutral
default so much as a wrong answer nobody asked for. Anything written down — a fit
that was nudged, a tempo typed in — is a decision, and a decision is not re-taken
behind somebody's back.

**Manual correction requires Edit beat grid.** Its toolbar sits above the mixer lanes,
and the marker handles exist only while it is open. A marker drags to the nearest hit
unless Option is held; its neighbours hold and only the two adjacent intervals change.
Set bar 1 and renumbering are explicit buttons; moving the whole grid is a ⌘-drag on
any marker. A steady tempo is typed into the status reading because it intentionally
removes tempo variation.

Waveform clicks continue to seek. Worst bar seeks and zooms to the bar furthest off its
hits, the next-worst on each press, Home to bar 1, and Space plays
the drums against the draft's click at original speed. The draft is separate from
saved state: Undo steps back through actions, Cancel abandons, and Done commits. Analyze
and Export wait for the edit session to end. See [track-review.md](track-review.md).

## What is a widget and what is not

| on screen | is |
|---|---|
| the model menu, and the ▾ beside Find beats | `Select` |
| play, stop, cancel, export | `Button` |
| the zoom readout, which presses back to the whole track | `Button` |
| loop, mute, solo | `Toggle` |
| a stem's level | `Slider`, horizontal, with a length |
| per-source progress | `Meter` |
| the tempo, in the header transport | `NumberField`, unfilled |
| the waveform | **not a widget.** `components/Waveform.tsx` |
| the strip along the bottom | `HintFooter`, mounted once in `App.tsx` |

**The fader takes a `length`, not `layout="inside"`,** and the difference is not
cosmetic. `widgets/docs/catalogue.md` explains that an inside row deliberately has no
fill, because a parameter on a node row is a *where* and a fill invents a left-hand side
that means nothing. A fader is the case that doc carves out — its own length is what it
is saying — so it wants the fill, and the drag gearing that comes with a known length.

**The tempo field is `showFill={false}`,** for the same reason the fader is not an
inside row. `NumberField` draws the value as a bar behind the text by default, which is
right for a range that means *how much*. A tempo's does not: 124 of 60-to-200 is 46% of
nothing, and it is the loudest thing in the row while carrying the least.

**`Waveform` is not in `widgets/` yet, and that is the rule rather than an oversight.**
The catalogue says a control moves into the library when the second caller arrives; that
is how `Meter` got there. This has one. When set[flow] draws a clip's audio it will have
two, and that file is what moves.

## Colour

`src/Theme.tsx` wraps the app in the widgets `ThemeRoot`. The shared v1 theme contains
surface/text/border roles, neutral primary selection, green measured signal, six stem
identities and paired deck colors. Current favorite is the initial palette, matching the
widgets mixer bench. See [widgets theme rules](https://github.com/openflowfm/widgets/blob/main/docs/theme.md).

Settings in the header opens a stock Modal with Audio and Theme sections. Theme
contains the shared editor in two columns: palette and color editing on the left,
waveform and deck variation on the right. The wider dialog fits these controls without
scrolling at the desktop harness size, with a single-column fallback for narrow windows.
The spectral band buttons share the controls’ 240px width. Color-conflict callouts
use the info color with a tinted background. The library footer has no theme button. Changes recolor
the app immediately and save the complete document (including deck variation) under
`mix.theme.v1` in local storage. Invalid/unavailable storage falls back to the favorite;
if writes fail the editor still works for this window. Widgets owns no persistence.
Bench experiments are temporary and use a different origin, so they do not silently
change the mix app's saved theme.

`src/tokens.css` owns geometry/layers only. App styles use `--primary`, `--danger`,
`--success` and `--info`; the root supplies legacy aliases for remaining callers.
Stem definitions in `mock.ts` reference `--stem-<id>` so library badges, controls and
waveforms share exactly the same identities. Guitar and piano have explicit roles,
independent of generic status colors. `Waveform` and `WarpLane` subscribe to the theme
context and repaint when it changes, including while playback is paused. No audio,
track metadata or playback state is reset to change a theme.

## What is invented

**One thing, and it is not the audio and not the grid any more.**

The library is a folder on disk read through `electron/library.ts` —
[`library.md`](library.md) — so the rail, the counts and the badge strips are real. The
separation is a child process, and the progress bar is what it reports —
[`stems.md`](stems.md). The waveforms are the stems that process wrote, decoded, and the
transport plays those same buffers — [`playback.md`](playback.md) — so the picture and
the sound cannot disagree, which they could the moment they came from two places.

**The slices are read off the stems**, and then they are yours. `slices.ts` scores
every phrase boundary by how much each stem's level changes across it — the vocal
arriving over an unchanged beat counts as much as the whole mix getting louder — and
cuts where the score stands out. The spans are named by how loud they are: the loudest
are drops, a span that rises into a drop is a build, a quiet one between two drops is
a break, and the ends are the intro and outro. The names are a guess and the cuts are
a reading, and both are there to be corrected on the ruler: drag a cut, double-click
to make one, drag it back onto the last to remove it, and type the name in place.
Until anything is decoded the ruler is eight even spans, which is spacing rather than
a reading, and says so nowhere because it is gone the moment the stems are in.

**The tempo is measured, and the key is not.** A track imported today has no key
until something reads for one, and it is drawn as unknown rather than as zero. The
grid is no longer in that list: `warp.ts` fits one, `playback.md` has how, and what
it could not fit it declines to invent.

The other real fact is in the header: whether this machine could separate anything, which
comes over the context bridge from `electron/demucs.ts`. A window that mocked its own
toolchain check would be a window you could not trust about anything.

## Vocabulary

**A slice**, not a scene and not a cue — including in the export dialog, where the
mockup still called the column *cue*. Both already mean something exact in Live: a
scene is a row you fire, a cue is a locator in the Arrangement, and this is neither — it
is a cut this app made in a file it separated. The word has to survive contact with
set[flow], where the other two are load-bearing.

**A mixer is a mixer.** set[flow] has one and so does this, and neither is renamed to
avoid the overlap — the words keep their ordinary meanings in both places. Where the two
genuinely need the same control the answer is `@openflow/widgets`, which is already where
a fader lives.

## Key browsing and analysis

The third quick-filter list beneath full-text search is **Keys**, alongside Artists and
Albums. It uses saved bass analysis or manual key metadata. The dedicated Key column shows one preferred key,
with a provisional `?` marker, or Unknown. Competing hypotheses never appear as extra keys. The library contains no key-analysis buttons or
evidence panel. Detailed alternatives and regions stay in saved debug evidence; they do
not add filter entries. The debug backfill prepares existing songs. See [pitch.md](pitch.md).

Display text throughout the app is not selectable, preventing accidental selections
while operating controls or dragging rows. Inputs, textareas and editable content
explicitly retain text selection for normal editing. This is CSS only; it does not
intercept keyboard shortcuts or pointer gestures. Unseparated library tracks show a compact three-lane icon button in Stems, named
“Separate stems for [track]”. It selects that exact track and opens Prep through the
existing view switch; it does not start separation. The normal track/job phase chooses
setup or running-job UI, with the existing busy-job policy intact. Pointer activation
is isolated from row selection and dragging; the native button supports Enter/Space.
Colored tiles still represent only actual separated sources and remain unchanged.
Hovering or keyboard-focusing the separation button lights only its icon with the
shared button marker color; its normal face and border remain unchanged. This standalone
face uses the app's `--ui` and `--fg` colors directly because widget-local tokens are
scoped to a `.wdg` wrapper, which the library cell does not have.
