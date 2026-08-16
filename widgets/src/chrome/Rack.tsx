import type { ReactNode } from 'react';
import { Device, type DeviceProps } from './Device.js';
import './chrome.css';

/**
 * A device that contains chains. Ableton's answer to everything parallel.
 *
 * This is where the model stops being a line without stopping being Ableton's:
 * a chain runs in series, and a rack is one device in that series whose body
 * holds chains of its own. Racks nest, so a rack in a chain in a rack is
 * ordinary — which is why this composes `Device` rather than reimplementing a
 * shell, and why its own body is chains all the way down.
 *
 * It's also where the macros live, because a rack is the only thing in Live
 * with a face of its own rather than its devices'.
 *
 * Three panes, each shown only if it's given something: the macros, the chain
 * list, and the selected chain's devices. Live puts a title-bar button on each
 * to fold it away; a host does the same by not passing it.
 */
export interface RackProps extends Omit<DeviceProps, 'children'> {
  /** The macro panel. Knobs the host has bound — this only lays them out. */
  macros?: ReactNode;
  /** The chains, by name, the way `Segmented` takes its members. */
  chains?: readonly string[];
  chainAt?: number;
  onChain?(next: number): void;
  /** The selected chain's devices. A `Chain`, usually. */
  children?: ReactNode;
}

export function Rack({ macros, chains, chainAt = 0, onChain, children, ...device }: RackProps) {
  return (
    <Device {...device}>
      <div className="wdg-rack">
        {macros && <div className="wdg-rack-macros">{macros}</div>}
        {chains && chains.length > 0 && (
          <div className="wdg-rack-chains" role="radiogroup" aria-label={`${device.name} chains`}>
            {chains.map((name, at) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={at === chainAt}
                tabIndex={at === chainAt ? 0 : -1}
                onClick={() => onChain?.(at)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {children && <div className="wdg-rack-devices">{children}</div>}
      </div>
    </Device>
  );
}
