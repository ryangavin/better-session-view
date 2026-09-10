import { useRef } from 'react';
import { COLUMN_LABELS, type Column } from '../listing.ts';
import { COLUMN_MAX, COLUMN_SIZES } from '../useLibraryColumnWidths.ts';

/** A separate focus target keeps resizing away from header sorting and native dragging. */
export function ColumnResize({ column, width, resize }: {
  column: Column; width: number; resize(column: Column, width: number): void;
}) {
  const gesture = useRef<{ id: number; x: number; width: number } | null>(null);
  return <span className="mf-column-resize" role="separator" aria-orientation="vertical"
    aria-label={`${COLUMN_LABELS[column]} column width`} tabIndex={0} draggable={false}
    aria-valuemin={COLUMN_SIZES[column].min} aria-valuemax={COLUMN_MAX} aria-valuenow={width}
    aria-valuetext={`${width} pixels`}
    title="Drag to resize; Left/Right adjusts width; double-click or Home resets this column"
    onClick={event => { event.preventDefault(); event.stopPropagation(); }}
    onDoubleClick={event => { event.stopPropagation(); resize(column, COLUMN_SIZES[column].default); }}
    onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.focus();
      gesture.current = { id: event.pointerId, x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const from = gesture.current;
      if (from?.id === event.pointerId) resize(column, from.width + event.clientX - from.x);
    }}
    onPointerUp={event => {
      if (gesture.current?.id !== event.pointerId) return;
      gesture.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { gesture.current = null; }}
    onLostPointerCapture={() => { gesture.current = null; }}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      resize(column, event.key === 'Home' ? COLUMN_SIZES[column].default : width + (event.key === 'ArrowLeft' ? -8 : 8));
    }} />;
}
