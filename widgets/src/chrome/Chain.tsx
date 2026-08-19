import { Children, type CSSProperties, type ReactNode } from 'react';
import './chrome.css';

/**
 * The run a device sits in. Live's device view, and the chain inside a rack.
 *
 * It takes children and not devices. That is the whole point: a chain that
 * accepted a list of devices would own the order, and owning the order means
 * knowing what a device is — which is the app's job and, later, a graph's. A
 * component that lays its children in a row doesn't know why they are in that
 * order, so the same `Device` hangs off a strip here and off
 * [`Graph`](./Graph.tsx)'s canvas without learning which one it's in.
 *
 * Linear is not a limitation smuggled in here, either. It's Ableton's model:
 * a chain runs in series, and anything parallel is a rack containing chains
 * that each run in series. See [`Rack`](./Rack.tsx).
 */
export interface ChainProps {
  /** The devices, in order. */
  children?: ReactNode;
  /**
   * Where a dragged device would land, counted between children — 0 before the
   * first, `count` after the last. The strip draws the mark; whoever is
   * dragging decides whether the move is legal and performs it, the way a
   * gesture emits a value and the host writes it.
   */
  dropAt?: number;
  /** What an empty chain says. Live's is "Drop an audio effect here". */
  placeholder?: string;
  /**
   * How many rows of controls a device in this chain is tall — two, the way
   * Live's footer is, unless a host says otherwise. It's the chain that fixes
   * the height, never the device: a device on its own is as tall as its
   * faceplate, which is what [`Graph`](./Graph.tsx) wants, having no footer.
   */
  rows?: number;
  /** In px, if a host would rather say it outright than in rows. */
  height?: number;
  className?: string;
}

export function Chain({ children, dropAt, placeholder, rows, height, className }: ChainProps) {
  const devices = Children.toArray(children);
  const marked =
    dropAt === undefined
      ? devices
      : [
          ...devices.slice(0, dropAt),
          <span key="wdg-drop" className="wdg-chain-drop" aria-hidden="true" />,
          ...devices.slice(dropAt),
        ];

  return (
    <div
      className={`wdg wdg-chain${className ? ` ${className}` : ''}`}
      style={
        {
          ...(rows === undefined ? {} : { '--wdg-device-rows': rows }),
          ...(height === undefined ? {} : { '--wdg-chain-height': `${height}px` }),
        } as CSSProperties
      }
    >
      {devices.length === 0 && placeholder !== undefined ? (
        <span className="wdg-chain-empty">{placeholder}</span>
      ) : (
        marked
      )}
    </div>
  );
}
