import { useState } from 'react';
import { Chain } from '../../../widgets/src/chrome/Chain.js';
import { Device } from '../../../widgets/src/chrome/Device.js';
import { Rack } from '../../../widgets/src/chrome/Rack.js';
import { ControlButton } from './Control.js';
import { IconSync } from './Icon.js';
import './DeviceChain.css';

/**
 * The selected track's device chain, along the bottom of the window.
 *
 * This is the first thing in the app drawn out of [`widgets/`](../../../widgets/README.md)
 * rather than its own components, and the boundary holds the way the mixer's
 * faders proved it could: `widgets/` takes a name and two booleans, and knows
 * nothing about `BSV`, the bridge, or Live. The adapting is all here, and it is
 * three lines of it, because a shell is a small thing.
 *
 * **Shells only, no faceplates.** Every device is a title bar with its name, its
 * activator and its fold state, and a rack additionally has its macro face and
 * its chain list. There are no knobs on any of them yet — parameters are a much
 * larger read than the structure, one `DeviceParameter` per control per device,
 * and they land as a field on `ChainDevice` when they land. What's here proves
 * the whole path: Live's chain, over the wire, into the widget library.
 *
 * **Read-only, and visibly so.** Nothing in this footer writes to Live, because
 * there is no write path for a device yet. The activator draws `Device.is_active`
 * and the fold triangle is absent rather than dead, which is `Device`'s own way
 * of saying a shell can't be folded from here.
 */
export interface DeviceChainProps {
  /** The track being shown. Its name, for the strip's own label. */
  name: string;
  devices: BSV.ChainDevice[];
  loading: boolean;
  failed: boolean;
  onRefresh(): void;
  onClose(): void;
}

/**
 * A rack, and the chain it currently has selected.
 *
 * Which chain is showing is this component's own state and deliberately not the
 * hook's: it's a view choice inside one rack, nothing over the wire depends on
 * it, and a rack in a rack needs its own copy anyway. Resetting when the track
 * changes falls out for free — the whole subtree is keyed by position, so a new
 * track builds new components.
 */
function RackShell({ device }: { device: BSV.ChainDevice }) {
  const [at, setAt] = useState(0);
  const chains = device.chains ?? [];
  const chain = chains[Math.min(at, chains.length - 1)];

  return (
    <Rack
      name={device.name}
      on={device.on}
      folded={device.folded}
      chains={chains.map((c) => c.name)}
      chainAt={at}
      onChain={setAt}
    >
      <Chain placeholder="No devices in this chain">
        {chain?.devices.map((nested, i) => (
          <DeviceShell key={`${i}:${nested.name}`} device={nested} />
        ))}
      </Chain>
    </Rack>
  );
}

/**
 * One device: a rack if it has chains, an ordinary shell otherwise.
 *
 * A device has no id on the wire — its address is its position in the run, the
 * same bargain clips make with `(track, scene)` — so the key pairs the index
 * with the name. Position alone would keep a shell mounted when a device is
 * swapped for another at the same slot.
 */
function DeviceShell({ device }: { device: BSV.ChainDevice }) {
  if (device.chains) return <RackShell device={device} />;
  return <Device name={device.name} on={device.on} folded={device.folded} />;
}

export function DeviceChain({
  name,
  devices,
  loading,
  failed,
  onRefresh,
  onClose,
}: DeviceChainProps) {
  return (
    <section className="device-chain" aria-label={`${name} devices`}>
      <div className="device-chain-head">
        <span className="device-chain-track">{name}</span>
        <span className="device-chain-count">
          {loading
            ? 'reading…'
            : failed
              ? 'unavailable'
              : `${devices.length} device${devices.length === 1 ? '' : 's'}`}
        </span>
        <div className="spacer" />
        <ControlButton
          icon
          aria-label="Re-read this track's devices"
          title="Devices are read on demand — re-read this track"
          disabled={loading}
          onClick={onRefresh}
        >
          <IconSync />
        </ControlButton>
        <ControlButton
          icon
          aria-label="Close the device chain"
          title="Close — clicking a track header reopens it"
          onClick={onClose}
        >
          ×
        </ControlButton>
      </div>

      {/* The strip stays mounted while a read is in flight rather than being
          replaced by a spinner: the chain that's there is almost always the
          chain that's still there, and swapping it for a message makes every
          re-read look like the devices went away. */}
      <div className="device-chain-run">
        <Chain
          placeholder={
            failed ? 'This track is no longer in the set' : 'No devices on this track'
          }
        >
          {devices.map((device, i) => (
            <DeviceShell key={`${i}:${device.name}`} device={device} />
          ))}
        </Chain>
      </div>
    </section>
  );
}
