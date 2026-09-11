import { useEffect, useSyncExternalStore } from 'react';
import { useTheme } from '@openflow/widgets/theme/ThemeRoot.tsx';
import type { LaunchkeyController } from './launchkey.ts';
/** A local subscription: controller logging does not invalidate the Play tree. */
export function ControllerIndicator({controller,onOpen}:{controller:LaunchkeyController;onOpen():void}) {
  const {deckPairs}=useTheme();
  useEffect(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');if(!context)return;
    controller.setDeckColors(deckPairs.map(({ink})=>{context.fillStyle=ink;context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data).slice(0,3);}));
  },[controller,deckPairs]);
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot);
  const label=state.connected?(state.receiving?'Launchkey · receiving':'Launchkey · linked, awaiting input'):state.pending?'Launchkey · connecting':state.autoConnect?'Launchkey · waiting':'Launchkey · off';
  return <button type="button" className="mf-controller-indicator" data-connected={state.connected||undefined} title={state.status} onClick={onOpen}>{label}</button>;
}
