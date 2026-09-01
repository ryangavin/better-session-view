import { describe, expect, it } from 'vitest';
import {
  factorOf,
  following,
  limitOf,
  MIN_ZOOM,
  panned,
  shows,
  spanOf,
  under,
  WHOLE,
  zoomedAbout,
  type View,
} from './zoom.ts';

/**
 * What this protects is the thing a zoom gets wrong: a view that has run off
 * the end of the track, or drifted away from the point somebody was pointing
 * at. Neither throws. Both look like the lanes are drawing the wrong part of
 * the song, which is indistinguishable from the separation being wrong.
 */

const at = (zoom: number, from: number): View => ({ zoom, from });

/** Deep enough that no test is fighting the ceiling unless it means to. */
const DEEP = 1e6;

describe('the point under the pointer', () => {
  it('is where it was after zooming in on it', () => {
    const held = under(at(2, 0.25), 0.5);
    const view = zoomedAbout(at(2, 0.25), 4, 0.5, DEEP);
    expect(under(view, 0.5)).toBeCloseTo(held, 12);
  });

  it('is where it was after zooming in at the right-hand edge', () => {
    // The edges are where an anchored zoom goes wrong, because keeping the
    // point still is exactly what pushes `from` past what is reachable.
    const view = zoomedAbout(at(4, 0.5), 2, 1, DEEP);
    expect(under(view, 1)).toBeCloseTo(0.75, 12);
  });

  it('survives the round trip out and back in', () => {
    const there = zoomedAbout(at(1, 0), factorOf(-400), 0.3, DEEP);
    const back = zoomedAbout(there, factorOf(400), 0.3, DEEP);
    expect(back.zoom).toBeCloseTo(1, 12);
    expect(back.from).toBeCloseTo(0, 12);
  });
});

describe('what a view is allowed to be', () => {
  it('zooms out past the track filling the lane, and stops', () => {
    expect(zoomedAbout(at(1, 0), 0.5, 0.5, DEEP).zoom).toBe(0.5);
    expect(zoomedAbout(at(MIN_ZOOM, 0), 0.5, 0.5, DEEP).zoom).toBe(MIN_ZOOM);
  });

  it('stops where the track runs out of samples to show', () => {
    const limit = limitOf(240, 44100);
    expect(zoomedAbout(at(limit, 0), 4, 0.5, limit).zoom).toBe(limit);
  });

  it('never shows past the end of the track', () => {
    const view = panned(at(4, 0.5), 8);
    expect(spanOf(view).to).toBeCloseTo(1, 12);
    expect(view.from).toBeCloseTo(0.75, 12);
  });

  it('never shows before the start of it', () => {
    expect(panned(at(4, 0.1), -8).from).toBe(0);
  });

  it('pulls the view back onto the track on the way out', () => {
    // Zooming out at the right-hand edge has to bring `from` back with it, or
    // the way out is a window hanging further and further off the end.
    const view = zoomedAbout(at(4, 0.75), 0.25, 1, DEEP);
    expect(view.zoom).toBe(1);
    expect(view.from).toBe(0);
  });
});

describe('zoomed out past the lane', () => {
  /**
   * Out here the arithmetic changes hands: the window is wider than the song, so
   * it is the *song* that moves inside the window rather than the window that
   * moves along the song. What must not happen is the song scrolling out of
   * sight — there is nothing else on screen to find it by.
   */
  it('always shows the whole song, wherever it has been panned', () => {
    for (const spans of [-4, -1, -0.3, 0, 0.3, 1, 4]) {
      const view = panned({ zoom: 0.5, from: -0.5 }, spans);
      const { from, to } = spanOf(view);
      expect(from).toBeLessThanOrEqual(0);
      expect(to).toBeGreaterThanOrEqual(1);
    }
  });

  it('slides the song between flush left and flush right', () => {
    expect(panned({ zoom: 0.5, from: -1 }, -4).from).toBe(-1);
    expect(panned({ zoom: 0.5, from: -1 }, 4).from).toBe(0);
  });

  it('puts the space outside the track outside 0 and 1', () => {
    // What the lanes shade and the ruler counts backwards through. A point
    // before the song starts has to answer as a place on screen, not as clamped
    // onto the start.
    const view = { zoom: 0.5, from: -0.5 };
    expect(shows(view, 0)).toBeCloseTo(0.25, 12);
    expect(shows(view, 1)).toBeCloseTo(0.75, 12);
    expect(under(view, 0)).toBeCloseTo(-0.5, 12);
  });

  it('leaves the head on screen, so nothing follows it anywhere', () => {
    const view = { zoom: 0.5, from: -0.5 };
    expect(following(view, 0)).toBe(view);
    expect(following(view, 1)).toBe(view);
  });
});

