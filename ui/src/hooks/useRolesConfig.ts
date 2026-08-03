import { useCallback, useEffect, useState } from 'react';
import type { BridgeClient } from '../lib/client.js';
import type { Guard } from './useBridge.js';
import type { Say } from './useLog.js';

/**
 * The configured role vocabulary — the bridge's roles.json — and the write
 * back to it. See the /roles.json note in bridge.ts for why it isn't in
 * localStorage. Distinct from useVocabulary, which merges this with the roles
 * actually tagged in the set.
 */
export function useRolesConfig(client: BridgeClient, guard: Guard, say: Say) {
  const [roles, setRoles] = useState<BSV.Role[]>([]);

  /** Read the role vocabulary the bridge is currently serving. */
  const loadRoles = useCallback(() => {
    fetch('/roles.json')
      .then((r) => r.json())
      .then((r: { roles?: BSV.Role[] }) =>
        setRoles(Array.isArray(r.roles) ? r.roles : []),
      )
      .catch(() => setRoles([]));
  }, []);

  // An empty list is the correct answer for a new set, so a failure here is not
  // worth a log line; roles found in the set still surface through
  // mergeVocabulary. Fetched on mount, and refetched on `setInfo`: the
  // vocabulary belongs to the open Live Set, and the bridge often learns which
  // set that is *after* this first ran — as well as when the set is saved
  // somewhere new. useBridge's subscription is what calls `loadRoles` then.
  useEffect(loadRoles, [loadRoles]);

  const saveRoles = useCallback(
    (next: BSV.Role[]) =>
      guard('roles', async () => {
        const e = await client.request({ type: 'saveRoles', roles: next });
        setRoles(next);
        say(`roles — ${e.count} saved`, 'ok');
      }),
    [client, guard, say],
  );

  return { roles, loadRoles, saveRoles };
}
