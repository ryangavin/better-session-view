import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { format } from '../param/format.ts';
import { clamp, fractionOf, quantize, stepSize, valueAt, type Param } from '../param/param.ts';
import { isFine } from './platform.ts';

/**
 * The one gesture every continuous control in a DAW shares.
 *
 * A knob, a fader, a number field and a send amount are the same interaction
 * wearing four faces: grab where you are, drag, hold a modifier for fine, let
 * go. Written per widget it is the same bug four times — which is what it was
 * here, across three `<input type="range">` elements that each jumped to the
 * click instead of grabbing, and two copies of the readback dance around them.
 *
 * So the widgets are skins and this is the control. Nothing below knows what a
 * knob looks like, and nothing in a widget re-derives what a drag means.
 */

export type ParamAxis = 'vertical' | 'horizontal';

/**
 * Where a drag starts from: the value the control already holds, or the point
 * that was pressed.
 *
 * `value` for everything with a knob's problem — a small control where jumping
 * to the click throws away most of the range. `pointer` for a surface where the
 * position *is* the value and the pointer is already pointing at one: a plane
 * you drop a handle onto, a long fader. Accrual after the anchor is identical
 * either way, so a control whose `travel` matches its drawn extent tracks the
 * pointer exactly, and the fine modifier still slows it from where it is.
 */
export type ParamAnchor = 'value' | 'pointer';

/** Pixels of travel for the full range, before the fine modifier stretches it. */
const DEFAULT_TRAVEL = 200;

/** How much further a fine drag has to go to cover the same ground. */
const FINE_FACTOR = 10;

/**
 * How much further a range drag goes than a value drag.
 *
 * Slower, because a range runs from one end of the control to the other in
 * both directions — twice the ground of a value — and because it is the
 * gesture you make once and then leave alone.
 */
const DEPTH_REACH = 1.5;

/**
 * How far a pointer may wander and still have been a click.
 *
 * Only the double-click reads this. Two quick drags land inside the platform's
 * double-click time and the browser reports a `dblclick` for the pair, which
 * used to throw both of them away and reset the parameter — the one gesture in
 * a mixer that loses work you meant to keep.
 */
const CLICK_SLOP = 3;

export interface ParamGestureOptions {
  param: Param;
  /** What the control currently holds. A drag anchors here and then ignores it. */
  value: number;
  /**
   * How far something else may carry this control from its value, signed.
   *
   * Given together with `onDepth`, holding shift turns the same drag into a
   * drag on *this* instead — so a range is set with the gesture that sets the
   * value, on the control the value is set on, rather than in a second place.
   * Left out, shift does nothing and the control is what it always was.
   */
  depth?: number;
  onDepth?(next: number): void;
  onChange(next: number): void;
  /** The gesture ended — the moment a host can stop preferring its local value. */
  onRelease?(): void;
  disabled?: boolean;
  axis?: ParamAxis;
  /** Defaults to `value` — Live grabs a control where it is rather than jumping. */
  anchor?: ParamAnchor;
  travel?: number;
  label?: string;
  /** Authoritative text, when something else is spelling the value. */
  display?: string;
}

export interface ParamSurfaceProps {
  role: 'slider';
  tabIndex: number;
  'aria-label': string | undefined;
  'aria-valuemin': number;
  'aria-valuemax': number;
  'aria-valuenow': number;
  'aria-valuetext': string;
  'aria-orientation': ParamAxis;
  'aria-disabled': true | undefined;
  'data-dragging': '' | undefined;
  onPointerDown(e: PointerEvent<HTMLElement>): void;
  onPointerMove(e: PointerEvent<HTMLElement>): void;
  onPointerUp(e: PointerEvent<HTMLElement>): void;
  onPointerCancel(e: PointerEvent<HTMLElement>): void;
  onLostPointerCapture(e: PointerEvent<HTMLElement>): void;
  onDoubleClick(e: MouseEvent<HTMLElement>): void;
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
}

export interface ParamGesture {
  dragging: boolean;
  /** Where the value sits on the control, 0 to 1, tapered. */
  fraction: number;
  /** What to print: the authoritative text if there is one, else our own. */
  text: string;
  props: ParamSurfaceProps;
}

