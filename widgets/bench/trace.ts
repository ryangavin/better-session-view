import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

/**
 * The instrument the graph room is built around.
 *
 * A canvas is the one part of this module you cannot judge by looking at it.
 * A knob is right or wrong in a screenshot; a cord that lands nine times out
 * of ten looks exactly like a cord that lands ten times out of ten, and the
 * tenth is the whole of the usability. So the room keeps a running account of
 * what the hand did and what the graph made of it, and the interesting half of
 * that account is **what the host never hears about**: a cord let go over
 * nothing reports nothing, and it is the failure worth counting.
 *
 * Two rules shape the code below.
 *
 * **The instrument stays out of the render path.** Everything here is a
 * closure and a ref; nothing it records re-renders the graph. A facts panel
 * that re-rendered every node four times a second while measuring how long a
 * drag takes would be measuring itself. That is the same reasoning `Graph`
 * keeps its port geometry in a ref for, one layer up.
 *
 * **It reads the DOM rather than asking the graph for more API.** A bench may
 * snoop; a host may not. Nothing here needs `Graph` to publish a gesture, and
 * so nothing here is a feature request in disguise — if a reading below turns
 * out to be worth having in an app, that is the moment to add it properly.
 */

export type EntryKind =
  | 'landed'
  | 'refused'
  | 'dropped'
  | 'escaped'
  | 'moved'
  | 'turned'
  | 'snagged'
  | 'reached'
  | 'said';

export interface Entry {
  n: number;
  /** Milliseconds since the trace began, which is since the tab mounted. */
  at: number;
  kind: EntryKind;
  said: string;
}

/** Long enough to see a session, short enough that reading it is still a way in. */
const KEPT = 120;

export interface Trace {
  say(kind: EntryKind, said: string): void;
  clear(): void;
  read(): readonly Entry[];
  listen(fn: () => void): () => void;
}

