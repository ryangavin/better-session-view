import { type Ref, type ReactNode } from 'react';
import './chrome.css';
/**
 * The canvas a chain becomes when the order stops being a line.
 *
 * This is the sibling layout [`Chain`](./Chain.tsx) was written to leave room
 * for, and it is a layout in the same sense: it takes children, never a list of
 * devices, so it never learns why they are arranged the way they are. A strip
 * puts its children in a row; this one puts them where the host says. The same
 * `Device` hangs off either.
 *
 * It marks and reports; it does not perform. A dragged node emits a position
 * and stays where the host last put it, and a cord dragged between two ports
 * emits a pair of ids and is drawn only once the host passes it back in
 * `cords` — the same bargain a control makes when it emits a value and lets the
 * host write it. **The one rule the graph does enforce is sides**, because that
 * one is the drawing's own: an outlet connects to an inlet, and a cord between
 * two outlets has no shape. That is a rule about the *cord*, not about the
 * gesture — a drag runs from either end, and the pair is normalised on its way
 * out. Whether *this* outlet may reach *that* inlet is a question about what
 * they carry, and this module has no idea.
 *
 * Pan and zoom are the graph's own, the way a chain's scroll position is the
 * chain's. A host may read the current zoom through `viewRef`, but cannot write
 * it — publishing a view does not move ownership of it.
 */
export interface GraphCord {
    /** An outlet's `Port` id. */
    from: string;
    /** An inlet's `Port` id. */
    to: string;
    /** Surfaced as `data-kind` so a host can colour its own vocabulary. */
    kind?: string;
}
export interface GraphProps {
    /** `GraphNode`s. */
    children?: ReactNode;
    /**
     * Every cord to draw. A cord naming a port that isn't mounted is skipped
     * rather than dropped — nodes mount in their own time, and a host shouldn't
     * have to sequence its own state against React's.
     */
    cords?: readonly GraphCord[];
    /**
     * A cord was dragged between two ports. Always outlet first, whichever end
     * the gesture started at, so a host never has to ask which way it was drawn.
     */
    onConnect?(from: string, to: string): void;
    /** A node was dragged, or arrow-keyed, to a new position. */
    onMove?(id: string, x: number, y: number): void;
    /** The empty canvas was pressed, for a host that clears a selection on it. */
    onClearSelection?(): void;
    /**
     * An imperative, read-only view of the canvas.
     *
     * A ref keeps a host that only needs the scale out of the graph's render
     * path: wheel zoom updates this component, but does not publish a React value
     * that would re-render every node under it.
     */
    viewRef?: Ref<GraphView>;
    minZoom?: number;
    maxZoom?: number;
    /** Spacing of the background dots, in graph units. */
    grid?: number;
    className?: string;
}
export interface GraphView {
    /** The current zoom, read at the moment it is needed. */
    scale(): number;
}
export declare function Graph({ children, cords, onConnect, onMove, onClearSelection, viewRef, minZoom, maxZoom, grid, className, }: GraphProps): import("react").JSX.Element;
export interface GraphNodeProps {
    /** The host's own id for this node. Only ever handed back to it. */
    id: string;
    /** Position in graph coordinates — the canvas's own units, before zoom. */
    x: number;
    y: number;
    /** A `Device`, usually. Whatever it is, it is the size it wants to be. */
    children?: ReactNode;
    className?: string;
}
/**
 * One node's place on the canvas.
 *
 * Positions are the host's, exactly as a chain's order is: this reports a drag
 * and redraws only when the host hands a new `x` and `y` back. That is what
 * lets the same state be undone, saved, or refused.
 *
 * A node drags from anywhere a control hasn't already claimed. `useParamGesture`
 * calls `preventDefault` when it takes a pointer, so a knob turning inside a
 * node says so and the node stays put — which is why there is no drag handle
 * here, and no rule about which part of a faceplate counts as furniture.
 */
export declare function GraphNode({ id, x, y, children, className }: GraphNodeProps): import("react").JSX.Element;
