/**
 * The app's compact-control glyph set.
 *
 * Inline SVG rather than an icon font or a Unicode character. A font is out
 * because nothing loads from a CDN — this runs on stage. A character is out
 * because ▶, ⏹ and 🐛 render at whatever size, weight and baseline the user's
 * installed fonts decide, and the emoji ones arrive in full color at a size
 * nothing here asked for. These inherit `currentColor`, so a button's hover,
 * disabled and `.on` states reach the glyph without the icon knowing about them.
 *
 * All drawn on a 24-unit grid at 14px by default, so the stroke lands near 1
 * device pixel. The scene-header workflow controls scale them down together in
 * CSS to fit that table row without giving the icons a second coordinate system.
 * Anything with more detail than these turns to mush at that size — the bug in
 * particular is already at the limit.
 */

const BASE = {
  viewBox: '0 0 24 24',
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  // The button carries the accessible name via aria-label; the glyph is
  // decoration, and announcing it twice is worse than not at all.
  'aria-hidden': true,
  focusable: 'false',
} as const;

/** Snapshot — re-walk the set. Two arrows chasing each other. */
export const IconSync = () => (
  <svg {...BASE}>
    <polyline points="22 4 22 10 16 10" />
    <polyline points="2 20 2 14 8 14" />
    <path d="M4.2 9.2A8.5 8.5 0 0 1 18.4 6L22 9.4" />
    <path d="M2 14.6l3.6 3.4A8.5 8.5 0 0 0 19.8 14.8" />
  </svg>
);

/** Fold songs — a hundred headers stacked up are a list of lines. */
export const IconMenu = () => (
  <svg {...BASE}>
    <line x1="3.5" y1="6.5" x2="20.5" y2="6.5" />
    <line x1="3.5" y1="12" x2="20.5" y2="12" />
    <line x1="3.5" y1="17.5" x2="20.5" y2="17.5" />
  </svg>
);

/** Log — diagnostics. */
export const IconBug = () => (
  <svg {...BASE}>
    <path d="M12 20.5a6 6 0 0 1-6-6V11a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3.5a6 6 0 0 1-6 6Z" />
    <path d="M9 7V6a3 3 0 0 1 6 0v1" />
    <path d="M6 12.5H2.5M21.5 12.5H18" />
    <path d="M4.8 6.6 6.9 8.4M19.2 6.6 17.1 8.4" />
    <path d="M4.8 18.6 6.9 16.8M19.2 18.6 17.1 16.8" />
  </svg>
);

/** Output meters — three live level bars. */
export const IconMeter = () => (
  <svg {...BASE}>
    <line x1="5" y1="18.5" x2="5" y2="13" />
    <line x1="12" y1="18.5" x2="12" y2="8" />
    <line x1="19" y1="18.5" x2="19" y2="4.5" />
  </svg>
);

/** Add a song scaffold. */
export const IconAddSong = () => (
  <svg {...BASE}>
    <line x1="12" y1="4.5" x2="12" y2="19.5" />
    <line x1="4.5" y1="12" x2="19.5" y2="12" />
  </svg>
);

/** Set the running order — a list beside a two-way ordering arrow. */
export const IconOrderSongs = () => (
  <svg {...BASE}>
    <line x1="9.5" y1="6" x2="20" y2="6" />
    <line x1="9.5" y1="12" x2="20" y2="12" />
    <line x1="9.5" y1="18" x2="20" y2="18" />
    <line x1="5" y1="5" x2="5" y2="19" />
    <polyline points="2.5 7.5 5 5 7.5 7.5" />
    <polyline points="2.5 16.5 5 19 7.5 16.5" />
  </svg>
);

/** Color every song from a rule. */
export const IconColorSongs = () => (
  <svg {...BASE}>
    <path d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.2a1.8 1.8 0 0 0 0-3.6h-.7a1.8 1.8 0 0 1 0-3.6h5.4a3 3 0 0 0 3-3A8.8 8.8 0 0 0 12 3.2Z" />
    <circle cx="7.5" cy="9" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="11.5" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="16" cy="8.2" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);

/** Start the song. */
export const IconPlay = () => (
  <svg {...BASE} fill="currentColor" stroke="none">
    <path d="M8 5.4 18.4 12 8 18.6Z" />
  </svg>
);

/** Stop the song. */
export const IconStop = () => (
  <svg {...BASE} fill="currentColor" stroke="none">
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.6" />
  </svg>
);

/**
 * Stop all clips, keep the song rolling — a clip slot struck through.
 *
 * The one action here with no conventional glyph, so it leans on the ordinary
 * "none of these" slash over the shape the grid is made of. It's the weakest of
 * the six; its tooltip does the real work.
 */
export const IconStopClips = () => (
  <svg {...BASE}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
    <line x1="6.8" y1="17.2" x2="17.2" y2="6.8" />
  </svg>
);

/** GitHub's mark — links back to the project's source repository. */
export const IconGitHub = () => (
  <svg {...BASE} fill="currentColor" stroke="none">
    <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.97c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
  </svg>
);

/**
 * A group track's fold control — Live's circled chevron.
 *
 * The chevron alone was a bare `▸`/`▾`, which reads as an ordinary disclosure
 * arrow and left "is this column a group?" to be inferred from the color band.
 * The ring is what makes it a *badge*: at a glance down the header row, the
 * group tracks are the ones wearing one.
 *
 * Smaller than the header glyphs and drawn heavier to compensate — 3 on the
 * 24-grid at 11px lands near 1.4 device pixels, where BASE's 1.8 would come out
 * thin enough to shimmer against a saturated track color. Weighted to sit with
 * the 600 the group's name is set in; a hairline ring beside a bold word reads
 * as an artefact rather than as a badge.
 */
export const IconGroupFold = ({ folded }: { folded: boolean }) => (
  <svg {...BASE} width={11} height={11} strokeWidth={3}>
    <circle cx="12" cy="12" r="9.6" />
    {folded ? (
      <polyline points="10.2 7.8 14.4 12 10.2 16.2" />
    ) : (
      <polyline points="7.8 10.2 12 14.4 16.2 10.2" />
    )}
  </svg>
);
