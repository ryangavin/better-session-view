// @vitest-environment happy-dom
import { createElement } from 'react';
import { cleanup,fireEvent,render } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { WaveControls } from './WaveControls.tsx';
import type { MixerDeck,MixerCommands,MixerFrame } from './model.ts';
afterEach(cleanup);
it('allows pointer scrubbing of playing audio, commits the relative delta, and exposes whole-waveform Fit',()=>{
 const moveDeck=vi.fn(),setZoom=vi.fn();
 const deck:MixerDeck={letter:'A',track:null,peaks:[],sections:[],fullSection:null,fullQueued:undefined,gain:100,trim:0,sendA:0,sendB:0,filter:0,eq:[0,0,0],route:1,cue:false,id:'a',status:'ready',focus:'drums',full:false,stems:[{id:'drums',name:'Drums',available:true,playing:true,level:100,selected:null,queued:undefined}],waveform:{start:0,length:96,visible:64},zoom:32};
 const readFrame=():MixerFrame=>({masterLevel:0,decks:{a:{level:0,seconds:2,duration:32,beat:4,sources:{drums:{seconds:2,beat:4,playing:true,enabled:true}}}}});
 const view=render(createElement(WaveControls,{deck,index:0,commands:{moveDeck,setZoom} as unknown as MixerCommands,readFrame,children:null}));
 const lane=view.getByRole('slider');lane.setPointerCapture=vi.fn();vi.spyOn(lane,'getBoundingClientRect').mockReturnValue({width:200} as DOMRect);
 fireEvent.pointerDown(lane,{button:0,pointerId:1,clientX:100});fireEvent.pointerMove(lane,{pointerId:1,clientX:50});fireEvent.pointerUp(lane,{pointerId:1});
 expect(moveDeck.mock.calls).toEqual([['a','begin'],['a','move',16],['a','commit']]);
 fireEvent.click(view.getByRole('button',{name:'Deck 1 show whole waveform'}));expect(setZoom).toHaveBeenCalledWith('a',0);
});
