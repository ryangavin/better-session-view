import { useCallback, useState } from 'react';

/**
 * How much of the track the lanes are showing, and which part of it.
 *
 * The lanes drew the whole track across whatever width the window had, which is
 * right for finding a breakdown and useless for finding a downbeat: a
 * four-minute track across nine hundred pixels is a quarter of a second per
 * pixel, so a kick and the snare after it are the same column. Zoom is what
 * makes the same picture answer both questions.
 *
 * **It is a view, not a fact about the track**, so nothing here is written
 * down and none of it reaches the audio. It is two numbers — how far in, and
 * where the left edge is — and everything on the timeline maps through them.
 * The canvases stay the width of the window and draw the slice they were asked
 * for; a span widened by `zoom` in CSS instead would be a fifteen-thousand
 * pixel canvas per lane, which the browser either refuses outright or keeps in
 * memory six times over.
 *
 * Zoomed out past the track fitting the lane, the view keeps going: `from` goes
 * negative and `to` past 1, and what is out there is not part of the song. The
 * fractions below carry that without a special case — they are a coordinate, not
 * a proportion of something that exists.
 *
 * Positions are **fractions of the track** throughout, not seconds and not
 * bars. Seconds belong to the transport and bars are a claim the grid makes;
 * a fraction is the one currency the ruler, the warp lane, six waveforms and
 * the playhead already share.
 */
export interface View {
  /** 1 is the whole track, 8 is an eighth of it. */
  zoom: number;
  /** The left edge, as a fraction of the track. */
  from: number;
}

/** The whole track, edge to edge, which is where every track opens. */
export const WHOLE: View = { zoom: 1, from: 0 };

/**
 * How far *out* it goes, past the track filling the lane.
 *
 * A quarter, so the song can be a stripe with room either side of it. Fitting
 * exactly is the obvious floor and it is the wrong one: a shape is easier to
 * judge with air around it than jammed against both walls, and a song that ends
 * at the last pixel gives no way to see that it ends. What is outside the track
 * is drawn as outside — the lanes shade it and the ruler keeps counting bars
 * through it, downwards past bar 1, the way an arrangement does.
 */
export const MIN_ZOOM = 0.25;

/**
 * The narrowest view worth having, in samples across the lane.
 *
 * The bottom of a zoom is the point past which magnifying stops revealing, and
 * for audio that point is exact: there is nothing under a sample. A hundred and
 * ninety-two of them across a lane is about five pixels apart on a laptop —
 * far enough to see each one as a point with the line running between them,
 * which is the view you want when you are asking what the audio actually did
 * rather than what it looks like it did.
 */
const FINEST = 192;

/**
 * How far in a particular track goes, which is not a constant.
 *
 * A zoom limit expressed as a number of times is a limit that means something
 * different for every song — sixteen times a four-minute track is fifteen
 * seconds and sixteen times a loop is a bar. What is actually fixed is the
 * *view*: however long the track, the deepest it goes is a couple of hundred
 * samples. So the ceiling is derived from the track and handed to the two
 * functions that could raise the zoom.
 *
 * The rate is the graph's, not the file's — `engine.ts` — and 44.1 kHz stands
 * in before there is a graph, which is also before there is anything to draw.
 */
export const limitOf = (seconds: number, rate: number): number =>
  seconds > 0 ? Math.max(1, (seconds * (rate || 44100)) / FINEST) : 1;

/** The visible slice of the track, which is what a canvas is asked to draw. */
export interface Span {
  from: number;
  to: number;
}

export const spanOf = (view: View): Span => ({ from: view.from, to: view.from + 1 / view.zoom });

/** Where a point in the track lands in the view: 0 is the left edge, 1 the right. */
export const shows = (view: View, at: number): number => (at - view.from) * view.zoom;

/** The point in the track under a place in the view. */
export const under = (view: View, place: number): number => view.from + place / view.zoom;

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/**
 * A view that is actually reachable, and the same object when it already was.
 *
 * The identity matters as much as the clamping: this runs on every wheel tick
 * and on every frame of playback, and React skips the render entirely when the
 * state comes back unchanged. Returning a fresh object that happens to hold
 * the same two numbers would redraw six canvases per frame for as long as
 * somebody leans on a scroll wheel at the end of a track.
 */