describe('the same view back', () => {
  /**
   * Identity, not equality. This is what React bails out on: a wheel held at
   * the limit, or a playhead crossing a view it is already inside, must not
   * hand back a new object and repaint every lane for it.
   */
  it('comes back from a zoom that could not go further', () => {
    const held = at(MIN_ZOOM, 0);
    expect(zoomedAbout(held, 0.5, 0.5, DEEP)).toBe(held);
  });

  it('comes back from a pan that could not go further', () => {
    const held = at(2, 0.5);
    expect(panned(held, 3)).toBe(held);
  });

  it('comes back from following a point already on screen', () => {
    const held = at(4, 0.25);
    expect(following(held, 0.3)).toBe(held);
  });
});

describe('panning', () => {
  it('moves by screenfuls, so a gesture means the same at every zoom', () => {
    expect(panned(at(4, 0.25), 1).from).toBeCloseTo(0.5, 12);
    expect(panned(at(8, 0.25), 1).from).toBeCloseTo(0.375, 12);
  });
});

describe('following the head', () => {
  it('pages when it runs off the right-hand side, with the head near the start', () => {
    const view = following(at(4, 0), 0.3);
    expect(view.from).toBeCloseTo(0.275, 12);
    expect(shows(view, 0.3)).toBeCloseTo(0.1, 12);
  });

  it('pages back when the head is dropped behind the view', () => {
    expect(following(at(4, 0.5), 0.1).from).toBeCloseTo(0.075, 12);
  });

  it('does not page past the start when the head goes to the top of the track', () => {
    expect(following(at(4, 0.5), 0).from).toBe(0);
  });
});

describe('how far in a track goes', () => {
  it('is however many samples it has, over the couple of hundred a lane shows', () => {
    // The ceiling is a view, not a number of times: at the bottom of it, a
    // four-minute track and a two-bar loop are both showing single samples.
    const long = limitOf(240, 44100);
    const short = limitOf(4, 44100);
    expect(240 / long).toBeCloseTo(4 / short, 9);
  });

  it('goes deep enough for a sample to be a value rather than a dot', () => {
    // A lane is around 900px, so a couple of dozen samples across it is the
    // sample editor's view — points a hand's width apart. The limit is what
    // that view is; it is not a number of times anybody chose.
    const seconds = 240;
    const onScreen = (seconds / limitOf(seconds, 44100)) * 44100;
    expect(onScreen).toBeGreaterThan(8);
    expect(onScreen).toBeLessThan(48);
  });

  it('never asks a track with no length to zoom', () => {
    expect(limitOf(0, 44100)).toBe(1);
  });

  it('falls back to a sane rate before there is a graph', () => {
    expect(limitOf(240, 0)).toBe(limitOf(240, 44100));
  });
});

describe('the wheel', () => {
  it('zooms in on a scroll away and out on a scroll towards', () => {
    expect(factorOf(-100)).toBeGreaterThan(1);
    expect(factorOf(100)).toBeLessThan(1);
  });

  it('lands in the same place whether the movement came in one push or two', () => {
    expect(factorOf(50) * factorOf(50)).toBeCloseTo(factorOf(100), 12);
  });

  it('crosses a whole track in a reachable amount of scrolling', () => {
    // A four-minute track is fifty thousand times deep. If a swipe of a
    // trackpad — a few hundred pixels — barely moved it, the bottom of the
    // range would be somewhere nobody ever goes.
    const limit = limitOf(240, 44100);
    const swipes = Math.log(limit) / Math.log(factorOf(-400));
    expect(swipes).toBeLessThan(8);
  });
});

describe('where things land on screen', () => {
  it('puts the left edge at 0 and the right at 1', () => {
    const view = at(4, 0.25);
    expect(shows(view, 0.25)).toBeCloseTo(0, 12);
    expect(shows(view, 0.5)).toBeCloseTo(1, 12);
  });

  it('answers with something off the scale for a point that is not on screen', () => {
    // The playhead is drawn on this, and a head at bar 200 of a view ending at
    // bar 60 has to be *outside* 0..1 rather than clamped onto the edge.
    expect(shows(at(4, 0.25), 0.9)).toBeGreaterThan(1);
    expect(shows(at(4, 0.25), 0.1)).toBeLessThan(0);
  });

  it('is the inverse of asking what is under a place', () => {
    const view = at(6, 0.3);
    expect(under(view, shows(view, 0.4))).toBeCloseTo(0.4, 12);
  });
});
