import { Chain } from '../../../widgets/src/chrome/Chain.js';
import { Device } from '../../../widgets/src/chrome/Device.js';
import { Rack } from '../../../widgets/src/chrome/Rack.js';
import { ControlButton } from './Control.js';
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
 * its chain list. There are no knobs on any of them yet — parameters are the
 * next tier of the same subscription and land as a field on what it publishes.
 *
 * **Read-only, and visibly so.** Nothing in this footer writes to Live, because
 * there is no write path for a device yet. The activator draws `Device.is_active`
 * and the fold triangle is absent rather than dead, which is `Device`'s own way
 * of saying a shell can't be folded from here.
 *
 * **There is no refresh button any more.** It existed because the chain was read
 * on demand, so a device added in Live was invisible until something asked
 * again — and the button was that ask. The run is watched now, including its own
 * membership, so there is nothing for it to do; a button whose tooltip said
 * devices are read on demand would be describing the version before this one.
 */
export interface DeviceChainProps {
  /** The track being shown. Its name, for the strip's own label. */
  name: string;
  devices: BSV.ChainDevice[];
  loading: boolean;
  failed: boolean;
  /** A nested run's devices, or undefined while its subscription is in flight. */
  runAt(path: readonly number[]): BSV.ChainDevice[] | null | undefined;
  chainAt(path: readonly number[], index: number): number;
  onChain(path: readonly number[], index: number, chain: number): void;
  onClose(): void;
}

/** What every shell needs to address itself and reach the run below it. */
interface ShellContext {
  /** The run this device sits in. */
  path: readonly number[];
  runAt: DeviceChainProps['runAt'];
  chainAt: DeviceChainProps['chainAt'];
  onChain: DeviceChainProps['onChain'];
}

/**
 * A rack, and the chain it currently has selected.
 *
 * **Which chain is showing used to be this component's own state**, on the
 * reasoning that it was a view choice inside one rack and nothing over the wire
 * depended on it. The second half stopped being true: the chain a rack is
 * showing is exactly what decides whether its devices are watched, so the
 * choice now lives in the hook, which is the thing that declares it.
 *
 * A chain's devices arrive as a subscription of their own rather than nested in
 * this device's payload, so `runAt` may answer `undefined` for a beat after the
 * rack opens. That reads as "opening" rather than "empty", because a rack that
 * is genuinely bare answers `[]`.
 */
function RackShell({
  device,
  index,
  context,
}: {
  device: BSV.ChainDevice;
  index: number;
  context: ShellContext;
}) {
  const chains = device.chains ?? [];
  const at = Math.min(context.chainAt(context.path, index), Math.max(0, chains.length - 1));
  const inner = [...context.path, index, at];
  const devices = context.runAt(inner);

  return (
    <Rack
      name={device.name}
      on={device.on}
      folded={device.folded}
      chains={chains.map((c) => c.name)}
      chainAt={at}
      onChain={(chain) => context.onChain(context.path, index, chain)}
    >
      <Chain
        placeholder={devices === undefined ? 'Opening…' : 'No devices in this chain'}
      >
        {(devices ?? []).map((nested, i) => (
          <DeviceShell
            key={`${i}:${nested.name}`}
            device={nested}
            index={i}
            context={{ ...context, path: inner }}
          />
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
function DeviceShell({
  device,
  index,
  context,
}: {
  device: BSV.ChainDevice;
  index: number;
  context: ShellContext;
}) {
  if (device.chains) return <RackShell device={device} index={index} context={context} />;
  return <Device name={device.name} on={device.on} folded={device.folded} />;
}

export function DeviceChain({
  name,
  devices,
  loading,
  failed,
  runAt,
  chainAt,
  onChain,
  onClose,
}: DeviceChainProps) {
  return (
    <section className="device-chain" aria-label={`${name} devices`}>
      <div className="device-chain-head">
        <span className="device-chain-track">{name}</span>
        <span className="device-chain-count">
          {loading
            ? 'opening…'
            : failed
              ? 'unavailable'
              : `${devices.length} device${devices.length === 1 ? '' : 's'}`}
        </span>
        <div className="spacer" />
        <ControlButton
          icon
          aria-label="Close the device chain"
          title="Close — clicking a track header reopens it"
          onClick={onClose}
        >
          ×
        </ControlButton>
      </div>

      {/* The strip stays mounted through a change rather than being replaced by
          a spinner: the chain that's there is almost always the chain that's
          still there, and swapping it for a message makes every update look
          like the devices went away. */}
      <div className="device-chain-run">
        <Chain
          placeholder={
            failed ? 'This track is no longer in the set' : 'No devices on this track'
          }
        >
          {devices.map((device, i) => (
            <DeviceShell
              key={`${i}:${device.name}`}
              device={device}
              index={i}
              context={{ path: [], runAt, chainAt, onChain }}
            />
          ))}
        </Chain>
      </div>
    </section>
  );
}