export function useParamGesture(options: ParamGestureOptions): ParamGesture {
  const {
    param,
    value,
    onChange,
    onRelease,
    disabled = false,
    depth,
    onDepth,
    axis = 'vertical',
    anchor = 'value',
    travel = DEFAULT_TRAVEL,
    label,
    display,
  } = options;

  const [dragging, setDragging] = useState(false);

  // Every moving part reads through a ref so the handlers stay stable and a
  // drag in flight can't be re-anchored by a re-render underneath it.
  const latest = useRef({ param, value, onChange, onRelease, disabled, depth, onDepth });
  latest.current = { param, value, onChange, onRelease, disabled, depth, onDepth };

  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    /** Where the grab was, which is what the wander is measured from. */
    ox: number;
    oy: number;
    fraction: number;
    depth: number;
    /** Screen pixels per CSS pixel here, measured once at the grab. */
    scale: number;
    /** What to put back if the drag is abandoned. */
    from: number;
    fromDepth: number;
  } | null>(null);
  /** Whether the last gesture moved at all, which is what a double-click asks. */
  const wandered = useRef(false);
  const pending = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const sent = useRef(Number.NaN);

  const flush = useCallback(() => {
    frame.current = null;
    const next = pending.current;
    pending.current = null;
    if (next !== null) latest.current.onChange(next);
  }, []);

  /**
   * At most one write per frame. A pointer can report faster than the browser
   * paints, and on the far end of this is a WebSocket and a Live Set.
   */
  const emit = useCallback(
    (next: number) => {
      if (next === sent.current) return;
      sent.current = next;
      pending.current = next;
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /**
   * Deliver whatever is waiting on the frame, now, and say the gesture is over.
   *
   * Separate from `finish` because the gesture that has no drag to end still
   * has a write to land: a double-click leaves nothing in hand — the pointerup
   * before it already closed the drag — and its reset used to sit on the frame
   * queue with no release behind it, so a host holding a local value waited out
   * its deadline before believing the default had happened.
   */
  const settle = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      flush();
    }
    latest.current.onRelease?.();
  }, [flush]);

  const finish = useCallback(() => {
    if (drag.current === null) return;
    drag.current = null;
    setDragging(false);
    settle();
  }, [settle]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const now = latest.current;
      if (now.disabled || e.button !== 0) return;
      // Not a jump to the click, by default. Live grabs the control where it
      // already is, and an absolute-positioned control is unusable on anything
      // small anyway — a 26px pan field would have four reachable values.
      //
      // A plane is the case that argues back: it is large, and the handle on it
      // is a position rather than a quantity, so pressing somewhere and having
      // the handle stay put reads as the control ignoring the pointer. Those
      // ask for `pointer`, and only the anchor changes — everything after it is
      // the same accrual.
      e.preventDefault();
      e.currentTarget.focus();
      e.currentTarget.setPointerCapture(e.pointerId);
      sent.current = now.value;
      const box = e.currentTarget.getBoundingClientRect();
      // A pointer reports screen pixels; `travel` is in the element's own. On a
      // canvas that has been zoomed those are not the same unit, and comparing
      // them directly is what made a handle slide out from under the pointer at
      // any zoom but 1. The ratio of the drawn box to the laid-out box is the
      // whole of the difference, whatever stack of transforms produced it.
      const drawn = e.currentTarget.offsetWidth;
      const scale = drawn > 0 ? box.width / drawn : 1;
      let fraction = fractionOf(now.param, now.value);
      if (anchor === 'pointer') {
        const along =
          axis === 'vertical'
            ? (box.bottom - e.clientY) / (box.height || 1)
            : (e.clientX - box.left) / (box.width || 1);
        fraction = Math.max(0, Math.min(1, along));
        emit(valueAt(now.param, fraction));
      }
      wandered.current = false;
      drag.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        ox: e.clientX,
        oy: e.clientY,
        fraction,
        depth: now.depth ?? 1,
        scale: scale > 0 ? scale : 1,
        from: now.value,
        fromDepth: now.depth ?? 1,
      };
      setDragging(true);
    },
    [anchor, axis, emit],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const held = drag.current;
      if (held === null || held.id !== e.pointerId) return;
      const shift = axis === 'vertical' ? held.y - e.clientY : e.clientX - held.x;
      if (Math.abs(e.clientX - held.ox) > CLICK_SLOP || Math.abs(e.clientY - held.oy) > CLICK_SLOP) {
        wandered.current = true;
      }
      const moved = shift / held.scale;
      held.x = e.clientX;
      held.y = e.clientY;
      // Distance accrues onto the fraction rather than being measured from the
      // grab point, so taking the fine modifier mid-drag slows the control from
      // where it is instead of teleporting it.
      const reach = travel * (isFine(e) ? FINE_FACTOR : 1);
      const now = latest.current;
      // Shift drags the range instead of the value, on the same control and in
      // the same direction. Both accrue from wherever the pointer last was, so
      // taking or dropping shift halfway through a drag carries on from where
      // the control is rather than jumping — the same property that lets the
      // fine modifier be taken late.
      if (e.shiftKey && now.onDepth) {
        held.depth = Math.max(-1, Math.min(1, held.depth + moved / (reach * DEPTH_REACH)));
        now.onDepth(held.depth);
        return;
      }
      held.fraction = Math.max(0, Math.min(1, held.fraction + moved / reach));
      emit(valueAt(now.param, held.fraction));
    },
    [axis, emit, travel],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (drag.current?.id === e.pointerId) finish();
    },
    [finish],
  );

  /**
   * A drag that is still in hand, put back where it was found.
   *
   * Escape is the one way out of a gesture that does not commit to a number,
   * and every drag in a DAW wants it: the value under a pointer has already
   * been written to the engine several times over, so there is no undo to
   * reach for and nothing else that says "not that".
   */
  const abandon = useCallback(() => {
    const held = drag.current;
    if (held === null) return;
    const now = latest.current;
    if (now.onDepth && held.fromDepth !== held.depth) now.onDepth(held.fromDepth);
    sent.current = Number.NaN;
    emit(quantize(now.param, held.from));
    finish();
  }, [emit, finish]);

  /**
   * Capture can go without a pointerup ever arriving — the element is
   * unmounted, a host swaps the face under the hand, the platform takes the
   * pointer for a gesture of its own. Without this the drag stays open, and
   * the control follows a pointer with no button held the moment it comes
   * back. `pointerup` releases capture too, so this usually arrives on a
   * gesture `finish` has already closed, and finds nothing to do.
   */
  const onLostPointerCapture = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (drag.current?.id === e.pointerId) finish();
    },
    [finish],
  );

  const onDoubleClick = useCallback((e: MouseEvent<HTMLElement>) => {
    const now = latest.current;
    if (now.disabled) return;
    // Two quick drags land inside the platform's double-click time and are
    // reported as one, and taking the parameter to its default on that pair
    // throws away both of them.
    if (wandered.current) return;
    // Shift is the range on the way down, so it is the range on the way back:
    // shift-double-click takes the depth to nothing and leaves the value alone.
    if (e.shiftKey && now.onDepth) {
      now.onDepth(0);
      if (drag.current !== null) finish();
      else settle();
      return;
    }
    emit(quantize(now.param, now.param.defaultValue));
    if (drag.current !== null) finish();
    else settle();
  }, [emit, finish, settle]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const now = latest.current;
      if (now.disabled) return;
      if (e.key === 'Escape') {
        if (drag.current === null) return;
        e.preventDefault();
        e.stopPropagation();
        abandon();
        return;
      }
      const step = stepSize(now.param, isFine(e));
      let next: number;
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          next = now.value + step;
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          next = now.value - step;
          break;
        case 'PageUp':
          next = now.value + step * 10;
          break;
        case 'PageDown':
          next = now.value - step * 10;
          break;
        case 'Home':
          next = now.param.min;
          break;
        case 'End':
          next = now.param.max;
          break;
        default:
          return;
      }
      e.preventDefault();
      // A focused control owns its keystroke. The host may well be listening on
      // the window for the same keys — this app's grid moves its active cell on
      // the arrows — and it must not also act on one aimed at a fader.
      e.stopPropagation();
      sent.current = Number.NaN;
      emit(quantize(now.param, clamp(now.param, next)));
      now.onRelease?.();
    },
    [abandon, emit],
  );

  return {
    dragging,
    fraction: fractionOf(param, value),
    text: display ?? format(param, value),
    props: {
      role: 'slider',
      tabIndex: disabled ? -1 : 0,
      'aria-label': label,
      'aria-valuemin': param.min,
      'aria-valuemax': param.max,
      'aria-valuenow': value,
      'aria-valuetext': display ?? format(param, value),
      'aria-orientation': axis,
      'aria-disabled': disabled || undefined,
      'data-dragging': dragging ? '' : undefined,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture,
      onDoubleClick,
      onKeyDown,
    },
  };
}
