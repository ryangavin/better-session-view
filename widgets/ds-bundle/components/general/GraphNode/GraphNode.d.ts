import * as React from 'react';

/**
 * GraphNode — from bsv-widgets@0.1.0.
 */
export interface GraphNodeProps {
  /** The host's own id for this node. Only ever handed back to it. */
  id: string;
  /** Position in graph coordinates — the canvas's own units, before zoom. */
  x: number;
  y: number;
  /** A `Device`, usually. Whatever it is, it is the size it wants to be. */
  children?: React.ReactNode;
  className?: string;
}

export declare const GraphNode: React.ComponentType<GraphNodeProps>;
