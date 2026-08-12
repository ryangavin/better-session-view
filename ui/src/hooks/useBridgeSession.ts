import { createContext, useContext } from 'react';
import type { BridgeState } from './useBridge.js';

/**
 * The bridge as the app consumes it: everything `useBridge` returns, plus the
 * pieces of view state the connection itself depends on.
 *
 * Meters start a 30 Hz stream out of Live; sends add one observer per visible
 * track and return. Those flags decide which watches are installed — which
 * makes them part of what the connection is doing rather than only what App draws.
 * Keeping it up here also means the footer survives a hot update along with
 * everything else the socket holds.
 */
export interface BridgeSession extends BridgeState {
  showMeters: boolean;
  showSends: boolean;
  toggleMeters: () => void;
  toggleSends: () => void;
}

/**
 * Null until a provider is above it, so the mistake is a thrown error naming
 * the missing provider rather than a snapshot that stays null forever.
 */
export const BridgeContext = createContext<BridgeSession | null>(null);

export function useBridgeSession(): BridgeSession {
  const session = useContext(BridgeContext);
  if (!session) {
    throw new Error('useBridgeSession must be used inside <BridgeProvider>');
  }
  return session;
}
