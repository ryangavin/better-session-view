import type { ReactNode } from 'react';
import './controls.css';
/**
 * `live.comment`. The text that names a control, and the reason a faceplate
 * reads as rows rather than as a scattering of knobs.
 *
 * It carries the type rhythm — family, size, tracking, case — so a device panel
 * gets that from one place instead of from each component's own stylesheet.
 */
export interface LabelProps {
    children: ReactNode;
    /** Section headings sit above a group; a plain label sits under a control. */
    heading?: boolean;
    className?: string;
}
export declare function Label({ children, heading, className }: LabelProps): import("react").JSX.Element;
/** `live.line`. The rule that separates one section of a device from the next. */
export declare function Divider({ orientation, className, }: {
    orientation?: 'horizontal' | 'vertical';
    className?: string;
}): import("react").JSX.Element;
