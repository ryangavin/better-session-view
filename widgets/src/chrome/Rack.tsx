import type { ReactNode } from 'react';
import { Device, type DeviceProps } from './Device.tsx';
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
 * **A rack is a bracket, not a box.** Live sandwiches the chain's devices
 * between two bookends — the rack's own face on the left, a closing strip on
 * the right — and they sit at the same height as every other device in the run.
 * Putting them inside the rack's *body* instead would cost each one a title bar
 * and the body's padding, so a device would get shorter for being in a rack and
 * shorter again for being in a rack in a rack. The fixed height is worth having
 * precisely because it doesn't care how deep you are, so the face and the cap
 * are siblings of the devices rather than parents of them.
 *
 * Three panes, each shown only if it's given something: the macros, the chain
 * list, and the selected chain's devices. Live puts a title-bar button on each
 * to fold it away; a host does the same by not passing it.
 */
export interface RackProps extends Omit<DeviceProps, 'children' | 'className'> {
  /** The macro panel. Knobs the host has bound — this only lays them out. */
  macros?: ReactNode;
  /** The chains, by name, the way `Segmented` takes its members. */
  chains?: readonly string[];
  chainAt?: number;
  onChain?(next: number): void;
  /** The selected chain's devices. A `Chain`, usually. */
  children?: ReactNode;
  className?: string;
}

export function Rack({
  macros,
  chains,
  chainAt = 0,
  onChain,
  children,
  className,
  ...device
}: RackProps) {
  const folded = device.folded ?? false;

  return (
    <div
      className={`wdg wdg-rack${className ? ` ${className}` : ''}`}
      {...((device.on ?? true) ? { 'data-on': '' } : {})}
      {...(folded ? { 'data-folded': '' } : {})}
      {...(device.selected ? { 'data-selected': '' } : {})}
    >
      <Device {...device} className="wdg-rack-face">
        <div className="wdg-rack-panes">
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
        </div>
      </Device>
      {children && <div className="wdg-rack-devices">{children}</div>}
      {!folded && <span className="wdg-rack-end" aria-hidden="true" />}
    </div>
  );
}
