import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { format } from '../param/format.js';
import { clamp, fractionOf, quantize, stepSize, valueAt, type Param } from '../param/param.js';
import { isFine } from './platform.js';

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
    fraction: number;
    depth: number;
  } | null>(null);
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

  const finish = useCallback(() => {
    if (drag.current === null) return;
    drag.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      flush();
    }
    setDragging(false);
    latest.current.onRelease?.();
  }, [flush]);

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
      let fraction = fractionOf(now.param, now.value);
      if (anchor === 'pointer') {
        const box = e.currentTarget.getBoundingClientRect();
        const along =
          axis === 'vertical'
            ? (box.bottom - e.clientY) / (box.height || 1)
            : (e.clientX - box.left) / (box.width || 1);
        fraction = Math.max(0, Math.min(1, along));
        emit(valueAt(now.param, fraction));
      }
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, fraction, depth: now.depth ?? 1 };
      setDragging(true);
    },
    [anchor, axis, emit],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const held = drag.current;
      if (held === null || held.id !== e.pointerId) return;
      const moved = axis === 'vertical' ? held.y - e.clientY : e.clientX - held.x;
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

  const onDoubleClick = useCallback((e: MouseEvent<HTMLElement>) => {
    const now = latest.current;
    if (now.disabled) return;
    // Shift is the range on the way down, so it is the range on the way back:
    // shift-double-click takes the depth to nothing and leaves the value alone.
    if (e.shiftKey && now.onDepth) {
      now.onDepth(0);
      finish();
      return;
    }
    emit(quantize(now.param, now.param.defaultValue));
    finish();
  }, [emit, finish]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const now = latest.current;
      if (now.disabled) return;
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
    [emit],
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
      onDoubleClick,
      onKeyDown,
    },
  };
}
