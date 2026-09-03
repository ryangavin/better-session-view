import type { ReactNode } from 'react';
import './debug.css';

/**
 * The frame a debugging page is built in.
 *
 * A harness is the same shape every time: what you are looking at, a bar of
 * controls in captioned groups, a status line, and the body — rows on a time
 * axis, plots, a table. The frame exists so a new harness is that shape by
 * default, in the suite's chrome, instead of a page that grows its own bar,
 * its own group and its own idea of a caption.
 *
 * It knows nothing about what it frames. Mount it as a page of its own or
 * inside a `Modal` in the app; the layout fills whatever it is given.
 */
export interface HarnessProps {
  title: string;
  /** What is under the lens: a select of tracks, a chooser of fixtures. */
  subject?: ReactNode;
  /** Printed at the end of the head: the verdict, or a note. */
  status?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Harness({ title, subject, status, className, children }: HarnessProps) {
  return (
    <div className={`wdg wdg-harness${className ? ` ${className}` : ''}`}>
      <div className="wdg-harness-head">
        <span className="wdg-harness-title">{title}</span>
        {subject && <span className="wdg-harness-subject">{subject}</span>}
        {status && <span className="wdg-harness-status">{status}</span>}
      </div>
      <div className="wdg-harness-body">{children}</div>
    </div>
  );
}

/** A line of groups; wraps when the window is narrow. */
export function Toolbar({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={`wdg wdg-toolbar${className ? ` ${className}` : ''}`}>{children}</div>;
}

/** Controls that belong together, under one caption. */
export interface GroupProps {
  caption: string;
  title?: string;
  className?: string;
  children?: ReactNode;
}

export function Group({ caption, title, className, children }: GroupProps) {
  return (
    <span className={`wdg wdg-group${className ? ` ${className}` : ''}`} title={title}>
      <span className="wdg-group-caption">{caption}</span>
      {children}
    </span>
  );
}

/** One line that says how things stand. */
export interface StatusProps {
  tone?: 'normal' | 'good' | 'bad' | 'quiet';
  children?: ReactNode;
  className?: string;
}

export function Status({ tone = 'normal', children, className }: StatusProps) {
  return (
    <span className={`wdg wdg-status${className ? ` ${className}` : ''}`} data-tone={tone}>
      {children}
    </span>
  );
}

/** Plots or facts laid side by side, wrapping. */
export function Shelf({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={`wdg wdg-shelf${className ? ` ${className}` : ''}`}>{children}</div>;
}
