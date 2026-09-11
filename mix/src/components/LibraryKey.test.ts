// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LibraryKey } from './LibraryKey.tsx';
import { openflow, type Track } from '../openflow.ts';
import { KEY_LIBRARY_VERSION, KEY_DETECTION_VERSION, KEYFINDER_CONFIG, KEYFINDER_VERSION } from '../keyDetection.ts';
vi.mock('../openflow.ts',async original=>({...await original<object>(),openflow:vi.fn()}));
vi.mock('@openflow/widgets/chrome/Modal.tsx',()=>({Modal:({title,children,actions}:{title:string;children:unknown;actions:unknown})=>h('div',{role:'dialog','aria-label':title},children as never,actions as never)}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const song={id:'song',title:'Song',file:'audio/song.wav',key:null,stems:null,model:null,keyDetection:{version:KEY_DETECTION_VERSION,algorithm:'libkeyfinder',detectorVersion:KEYFINDER_VERSION,source:{file:'audio/song.wav',hash:'hash'},config:KEYFINDER_CONFIG,status:'key',label:'C♯ minor',confidence:'provisional',analyzedAt:''}} as Track;
function fixture(track=song){
  const edit=vi.fn(async()=>{}),refresh=vi.fn(async()=>{}),analyzeKey=vi.fn(async()=>({root:'/library',tracks:[track]}));
  vi.mocked(openflow).mockReturnValue({keyVersion:async()=>KEY_LIBRARY_VERSION,analyzeKey} as unknown as NonNullable<ReturnType<typeof openflow>>);
  render(h(LibraryKey,{song:track,edit,refresh}));return{edit,refresh,analyzeKey};
}
it('shows a plain single key without a question mark and saves a correction explicitly',async()=>{
  const f=fixture();expect(screen.getByRole('button',{name:'Edit key for Song'}).textContent).toBe('C♯ minor');
  fireEvent.click(screen.getByRole('button',{name:'Edit key for Song'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Save key'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByRole('combobox',{name:'Song key'}),{target:{value:'D minor'}});fireEvent.click(screen.getByRole('button',{name:'Save key'}));
  await waitFor(()=>expect(f.edit).toHaveBeenCalledWith('song',{key:'D minor'}));expect(f.analyzeKey).not.toHaveBeenCalled();
});
it('clears only the manual override with Use detected',async()=>{
  const f=fixture({...song,key:'Unknown'});fireEvent.click(screen.getByRole('button',{name:'Edit key for Song'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Use detected'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Use detected'}));await waitFor(()=>expect(f.edit).toHaveBeenCalledWith('song',{key:null}));
});
it('runs explicit stemless detection and refreshes the library',async()=>{
  const f=fixture();fireEvent.click(screen.getByRole('button',{name:'Edit key for Song'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Detect from original'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Detect from original'}));await waitFor(()=>expect(f.refresh).toHaveBeenCalledOnce());expect(f.analyzeKey).toHaveBeenCalledWith('song');
});
it('fails closed with an old native backend',async()=>{
  const f=fixture();vi.mocked(openflow).mockReturnValue({keyVersion:async()=>3} as unknown as NonNullable<ReturnType<typeof openflow>>);fireEvent.click(screen.getByRole('button',{name:'Edit key for Song'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Restart'));expect((screen.getByRole('button',{name:'Save key'}) as HTMLButtonElement).disabled).toBe(true);expect(f.edit).not.toHaveBeenCalled();
});