function makeTrace(): Trace {
  let entries: readonly Entry[] = [];
  let n = 0;
  const started = performance.now();
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const fn of listeners) fn();
  };
  return {
    say(kind, said) {
      const at = Math.round(performance.now() - started);
      entries = [...entries.slice(1 - KEPT), { n: ++n, at, kind, said }];
      tell();
    },
    clear() {
      entries = [];
      tell();
    },
    read: () => entries,
    listen(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export function useTrace(): Trace {
  return useMemo(makeTrace, []);
}

/** Subscribed here rather than held above, so only the printed list re-renders. */
export function useEntries(trace: Trace): readonly Entry[] {
  return useSyncExternalStore(trace.listen, trace.read);
}

type Side = 'in' | 'out';

/** What the hand has hold of, decided from where it went down. */
export type Holding = 'nothing' | 'cord' | 'control' | 'node' | 'canvas';

export interface Reading {
  /** Cords the host accepted, and cords let go with nothing under them. */
  landed: number;
  dropped: number;
  refused: number;
  /** Of the landed ones, which end the hand started at, and which used no hand. */
  fromOutlet: number;
  fromInlet: number;
  byKeyboard: number;
  /** How long a landed cord took, from the port going down to the host hearing. */
  reachMs: number | null;
  /** A control turned inside a node, and the node stayed put — or didn't. */
  turnedClean: number;
  snagged: number;
  /** Nudged with the arrow keys, and cords dropped with Escape. */
  nudged: number;
  escaped: number;
  reachedPort: boolean;
  /** The last gesture that was worth timing: its moves and its worst frame. */
  moves: number;
  worstFrameMs: number | null;
  /** What is actually drawn, counted off the page. */
  nodes: number;
  ports: number;
  cordsDrawn: number;
  /** The view the graph owns, read back off its own transform. */
  scale: number;
  panX: number;
  panY: number;
  holding: Holding;
}

export interface Watch {
  /** Put this on the element the canvas sits in. */
  attach(el: HTMLElement | null): void;
  /** The host accepted a cord. */
  landed(from: string, to: string): void;
  /** The host refused one, and said why. */
  refused(why: string): void;
  /** A node moved, by a drag or by the arrow keys. */
  moved(id: string): void;
  /** A control inside a node was turned. Counted, never printed: a knob emits dozens. */
  turned(): void;
  /**
   * How the graph reports its own zoom, when the host has published one.
   *
   * `Graph` exposes the scale through an imperative `viewRef` precisely so a
   * host can read it without lifting wheel zoom into React state, and this is
   * the bench taking it at its word: the number in the readings comes from the
   * graph rather than from parsing its transform back out of the CSS. Pass
   * null and the transform is read instead, which is what an unpublished view
   * leaves.
   */
  reads(scale: (() => number) | null): void;
  /** Measured at the moment the facts ask, so nothing here runs on a timer of its own. */
  read(): Reading;
  clear(): void;
}

interface Gesture {
  what: Holding;
  /** Let go of, but not yet judged: the graph is still deciding. */
  closing?: boolean;
  /** The port a cord left, when it left one. */
  port?: { name: string; side: Side };
  at: number;
  moves: number;
  turns: number;
  landed: number;
  worst: number;
  frames: number;
  raf: number;
}

const blank = () => ({
  landed: 0,
  dropped: 0,
  refused: 0,
  fromOutlet: 0,
  fromInlet: 0,
  byKeyboard: 0,
  reaches: [] as number[],
  turnedClean: 0,
  snagged: 0,
  nudged: 0,
  escaped: 0,
  reachedPort: false,
  moves: 0,
  worst: null as number | null,
});

/**
 * Which control counts as "a control has taken this".
 *
 * The same shape as the graph's own list, and deliberately still about HTML:
 * a bench that tested for `.wdg-knob` would have learned what a knob is, and
 * would stop reporting the day a control is built out of something else.
 */
const CONTROL = 'input, select, textarea, [role="slider"], [role="radio"]';

function makeWatch(trace: Trace): Watch {
  let root: HTMLElement | null = null;
  let held: Gesture | null = null;
  let last = 0;
  let tally = blank();
  let off: (() => void) | null = null;
  let published: (() => number) | null = null;

  const step = (now: number) => {
    if (!held) return;
    if (last) {
      const gap = now - last;
      held.frames++;
      if (gap > held.worst) held.worst = gap;
    }
    last = now;
    held.raf = requestAnimationFrame(step);
  };

  /**
   * Judged a whole task late, and that is not a detail.
   *
   * The graph resolves a cord on its own `pointerup`, and it is the host's
   * `onConnect` — running inside that handler — that says a cord landed. This
   * watch listens on the capture phase, which runs first, so anything that
   * judged the gesture where it was let go would file every successful cord as
   * a drop and then report the landing as keyboard work. That is exactly what
   * the first version of this file did, on its first run, in front of the
   * account it prints.
   *
   * A microtask is **not** enough, which was the second version's mistake: the
   * browser takes a microtask checkpoint after each listener returns, so a
   * microtask queued in the capture phase still runs before the bubble phase.
   * Only a task clears the whole dispatch.
   */
  const letGo = () => {
    if (!held || held.closing) return;
    const mine = held;
    mine.closing = true;
    // Named, because a task can be beaten to the punch: a hand that lets go
    // and goes straight down again starts a new gesture before this fires, and
    // a judgement that read whatever was current would try the wrong one.
    window.setTimeout(() => judge(mine), 0);
  };

  const judge = (which: Gesture | null) => {
    const gesture = which ?? held;
    if (!gesture || gesture !== held) return;
    held = null;
    cancelAnimationFrame(gesture.raf);
    const took = Math.round(performance.now() - gesture.at);

    // Four frames is enough to have measured a drag and not enough to have
    // measured a click, whose one long frame is the browser's, not the graph's.
    if (gesture.frames > 4) tally.worst = Math.round(gesture.worst * 10) / 10;

    if (gesture.what === 'cord') {
      if (gesture.landed) return;
      tally.dropped++;
      const at = gesture.port ? `${gesture.port.name} (${gesture.port.side})` : 'a port';
      trace.say('dropped', `let go over nothing — from ${at}, ${took}ms in hand`);
      return;
    }
    if (gesture.turns > 0) {
      if (gesture.moves > 0) {
        tally.snagged++;
        trace.say(
          'snagged',
          `a control was turned and the node moved with it — ${gesture.turns} turns, ${gesture.moves} moves`,
        );
      } else {
        tally.turnedClean++;
        trace.say('turned', `${gesture.turns} on a control, and the node stayed put`);
      }
      return;
    }
    if (gesture.moves > 0) {
      tally.moves = gesture.moves;
      const cost = gesture.frames > 4 ? `, worst frame ${gesture.worst.toFixed(1)}ms` : '';
      trace.say('moved', `${gesture.moves} moves over ${took}ms${cost}`);
    }
  };

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // The deferred judgement is a task, and a new gesture could in principle
    // beat it. Flushing here keeps two gestures from being counted as one.
    if (held?.closing) judge(held);
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const port = target.closest<HTMLElement>('.wdg-port');
    const what: Holding = port
      ? 'cord'
      : target.closest(CONTROL)
        ? 'control'
        : target.closest('.wdg-graph-node')
          ? 'node'
          : 'canvas';
    held = {
      what,
      at: performance.now(),
      moves: 0,
      turns: 0,
      landed: 0,
      worst: 0,
      frames: 0,
      raf: 0,
      ...(port
        ? {
            port: {
              name: port.getAttribute('aria-label') ?? '?',
              side: (port.dataset.side as Side) ?? 'out',
            },
          }
        : {}),
    };
    last = 0;
    held.raf = requestAnimationFrame(step);
  };

  /**
   * Escape is read off the page rather than off the gesture, because a cord
   * armed with Enter has no gesture: the port carrying `data-pending` is the
   * only thing that knows a cord is out, whichever way it was picked up.
   */
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const out = held?.what === 'cord' || !!root?.querySelector('.wdg-port[data-pending]');
    if (!out) return;
    tally.escaped++;
    trace.say('escaped', 'the cord in flight was dropped');
    if (held?.what === 'cord') {
      cancelAnimationFrame(held.raf);
      held = null;
    }
  };

  const focus = (e: FocusEvent) => {
    const port = (e.target as HTMLElement | null)?.closest<HTMLElement>('.wdg-port');
    if (!port || tally.reachedPort) return;
    tally.reachedPort = true;
    trace.say('reached', `${port.getAttribute('aria-label') ?? 'a port'} has the focus`);
  };

  return {
    attach(el) {
      off?.();
      off = null;
      root = el;
      if (!el) return;
      el.addEventListener('pointerdown', down, true);
      el.addEventListener('keydown', key);
      el.addEventListener('focusin', focus);
      document.addEventListener('pointerup', letGo, true);
      document.addEventListener('pointercancel', letGo, true);
      off = () => {
        el.removeEventListener('pointerdown', down, true);
        el.removeEventListener('keydown', key);
        el.removeEventListener('focusin', focus);
        document.removeEventListener('pointerup', letGo, true);
        document.removeEventListener('pointercancel', letGo, true);
      };
    },

    landed(from, to) {
      tally.landed++;
      if (held?.what === 'cord') {
        held.landed++;
        const reach = performance.now() - held.at;
        tally.reaches.push(reach);
        const side = held.port?.side ?? 'out';
        if (side === 'out') tally.fromOutlet++;
        else tally.fromInlet++;
        trace.say(
          'landed',
          `${from} → ${to}, ${Math.round(reach)}ms, pulled from the ${side === 'out' ? 'outlet' : 'inlet'}`,
        );
        return;
      }
      tally.byKeyboard++;
      trace.say('landed', `${from} → ${to}, with no pointer in it`);
    },

    refused(why) {
      tally.refused++;
      if (held?.what === 'cord') held.landed++;
      trace.say('refused', why);
    },

    moved(id) {
      if (held) {
        held.moves++;
        return;
      }
      tally.nudged++;
      trace.say('moved', `${id}, by the arrow keys`);
    },

    turned() {
      if (held) held.turns++;
    },

    reads(scale) {
      published = scale;
    },

    read() {
      const content = root?.querySelector<HTMLElement>('.wdg-graph-content');
      let scale = 1;
      let panX = 0;
      let panY = 0;
      const drawn = content ? getComputedStyle(content).transform : 'none';
      if (drawn && drawn !== 'none') {
        const box = new DOMMatrixReadOnly(drawn);
        scale = box.a;
        panX = box.e;
        panY = box.f;
      }
      if (published) scale = published();
      const reaches = tally.reaches;
      return {
        landed: tally.landed,
        dropped: tally.dropped,
        refused: tally.refused,
        fromOutlet: tally.fromOutlet,
        fromInlet: tally.fromInlet,
        byKeyboard: tally.byKeyboard,
        reachMs: reaches.length
          ? Math.round(reaches.reduce((sum, one) => sum + one, 0) / reaches.length)
          : null,
        turnedClean: tally.turnedClean,
        snagged: tally.snagged,
        nudged: tally.nudged,
        escaped: tally.escaped,
        reachedPort: tally.reachedPort,
        moves: tally.moves,
        worstFrameMs: tally.worst,
        nodes: root?.querySelectorAll('.wdg-graph-node').length ?? 0,
        ports: root?.querySelectorAll('.wdg-port').length ?? 0,
        cordsDrawn: root?.querySelectorAll('.wdg-graph-cord:not([data-pending])').length ?? 0,
        scale,
        panX,
        panY,
        holding: held?.what ?? 'nothing',
      };
    },

    clear() {
      tally = blank();
    },
  };
}

export function useWatch(trace: Trace): Watch {
  const watch = useMemo(() => makeWatch(trace), [trace]);
  useEffect(() => () => watch.attach(null), [watch]);
  return watch;
}

/**
 * The readings, on a cadence of their own.
 *
 * Called from a leaf and nowhere else. The graph is not below this in the
 * tree, so four readings a second cost four renders of a definition list and
 * nothing at all of the canvas being measured.
 */
export function useReading(watch: Watch, every = 250): Reading {
  const [reading, setReading] = useState<Reading>(() => watch.read());
  useEffect(() => {
    // Once the canvas has actually painted, and not before. `Graph` draws no
    // cords on its first commit — it has not measured its ports yet — so a
    // reading taken in a mount effect says nothing is drawn, which is true for
    // one frame and reads as an alarm.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReading(watch.read()));
    });
    const timer = window.setInterval(() => setReading(watch.read()), every);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.clearInterval(timer);
    };
  }, [watch, every]);
  return reading;
}
