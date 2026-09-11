// @vitest-environment happy-dom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KeyLab } from './KeyLab.tsx';
import { openflow, type Library, type Track } from '../../openflow.ts';
import { estimateKey, KEY_VERSION } from '../../key.ts';
import type { PitchMap } from '../../pitchMap.ts';
import type { Mix } from '../../state.ts';
vi.mock('./KeyComparison.tsx', () => ({KeyComparison:() => null}));
vi.mock('../../openflow.ts', async original => ({...await original<object>(),openflow:vi.fn()}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const song = (id:string) => ({id,title:id,key:null,stems:`stems/${id}`,model:'model',sources:['bass']} as Track);
function saved(t:Track) {
  const map = {seconds:12,start:0,step:1,hz:Array(12).fill(55),state:Array(12).fill('voiced')} as PitchMap;
  return {...t,keyAnalysis:estimateKey(map,{hash:'bass',mapHash:'map',stems:t.stems!,model:t.model!})};
}
function fixture(tracks:Track[]) {
  let library = {root:'/library',tracks} as Library;
  const analyze = vi.fn(async (id:string) => { library = {...library,tracks:library.tracks.map(t => t.id === id ? saved(t) : t)}; return library; });
  const busy = vi.fn(async () => null);
  const keyVersion = vi.fn(async () => KEY_VERSION);
  const read = vi.fn(async () => library);
  vi.mocked(openflow).mockReturnValue({library:{read},keyVersion,analyzeKey:analyze,separate:{busy},transcribe:{busy}} as unknown as NonNullable<ReturnType<typeof openflow>>);
  const refreshLibrary = vi.fn(async () => {});
  const mix = {library,song:tracks[0],refreshLibrary} as unknown as Mix;
  return {mix,analyze,busy,refreshLibrary,keyVersion};
}
it('opens stored diagnostics without inference and previews only missing keys by default', () => {
  const f = fixture([saved(song('done')),{...song('stemless'),stems:null},song('pending')]);
  render(createElement(KeyLab,{mix:f.mix}));
  expect(screen.getByText(/1 to analyze · 2 with bass stems · 1 already analyzed/)).toBeTruthy();
  expect(screen.getByText(/Stored primary: Unknown/)).toBeTruthy();
  expect(f.analyze).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByText(/2 to analyze · 2 with bass stems · 0 already analyzed/)).toBeTruthy();
  expect(f.analyze).not.toHaveBeenCalled();
});
it('runs missing tracks sequentially, updates the library, and preserves manual metadata', async () => {
  const f = fixture([saved(song('done')),{...song('pending'),key:'F minor'}]);
  render(createElement(KeyLab,{mix:f.mix}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Analyze missing keys'}));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Finished.'));
  expect(f.analyze.mock.calls).toEqual([['pending']]);
  expect(f.refreshLibrary).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText('Key detection track'),{target:{value:'pending'}});
  expect(screen.getByText(/Manual key: F minor/)).toBeTruthy();
});
it('stops after the current track finishes and leaves the remaining track pending', async () => {
  const f = fixture([song('one'),song('two')]);
  let finish!: (held:Library) => void;
  f.analyze.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  render(createElement(KeyLab,{mix:f.mix}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Analyze missing keys'}));
  await waitFor(() => expect(f.analyze).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button',{name:'Stop after current track'}));
  finish({...f.mix.library,tracks:[saved(song('one')),song('two')]});
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Stopped.'));
  expect(f.analyze).toHaveBeenCalledOnce();
});
it('stops on unmount without canceling the active job or starting the next one', async () => {
  const f = fixture([song('one'),song('two')]);
  let finish!: (held:Library) => void;
  f.analyze.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const view = render(createElement(KeyLab,{mix:f.mix}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Analyze missing keys'}));
  await waitFor(() => expect(f.analyze).toHaveBeenCalledOnce());
  view.unmount(); finish({...f.mix.library,tracks:[saved(song('one')),song('two')]});
  await waitFor(() => expect(f.refreshLibrary).toHaveBeenCalledOnce());
  expect(f.analyze).toHaveBeenCalledOnce();
});
it('shows an occupied-engine error and allows retry', async () => {
  const f = fixture([song('one')]);
  f.busy.mockResolvedValueOnce('other' as never);
  render(createElement(KeyLab,{mix:f.mix}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Analyze missing keys'}));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('engine is busy'));
  expect(f.analyze).not.toHaveBeenCalled();
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Analyze missing keys'}));
  await waitFor(() => expect(f.analyze).toHaveBeenCalledOnce());
});
it('reports a failed song and continues to the next without hiding failures', async () => {
  const f = fixture([song('bad'),song('good')]); f.analyze.mockRejectedValueOnce(new Error('broken source'));
  render(createElement(KeyLab,{mix:f.mix}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Analyze missing keys'}));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1 completed · 1 failed'));
  expect(screen.getByText(/bad: failed/)).toBeTruthy();
});

it.each(['missing','older'])('fails closed for a %s backend version without losing read-only evidence', async mode => {
  const f = fixture([saved(song('done')),song('pending')]);
  if (mode === 'missing') f.keyVersion.mockRejectedValue(new Error('No handler registered'));
  else f.keyVersion.mockResolvedValue(KEY_VERSION - 1);
  render(createElement(KeyLab,{mix:f.mix}));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Analysis unavailable'));
  expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Analyze selected track'}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Stored primary: Unknown/)).toBeTruthy();
  expect(f.analyze).not.toHaveBeenCalled();
  f.keyVersion.mockResolvedValue(KEY_VERSION);
  fireEvent.click(screen.getByRole('button',{name:'Refresh saved evidence'}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
});
it('rechecks backend compatibility immediately before starting each worker', async () => {
  const f = fixture([song('one')]);
  render(createElement(KeyLab,{mix:f.mix}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Analyze missing keys'}) as HTMLButtonElement).disabled).toBe(false));
  f.keyVersion.mockResolvedValue(KEY_VERSION - 1);
  fireEvent.click(screen.getByRole('button',{name:'Analyze missing keys'}));
  await waitFor(() => expect(screen.getByText(/one: failed/)).toBeTruthy());
  expect(f.analyze).not.toHaveBeenCalled();
});
