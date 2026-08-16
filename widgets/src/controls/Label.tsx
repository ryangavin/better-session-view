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

export function Label({ children, heading = false, className }: LabelProps) {
  return (
    <span
      className={`wdg wdg-label${heading ? ' wdg-label-heading' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </span>
  );
}

/** `live.line`. The rule that separates one section of a device from the next. */
export function Divider({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <span
      className={`wdg wdg-divider wdg-divider-${orientation}${className ? ` ${className}` : ''}`}
      role="separator"
      aria-orientation={orientation}
    />
  );
}
