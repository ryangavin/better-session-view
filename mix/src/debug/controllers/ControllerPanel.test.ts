// @vitest-environment happy-dom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ControllerContext } from '../../controllers/context.ts';
import { LaunchkeyController } from '../../controllers/launchkey.ts';
import type { MixerEngine } from '../../play/engine.ts';
import { ControllerPanel } from './ControllerPanel.tsx';
afterEach(cleanup);
it('prints all action labels, logs discovery, and selects a unique pair without opening it',async()=>{
  const input={id:'in',name:'Launchkey MK4 61 DAW Out',state:'connected',open:vi.fn()},output={id:'out',name:'Launchkey MK4 61 DAW In',state:'connected',open:vi.fn()};
  const request=vi.fn(async()=>({inputs:new Map([['in',input]]),outputs:new Map([['out',output]]),sysexEnabled:false} as unknown as MIDIAccess));
  const controller=new LaunchkeyController({} as MixerEngine,request,{getItem:()=>JSON.stringify({enabled:false,sysex:false,input:{id:'in',name:input.name},output:{id:'out',name:output.name}}),setItem:()=>{}});
  render(createElement(ControllerContext.Provider,{value:controller},createElement(ControllerPanel)));
  for(const label of ['Find MIDI ports','Connect Launchkey','Disconnect','Deck A','Deck B','Deck C','Deck D','Master','Clear messages'])expect(screen.getByRole('button',{name:label}).textContent).toBe(label);
  fireEvent.click(screen.getByRole('button',{name:'Find MIDI ports'}));
  await waitFor(()=>expect((screen.getByRole('combobox',{name:'Controller MIDI input'}) as HTMLSelectElement).value).toBe('in'));
  expect((screen.getByRole('combobox',{name:'Controller MIDI output'}) as HTMLSelectElement).value).toBe('out');
  expect(screen.getByLabelText('Controller MIDI messages').textContent).toContain('Detected 1 inputs: Launchkey MK4 61 DAW Out');
  expect(input.open).not.toHaveBeenCalled();expect(output.open).not.toHaveBeenCalled();controller.dispose();
});
