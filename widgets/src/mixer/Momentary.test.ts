// @vitest-environment happy-dom
import {createElement} from 'react';
import {render,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {Momentary} from './Momentary.tsx';
afterEach(cleanup);
it('ends a hold on pointer cancellation, capture loss and window blur exactly once',()=>{
 const onHold=vi.fn(),v=render(createElement(Momentary,{label:'Cue',held:false,onHold,children:'Cue'})),b=v.getByRole('button');
 for(const cancel of [()=>fireEvent.pointerCancel(b),()=>fireEvent.lostPointerCapture(b),()=>fireEvent(window,new Event('blur'))]){
  fireEvent.pointerDown(b);cancel();fireEvent.pointerUp(b);
 }
 expect(onHold.mock.calls.map(c=>c[0])).toEqual([true,false,true,false,true,false]);
});
it('supports keyboard hold, Enter takeover and release, including an Enter-only tap',()=>{
 const onHold=vi.fn(),onTakeover=vi.fn(),v=render(createElement(Momentary,{label:'Cue',held:false,onHold,onTakeover,children:'Cue'})),b=v.getByRole('button');
 fireEvent.keyDown(b,{key:' '});fireEvent.keyDown(b,{key:' ',repeat:true});fireEvent.keyDown(b,{key:'Enter'});fireEvent.keyUp(b,{key:'Enter'});
 expect(onHold.mock.calls).toEqual([[true]]);expect(onTakeover).toHaveBeenCalledOnce();fireEvent.keyUp(b,{key:' '});
 fireEvent.keyDown(b,{key:'Enter'});fireEvent.keyUp(b,{key:'Enter'});expect(onHold.mock.calls).toEqual([[true],[false],[true],[false]]);
});
