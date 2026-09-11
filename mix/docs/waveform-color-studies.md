# Opt-in waveform color studies

`COLOR_STUDIES` in `debug/waveform-v2/style.ts` adds **Prism**, **Aurora**, and **Ember**
to V2's existing selector. They are never applied on opening the page. No initialization,
local-storage migration, default change, crossover change or production renderer change
is part of this iteration. Selecting a preset explicitly uses the existing style-selection
behavior. Ryan's current custom view was unavailable: exact comparison with it is unverified.

All three use the existing production spectral painter and peak silhouette. Hue varies
with measured band energy, not time. They retain Vivid peaks' geometry: smoothness 0.35,
detail 2 and height ratio 0.86. Color strength is 100%; each band's saturation is 100%.
Relative low/mid/high weights are 0.85/1/1.8 and color contrast is 2.3. These fixed settings
were checked on two recordings, not fitted or normalized separately for each track.

| Study | Low / mid / high hue | Low / mid / high lightness | Fill opacity | Edge |
|---|---|---|---|---|
| Prism | 0° / 120° / 240° | 46% / 46% / 46% | 0.68 | 0.85 |
| Aurora | 275° / 95° / 185° | 30% / 25% / 19% | 0.88 | 0.88 |
| Ember | 22° / 325° / 225° | 27% / 23% / 28% | 0.88 | 0.90 |

**Prism is the recommendation for broader rainbow variation.** It keeps the familiar
red-low / green-mid / blue-high semantics and makes complementary combinations more
visible. Bass-heavy material correctly favors warm colors; it does not manufacture an
even rainbow. Aurora offers a cooler violet/green/cyan family. Ember offers orange,
magenta and blue for a warmer, narrower family. Both alternatives restrain individual
band lightness to avoid clipping where non-primary palette channels add together.

## Evidence and limits

The isolated browser rendering called V2's real `measure` → `prepare` → `paintTopology`
path and the installed production `paintSpectralOutline`, without a server, playback,
MIDI, or changes to the user's open session. Two existing real separated recordings
were summed channel-preservingly:

- `c51c0519-6153-437b-b267-2d679492c10b`, `some-chords-clip`: full 30-second source,
  displaying 8–24 seconds. Median low/mid energy ratio was about 1.28.
- `27728257-7899-4684-a33c-076091bf6a6f`, `SOFI Needs a Ladder`: 60–90-second source
  excerpt, displaying original 68–84 seconds. Median low/mid ratio was about 2.04.

Each uses all four cached stems, 44.1 kHz, 250/2500 Hz crossovers, 1200 CSS pixels,
DPR 2, and 160px / 72px spectrum plus 72px layer rows. The peak reference is fixed to
that source excerpt, identical across the presets within each comparison. It is not
an absolute amplitude comparison between recordings or a reconstruction of Ryan's view.

The diagnostic distinguishes expected additive whitening from clipping. Equal energy
in saturated RGB bands gives white even when nothing exceeds 255 before the clamp.
The existing Vivid peaks default had **zero pre-clamp overflow** in both measured
passages; its pale mixed colors must not be described as proven clipping. Early
non-primary palette candidates did overflow. Final Prism, Aurora and Ember all had
zero overflow across each passage's 1,200 measured columns.

Prism spread the first passage's chromatic columns across all twelve 30° hue sectors;
the reference was concentrated in cyan/blue. On the second recording it favored red
where bass dominated and retained cool detail. Balanced frequencies can still look
neutral: the first passage had more low-chroma columns with Prism (114 versus 20),
while the second had fewer (9 versus 61). The recommendation is a visual tradeoff,
not a claim of universally improved saturation or perfect coloring for all music.

Existing style tests validate every added preset and its conversion to the shared
presentation API. The original lab, Legacy RMS, production defaults and staged
crossover work remain separate from these opt-in studies.
