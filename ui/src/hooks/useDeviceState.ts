import { useCallback, useRef, useState } from 'react';
import type { BridgeClient } from '../lib/client.js';
import {
  clearLegacyAllowedColors,
  loadLegacyAllowedColors,
} from '../lib/allowedColors.js';
import { errText } from '../lib/snapshotTiming.js';
import type { Guard } from './useBridge.js';
import type { Say } from './useLog.js';

/**
 * Set-owned UI configuration restored from the Session Bridge device itself.
 * The bridge persists one versioned blob in a Stored Only Max parameter; these
 * granular methods prevent a rapid color click from overwriting a simultaneous
 * default/role edit with a stale copy of the other field.
 */
export function useDeviceState(client: BridgeClient, guard: Guard, say: Say) {
  const [defaultArtist, setDefaultArtist] = useState('');
  const [roles, setRoles] = useState<BSV.Role[]>([]);
  const [allowedColors, setAllowedColorsState] = useState<number[] | null>(null);
  const migratingAllowed = useRef(false);

  const adoptDeviceState = useCallback(
    (state: BSV.DeviceState) => {
      // Older bridge builds can still be running while Vite serves this UI.
      setDefaultArtist(state.defaultArtist ?? '');
      setRoles(state.roles);
      if (state.allowedColors !== undefined) {
        setAllowedColorsState(state.allowedColors);
        return;
      }
      const legacy = loadLegacyAllowedColors();
      // The old implementation represented "all colors" by removing its key,
      // so absence cannot distinguish an explicit choice from a different
      // browser origin. Show all, but leave the device field open for another
      // old origin to migrate or for the user's next deliberate choice.
      if (legacy === undefined) {
        setAllowedColorsState(null);
        return;
      }
      if (migratingAllowed.current) return;
      migratingAllowed.current = true;
      setAllowedColorsState(legacy);
      void client.request({ type: 'saveAllowedColors', colors: legacy })
        .then(() => clearLegacyAllowedColors())
        .catch((e) => say(`allowed colors migration: ${errText(e)}`, 'error'))
        .finally(() => {
          migratingAllowed.current = false;
        });
    },
    [client, say],
  );

  const saveSetConfig = useCallback(
    (nextArtist: string, nextRoles: BSV.Role[]) =>
      guard('set configuration', async () => {
        const e = await client.request({
          type: 'saveSetConfig',
          defaultArtist: nextArtist,
          roles: nextRoles,
        });
        setDefaultArtist(e.defaultArtist);
        setRoles(nextRoles);
        say(
          `set configuration — ${e.roleCount} role(s), ` +
            `${e.defaultArtist === '' ? 'no default artist' : `default artist ${e.defaultArtist}`}`,
          'ok',
        );
      }),
    [client, guard, say],
  );

  const setAllowedColors = useCallback(
    (next: number[] | null) => {
      // Immediate locally; the parameter round-trip must not make a row of
      // swatches feel like remote controls.
      setAllowedColorsState(next);
      void client.request({ type: 'saveAllowedColors', colors: next })
        .then(() => clearLegacyAllowedColors())
        .catch((e) => say(`allowed colors: ${errText(e)}`, 'error'));
    },
    [client, say],
  );

  return {
    defaultArtist,
    roles,
    allowedColors,
    adoptDeviceState,
    saveSetConfig,
    setAllowedColors,
  };
}
