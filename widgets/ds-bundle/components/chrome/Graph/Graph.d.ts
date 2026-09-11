import * as React from 'react';

/**
 * Graph — from bsv-widgets@0.1.0.
 */
export interface GraphProps {
  /** `GraphNode`s. */
  children?: React.ReactNode;
  /** Every cord to draw. A cord naming a port that isn't mounted is skipped rather than dropped — nodes mount in their own ti */
  cords?: readonly GraphCord[];
  /** A cord was dragged between two ports. Always outlet first, whichever end the gesture started at, so a host never has to  */
  onConnect?: (from: string, to: string) => void;
  /** A node was dragged, or arrow-keyed, to a new position. */
  onMove?: (id: string, x: number, y: number) => void;
  /** The empty canvas was pressed, for a host that clears a selection on it. */
  onClearSelection?: () => void;
  /** An imperative, read-only view of the canvas. A ref keeps a host that only needs the scale out of the graph's render path */
  viewRef?: React.Ref;
  minZoom?: number;
  maxZoom?: number;
  /** Spacing of the background dots, in graph units. */
  grid?: number;
  className?: string;
}

export declare const Graph: React.ComponentType<GraphProps>;
