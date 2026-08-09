import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 140;
const GRID_RESERVE = 64;
const KEY_STEP = 8;

interface Drag {
  pointerId: number;
  startY: number;
  startHeight: number;
  table: HTMLTableElement;
}

function meterTable(node: HTMLElement): HTMLTableElement | null {
  return node.closest<HTMLTableElement>('table.grid');
}

function currentHeight(table: HTMLTableElement): number {
  const raw = getComputedStyle(table).getPropertyValue('--meter-panel-h');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : DEFAULT_HEIGHT;
}

function maximumHeight(table: HTMLTableElement): number {
  const viewport = table.closest<HTMLElement>('.grid-wrap');
  return Math.floor(
    Math.max(MIN_HEIGHT, (viewport?.clientHeight ?? DEFAULT_HEIGHT) - GRID_RESERVE),
  );
}

/** A structural row above the meters that resizes their shared table-owned height. */
export function MeterResizeHandle() {
  const handleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [maxHeight, setMaxHeight] = useState(DEFAULT_HEIGHT);
  const [dragging, setDragging] = useState(false);

  const applyHeight = useCallback((table: HTMLTableElement, requested: number) => {
    const max = maximumHeight(table);
    const next = Math.round(Math.max(MIN_HEIGHT, Math.min(max, requested)));
    table.style.setProperty('--meter-panel-h', `${next}px`);
    setHeight(next);
    setMaxHeight(max);
  }, []);

  // Keep a resized panel inside the viewport if the browser itself changes
  // size. Reading the table's variable also restores this handle's aria value
  // when the meter footer is hidden and shown again.
  useEffect(() => {
    const sync = () => {
      const handle = handleRef.current;
      if (!handle) return;
      const table = meterTable(handle);
      if (table) applyHeight(table, currentHeight(table));
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [applyHeight]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const table = meterTable(event.currentTarget);
    if (!table) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: currentHeight(table),
      table,
    };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    applyHeight(drag.table, drag.startHeight + drag.startY - event.clientY);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const table = meterTable(event.currentTarget);
    if (!table) return;
    const current = currentHeight(table);
    let next: number | null = null;
    if (event.key === 'ArrowUp') next = current + KEY_STEP;
    else if (event.key === 'ArrowDown') next = current - KEY_STEP;
    else if (event.key === 'PageUp') next = current + KEY_STEP * 4;
    else if (event.key === 'PageDown') next = current - KEY_STEP * 4;
    else if (event.key === 'Home') next = MIN_HEIGHT;
    else if (event.key === 'End') next = maximumHeight(table);
    if (next === null) return;
    event.preventDefault();
    applyHeight(table, next);
  };

  return (
    <div
      ref={handleRef}
      className={`meter-resize-handle${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-label="Resize mixer"
      aria-orientation="horizontal"
      aria-valuemin={MIN_HEIGHT}
      aria-valuemax={Math.round(maxHeight)}
      aria-valuenow={height}
      aria-valuetext={`${height} pixels high`}
      tabIndex={0}
      title="Drag to resize mixer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      onKeyDown={onKeyDown}
    />
  );
}
