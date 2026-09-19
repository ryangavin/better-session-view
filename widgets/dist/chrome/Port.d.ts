import { type PortSide } from './graphContext.ts';
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
     * Unique **for this side** across the whole graph — a cord names two of these
     * and nothing else, so they are the graph's only addresses.
     *
     * Per side rather than outright, because a node's colour inlet and its colour
     * outlet are both honestly called `c` and a host should not have to spell one
     * of them differently to say so. A cord is unambiguous either way: its `from`
     * is an outlet and its `to` an inlet. See [`portKey`](./graphContext.ts).
     */
    id: string;
    side: PortSide;
    /** Shown beside the port, and used as its accessible name. */
    label?: string;
    /** Keep the accessible name and tooltip without printing a second caption. */
    showLabel?: boolean;
    /** The host's own vocabulary, surfaced as `data-kind` for it to style. */
    kind?: string;
    /** Whether a cord already lands here. The host knows; the port doesn't. */
    connected?: boolean;
    disabled?: boolean;
    className?: string;
}
export declare function Port({ id, side, label, showLabel, kind, connected, disabled, className, }: PortProps): import("react").JSX.Element;
