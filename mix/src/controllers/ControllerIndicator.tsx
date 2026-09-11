import { useSyncExternalStore } from 'react';
import type { LaunchkeyController } from './launchkey.ts';
/** A local subscription: controller logging does not invalidate the Play tree. */
export function ControllerIndicator({controller,onOpen}:{controller:LaunchkeyController;onOpen():void}) {
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot);
  const label=state.connected?(state.receiving?'Launchkey · receiving':'Launchkey · linked, awaiting input'):state.pending?'Launchkey · connecting':state.autoConnect?'Launchkey · waiting':'Launchkey · off';
  return <button type="button" className="mf-controller-indicator" data-connected={state.connected||undefined} title={state.status} onClick={onOpen}>{label}</button>;
}
