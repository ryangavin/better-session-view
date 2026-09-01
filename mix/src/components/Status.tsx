import { Button } from '@openflow/widgets/controls/Button.tsx';
import type { Ready } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './Status.css';

/**
 * The bar that says whether the machine can do the thing.
 *
 * It carries the demucs probe, which is the one honest fact this app has —
 * everything above it is invented until the job runner lands. A window that
 * mocks its own toolchain check would be a window you cannot trust about
 * anything.
 */
export function Status({ mix, ready }: { mix: Mix; ready: Ready | null }) {
  const state = ready === null ? 'asking' : ready.ok ? 'ok' : 'missing';
  const says =
    ready === null
      ? 'looking for demucs…'
      : ready.ok
        ? `${ready.says} · ${mix.total} indexed, ${mix.withStems} separated`
        : ready.says;

  return (
    <footer className="mf-status">
      <span className="mf-status-dot" data-state={state} />
      <span>{says}</span>
      <div className="mf-status-gap" />
      {mix.touched > 0 && (
        <>
          <span className="mf-status-quiet">
            {mix.touched} stem{mix.touched === 1 ? '' : 's'} off rest
          </span>
          <Button onPress={mix.resetMix} tone="quiet" title="Every stem back to unity and unmuted">
            reset mix
          </Button>
        </>
      )}
      <span className="mf-status-engine">{ready?.workspace ?? ''}</span>
    </footer>
  );
}
