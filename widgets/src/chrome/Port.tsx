import { useContext, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { GraphContext, type PortSide } from './graphContext.js';
import './chrome.css';

/**
 * One connection point on a device, and the piece a strip never needed.
 *
 * In a chain, adjacency *is* the connection: two devices side by side are wired
 * together and there is nothing to draw. A graph has to draw it, so it needs
 * somewhere for a cord to end — which is the whole of what this is.
 *
 * It knows nothing about what flows through it. `kind` is an opaque string the
 * host names and styles with `[data-kind]`; this module has no list of kinds
 * and never will, for the same reason it has no list of devices. A port that
 * knew audio from video would be a port that knew what it was plugged into.
 */
export interface PortProps {
  /**
   * Unique across the whole graph, not just this node — a cord names two of
   * these and nothing else, so they are the graph's only addresses.
   */
  id: string;
  side: PortSide;
  /** Shown beside the port, and used as its accessible name. */
  label?: string;
  /** The host's own vocabulary, surfaced as `data-kind` for it to style. */
  kind?: string;
  /** Whether a cord already lands here. The host knows; the port doesn't. */
  connected?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Port({ id, side, label, kind, connected, disabled, className }: PortProps) {
  const graph = useContext(GraphContext);
  const ref = useRef<HTMLButtonElement | null>(null);
  const register = graph?.register;

  useEffect(() => {
    if (!register) return;
    register(id, side, ref.current);
    return () => register(id, side, null);
  }, [register, id, side]);

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || !graph) return;
    // Both, and for different reasons: the default would start a text
    // selection across the canvas, and the bubble would drag the node.
    e.preventDefault();
    e.stopPropagation();
    graph.startCord(id, side, e);
  };

  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !graph) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    graph.armCord(id, side);
  };

  return (
    <span className={`wdg-port-slot${className ? ` ${className}` : ''}`} data-side={side}>
      <button
        ref={ref}
        type="button"
        className="wdg-port"
        data-side={side}
        {...(kind === undefined ? {} : { 'data-kind': kind })}
        {...(connected ? { 'data-connected': '' } : {})}
        {...(graph?.cordFrom === id ? { 'data-pending': '' } : {})}
        {...(graph?.cordOver === id ? { 'data-over': '' } : {})}
        disabled={disabled}
        aria-label={label ?? id}
        title={label}
        onPointerDown={down}
        onPointerEnter={() => graph?.hoverPort(id)}
        onPointerLeave={() => graph?.hoverPort(null)}
        onKeyDown={key}
      />
      {label !== undefined && <span className="wdg-port-label">{label}</span>}
    </span>
  );
}
