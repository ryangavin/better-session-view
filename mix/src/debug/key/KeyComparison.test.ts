// @vitest-environment happy-dom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KeyComparison } from './KeyComparison.tsx';
import { openflow, type Library, type Track } from '../../openflow.ts';
import type { KeyExperimentRun, KeyExperimentData } from '../../keyExperiments.ts';
vi.mock('../../openflow.ts',async original=>({...await original<object>(),openflow:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function fixture(){
  const tracks=['one','two'].map(id=>({id,title:id,stems:null} as Track)),library={root:'/library',tracks} as Library;
  const result={id:'run',trackId:'one',title:'one',at:'2026-01-01',sourceHash:'hash',file:'audio/one',results:[]} as KeyExperimentRun;
  const api={status:vi.fn(async()=>({version:1,backends:[{id:'libkeyfinder',available:true,version:'v',message:'ready',license:'GPL'}]})),read:vi.fn(async(_id?:string):Promise<KeyExperimentData>=>({runs:[],reference:null})),run:vi.fn(async()=>result),busy:vi.fn(async()=>false),reference:vi.fn()};
  vi.mocked(openflow).mockReturnValue({keyExperiments:api,library:{read:async()=>library}} as unknown as NonNullable<ReturnType<typeof openflow>>);
  return {tracks,library,api,result};
}
it('opens without inference and explicitly compares a stemless original',async()=>{
  const f=fixture();render(createElement(KeyComparison,{track:f.tracks[0],library:f.library}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Analyze selected song'}) as HTMLButtonElement).disabled).toBe(false));
  expect(f.api.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Analyze selected song'}));
  await waitFor(()=>expect(f.api.run).toHaveBeenCalledWith({trackId:'one',backends:['libkeyfinder','essentia']}));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Finished'));
});
it('stops after the active track and never schedules the second track',async()=>{
  const f=fixture();let finish!:(value:KeyExperimentRun)=>void;
  f.api.run.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  render(createElement(KeyComparison,{track:f.tracks[0],library:f.library}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Analyze library'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Analyze library'}));
  await waitFor(()=>expect(f.api.run).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button',{name:'Stop after current'}));finish(f.result);
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Stopped'));expect(f.api.run).toHaveBeenCalledOnce();
});
it('fails closed with an actionable missing backend message',async()=>{
  const f=fixture();f.api.status.mockRejectedValue(new Error('Missing handler: rebuild and restart'));
  render(createElement(KeyComparison,{track:f.tracks[0],library:f.library}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('rebuild and restart'));
  expect((screen.getByRole('button',{name:'Analyze library'}) as HTMLButtonElement).disabled).toBe(true);expect(f.api.run).not.toHaveBeenCalled();
});

it('loads references without inference, excludes disputed coverage and exposes matrix selection',async()=>{
  const f=fixture(),select=vi.fn();
  f.api.read.mockImplementation(async(id?:string)=>({runs:[],reference:{sourceHash:'hash',labels:['C major'],provenance:'Published source',verification:id==='one'?'published':'disputed'}}));
  render(createElement(KeyComparison,{track:f.tracks[0],library:f.library,onSelect:select}));
  await waitFor(()=>expect(screen.getByRole('progressbar',{name:'Reference coverage'}).getAttribute('value')).toBe('1'));
  await waitFor(()=>expect(screen.getByRole('table',{name:'Song key comparison'}).textContent).toContain('Disputed'));
  expect(screen.getAllByText('○ Not run')).toHaveLength(4);
  expect(screen.getAllByText('Not evaluated')).toHaveLength(2);
  expect(screen.getAllByText('0/1 refs evaluated')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:/two Unknown artist/}));expect(select).toHaveBeenCalledWith('two');
  expect(f.api.run).not.toHaveBeenCalled();
});