const settled = (zoom: number, from: number, was: View): View => {
  // `1 - 1/zoom` is where the left edge sits when the *right* edges line up, and
  // which side of zero it falls on is the whole difference between zoomed in and
  // zoomed out. Zoomed in it is positive and the range is 0 to it: the window
  // slides along a track wider than itself. Zoomed out it is negative and the
  // range is it to 0: the *track* slides within a window wider than itself,
  // between flush left and flush right, and one of those is always true — which
  // is why the song cannot be scrolled off screen at all out there.
  const rest = 1 - 1 / zoom;
  const edge = clamp(from, Math.min(0, rest), Math.max(0, rest));
  return zoom === was.zoom && edge === was.from ? was : { zoom, from: edge };
};

/**
 * Zoom about a point, keeping whatever is under it where it is.
 *
 * The point is where the pointer was, so the frame you are looking at is the
 * frame that stays put. Zooming about the centre instead sounds tidier and is
 * the reason so many timelines need a pan after every zoom — what you were
 * pointing at has left the window by the time it settles.
 */
export const zoomedAbout = (view: View, factor: number, place: number, limit: number): View => {
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, Math.max(1, limit));
  const held = under(view, place);
  return settled(zoom, held - place / zoom, view);
};

/** Move sideways, in screenfuls — so a drag means the same thing at every zoom. */
export const panned = (view: View, spans: number): View =>
  settled(view.zoom, view.from + spans / view.zoom, view);

/**
 * How far a wheel gesture zooms.
 *
 * Exponential in the scroll distance, which is the only mapping where two
 * small pushes and one big one land in the same place — and where zooming out
 * undoes zooming in by the same movement backwards.
 *
 * The rate is set by the range it has to cover. A four-minute track goes to
 * about fifty thousand times before it is showing single samples, and at a
 * gentler curve that is a dozen swipes of a trackpad to cross — a control
 * nobody would reach the bottom of.
 */
export const factorOf = (delta: number): number => Math.exp(-delta * 0.005);

/**
 * Keep a moving point in view, by the screenful rather than by the pixel.
 *
 * The playhead leaves the window every few seconds at any real zoom, and the
 * two ways to handle that are to scroll under it continuously or to page when
 * it reaches the edge. Paging wins for the same reason a book does not slide:
 * a picture that moves while you are reading it cannot be read, and the whole
 * point of zooming in was to look at something.
 *
 * A tenth of a screenful of lead-in, so the head is visibly *at* the start of
 * what is now shown rather than exactly on the edge of it.
 */
export const following = (view: View, at: number): View => {
  const span = 1 / view.zoom;
  if (at >= view.from && at <= view.from + span) return view;
  return settled(view.zoom, at - span * 0.1, view);
};

/**
 * The view a set of lanes is holding, and the four ways it moves.
 *
 * A hook of its own rather than another dozen fields on `state.ts`, because
 * nothing outside the lanes can see it: not the header, not the library, not
 * the transport, and — deliberately — not `remember.ts`. Where you had scrolled
 * to is not something a window owes you back after a reload; the mix and the
 * head are.
 *
 * The reset is done during render rather than in an effect. Opening another
 * track while zoomed into the middle of this one would otherwise paint one
 * frame of the new track through the old track's window before the effect
 * caught it.
 */
export function useView(track: string | null, limit: number) {
  const [view, setView] = useState<View>(WHOLE);
  const [held, setHeld] = useState(track);
  if (held !== track) {
    setHeld(track);
    setView(WHOLE);
  }

  const zoomAbout = useCallback(
    (factor: number, place: number) => setView((was) => zoomedAbout(was, factor, place, limit)),
    [limit],
  );
  const panBy = useCallback((spans: number) => setView((was) => panned(was, spans)), []);
  const follow = useCallback((at: number) => setView((was) => following(was, at)), []);
  const whole = useCallback(() => setView(WHOLE), []);

  return { view, zoomAbout, panBy, follow, whole };
}
