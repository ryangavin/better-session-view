/**
 * The header's glyph set.
 *
 * Inline SVG rather than an icon font or a Unicode character. A font is out
 * because nothing loads from a CDN — this runs on stage. A character is out
 * because ▶, ⏹ and 🐛 render at whatever size, weight and baseline the user's
 * installed fonts decide, and the emoji ones arrive in full color at a size
 * nothing here asked for. These inherit `currentColor`, so a button's hover,
 * disabled and `.on` states reach the glyph without the icon knowing about them.
 *
 * All drawn on a 24-unit grid at 14px, so the stroke lands near 1 device pixel.
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
