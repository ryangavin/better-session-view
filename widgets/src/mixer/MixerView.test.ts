// @vitest-environment happy-dom
import { createElement } from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MixerView } from './MixerView.tsx';
import type { MixerViewProps, MixerFrame } from './model.ts';
import type { Param } from '../param/param.ts';
vi.mock('../wave/Waveform.tsx', () => ({ Waveform: () => null }));
let frames: FrameRequestCallback[];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const param: Param = { kind: 'float', min: 0, max: 100, defaultValue: 80, unit: 'percent' };
function fixture(): MixerViewProps {
  return {
    state: {
      decks: ['left-outside', 'left-inside', 'right-inside', 'right-outside'].map((id, i) => ({
        id, letter: 'ABCD'[i], track: { id: `track-${i}`, title: 'Host track', artist: 'Host artist', bpm: 128, key: '8A' },
        status: 'ready', peaks: [], sections: [{ id: 'section-verse', name: 'Verse' }, { id: 'section-drop', name: 'Drop' }],
        stems: ['drums', 'bass', 'other', 'vocals'].map(id => ({ id, name: id, available: true, level: 80, selected: 'section-verse', queued: undefined })),
        full: false, fullSection: 'section-verse', fullQueued: undefined, gain: 80, trim: 0, sendA: 0, sendB: 0, filter: 0, eq: [0, 0, 0], route: 1, cue: false,
      })),
      running: false, beat: 0, loop: { start: null, end: null, enabled: false }, canLoopOut: false,
      bpm: 128, launchBeats: 4, quantize: 0, loopBeats: 8, cross: 0, master: 80, masterTrim: 0, masterFilter: 0, masterSendA: 0, masterSendB: 0, masterEq: [0, 0, 0],
      effects: [{ id: 'delay-id', name: 'Delay' }], fxA: 'delay-id', fxB: 'delay-id',
    },
    commands: { setRunning: vi.fn(), stopAll: vi.fn(), setLaunchBeats: vi.fn(), loopIn: vi.fn(), loopOut: vi.fn(), setLoopEnabled: vi.fn(), setEffect: vi.fn(), setMaster: vi.fn(), setMasterEq: vi.fn(), setDeck: vi.fn(), setDeckEq: vi.fn(), setStemLevel: vi.fn(), launch: vi.fn() },
    readFrame: () => ({ decks: {}, masterLevel: 0 }),
    theme: { primary: '#c0c0c0', signal: '#00cc66', stems: {}, decks: {} },
    params: { level: param, trim: param, send: param, eq: param, filter: param, tempo: param, cross: param },
  };
}
describe('controlled mixer boundary', () => {
  it('gives a loading deck its lane to say so in, and nothing to drag', () => {
    const props = fixture();
    props.state = { ...props.state, decks: props.state.decks.map((d, i) => i === 0 ? { ...d, status: 'loading' as const, message: 'Finding the beat…' } : d) };
    const view = render(createElement(MixerView, props));
    expect(view.getAllByRole('status').map(node => node.textContent)).toContain('Finding the beat…');
    // Not in the launcher's status line as well, and not draggable while it reads.
    expect(view.queryByLabelText('Deck 1 waveform position')).toBeNull();
    expect(view.queryByLabelText('Deck 1 waveform controls')).toBeNull();
    expect(view.container.querySelector('.play-deck-status')?.textContent).toBe('');
  });

  it('draws a lane per played source and focuses the one pointed at', () => {
    const props = fixture(), setFocus = vi.fn();
    props.commands.setFocus = setFocus;
    const lanes = ['drums', 'bass', 'other', 'vocals'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), peaks: [] }));
    props.state = { ...props.state, decks: props.state.decks.map((d, i) => i === 0 ? { ...d, focus: 'drums', waveform: { start: 0, length: 96, visible: 32, lanes } } : d) };
    const view = render(createElement(MixerView, props));
    const drawn = ['Drums', 'Bass', 'Other', 'Vocals'].map(name => view.getByLabelText(`Deck 1 ${name} waveform`));
    expect(drawn).toHaveLength(4);
    expect(drawn.map(lane => lane.dataset.focused)).toEqual(['true', 'false', 'false', 'false']);
    fireEvent.pointerDown(drawn[1]);
    expect(setFocus).toHaveBeenCalledWith('left-outside', 'bass');
  });

  it('emits stable section/stem IDs without deciding whether a launch has happened', () => {
    const props = fixture();
    const view = render(createElement(MixerView, props));
    const drop = view.getByRole('button', { name: 'Deck 1: Drop drums' });
    fireEvent.click(drop);
    expect(props.commands.launch).toHaveBeenCalledWith('left-outside', 'section-drop', 'drums');
    expect(drop.getAttribute('aria-pressed')).toBe('false');
    const deck = props.state.decks[0];
    view.rerender(createElement(MixerView, { ...props, state: { ...props.state, decks: [{ ...deck, stems: deck.stems.map(s => ({ ...s, selected: 'section-drop' })) }, ...props.state.decks.slice(1)] } }));
    expect(view.getByRole('button', { name: 'Deck 1: Drop drums, selected' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('delegates source changes and stops without clearing selected state locally', () => {
    const props = fixture(); const view = render(createElement(MixerView, props));
    fireEvent.click(view.getByRole('button', { name: 'Deck 1 original full mix' }));
    expect(props.commands.setDeck).toHaveBeenCalledWith('left-outside', 'full', true);
    fireEvent.click(view.getByRole('button', { name: 'Deck 1: stop bass' }));
    expect(props.commands.launch).toHaveBeenCalledWith('left-outside', null, 'bass');
    expect(view.getByRole('button', { name: 'Deck 1: Verse bass, selected' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.body.style.getPropertyValue('--amber')).toBe('');
  });
  it('delegates per-deck loop capture and exit without master loop controls', () => {
    const props=fixture();
    props.commands.deckLoopIn=vi.fn(); props.commands.deckLoopOut=vi.fn(); props.commands.setDeckLoopEnabled=vi.fn();
    props.state.decks=props.state.decks.map(d=>({...d,playing:true,canLoopOut:true,loop:{start:0,end:8,enabled:true}}));
    const view=render(createElement(MixerView,props));
    fireEvent.click(view.getByRole('button',{name:'Deck 1 loop in'}));
    fireEvent.click(view.getByRole('button',{name:'Deck 1 loop out'}));
    fireEvent.click(view.getByRole('button',{name:'Deck 1 loop enabled'}));
    expect(props.commands.deckLoopIn).toHaveBeenCalledWith(props.state.decks[0].id);
    expect(props.commands.deckLoopOut).toHaveBeenCalledWith(props.state.decks[0].id);
    expect(props.commands.setDeckLoopEnabled).toHaveBeenCalledWith(props.state.decks[0].id,false);
    expect(view.queryByRole('group',{name:'Global loop'})).toBeNull();
  });
  it('keeps one bottom transport per deck and delegates playback and cue to the host', () => {
    const props = fixture();
    props.commands.setDeckPlaying = vi.fn(); props.commands.cueDeck = vi.fn(); props.commands.setDeckSync = vi.fn();
    const view = render(createElement(MixerView, props));
    expect(view.getAllByRole('group', { name: /^Deck \d transport$/ })).toHaveLength(4);
    const play = view.getByRole('button', { name: 'Deck 1 play/pause' });
    fireEvent.click(play);
    expect(props.commands.setDeckPlaying).toHaveBeenCalledWith('left-outside', true);
    expect(play.getAttribute('aria-pressed')).toBe('false');
    const sync = view.getByRole('button', { name: 'Deck 1 sync' });
    fireEvent.click(sync);
    expect(props.commands.setDeckSync).toHaveBeenCalledWith('left-outside', true);
    expect(sync.getAttribute('aria-pressed')).toBe('false');
    const cue = view.getByRole('button', { name: 'Deck 1 transport cue' });
    fireEvent.pointerDown(cue); fireEvent.pointerUp(cue);
    expect(props.commands.cueDeck).toHaveBeenNthCalledWith(1, 'left-outside', true);
    expect(props.commands.cueDeck).toHaveBeenNthCalledWith(2, 'left-outside', false);
    expect(props.commands.setDeck).not.toHaveBeenCalled();
    view.rerender(createElement(MixerView, { ...props, state: { ...props.state, decks: [{ ...props.state.decks[0], playing: true }, ...props.state.decks.slice(1)] } }));
    fireEvent.click(play);
    expect(props.commands.setDeckPlaying).toHaveBeenLastCalledWith('left-outside', false);
    expect(play.getAttribute('aria-pressed')).toBe('true');
  });
  it('disables deck transport when the host has no playback controller', () => {
    const view = render(createElement(MixerView, fixture()));
    expect((view.getByRole('button', { name: 'Deck 1 play/pause' }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole('button', { name: 'Deck 1 transport cue' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('uses host-defined effect controls and omits the embedded transport when supplied externally', () => {
    const props = fixture(); props.externalTransport = true;
    props.state.effects = [{ id: 'delay-id', name: 'Delay', controls: [{ id: 'feedback', name: 'Feedback', param }] }];
    props.commands.setEffectParam = vi.fn();
    const view = render(createElement(MixerView, props));
    expect(view.queryByRole('group', { name: 'Tempo and launch timing' })).toBeNull();
    expect(view.container.querySelector('.play-clock')).toBeNull();
    fireEvent.keyDown(view.getByRole('slider', { name: 'FX A Delay Feedback' }), { key: 'ArrowUp' });
    act(() => { const pending = frames; frames = []; pending.forEach(cb => cb(16)); });
    expect(props.commands.setEffectParam).toHaveBeenCalledWith('A', 'delay-id', 'feedback', expect.any(Number));
    expect(props.commands.setMaster).not.toHaveBeenCalled();
  });
  it('reads independent deck positions without advancing or issuing playback commands', () => {
    const props = fixture();
    let frame: MixerFrame = { decks: { 'left-outside': { beat: 32, level: 0 }, 'left-inside': { beat: 64, level: 0 } }, masterLevel: 0 };
    props.readFrame = () => frame;
    const view = render(createElement(MixerView, props));
    const heads = view.container.querySelectorAll<HTMLElement>('.play-playhead');
    expect(heads[0].style.left).toBe('25%'); expect(heads[1].style.left).toBe('50%');
    frame = { ...frame, decks: { ...frame.decks, 'left-outside': { beat: 96, level: 0 } } };
    act(() => { const pending = frames; frames = []; pending.forEach(cb => cb(16)); });
    expect(heads[0].style.left).toBe('75%');
    Object.values(props.commands).forEach(command => expect(command).not.toHaveBeenCalled());
    view.unmount(); expect(cancelAnimationFrame).toHaveBeenCalled();
  });
  it('shows unavailable tracks and host-authoritative pending stops', () => {
    const props = fixture(); const d = props.state.decks[0];
    props.state = { ...props.state, decks: [{ ...d, status: 'loading', track: null, message: 'Decoding stems', stems: d.stems.map(s => ({ ...s, queued: null })) }, ...props.state.decks.slice(1)] };
    const view = render(createElement(MixerView, props));
    expect(view.getAllByText('Empty deck').length).toBeGreaterThan(0);
    expect(view.getAllByText('Decoding stems').length).toBeGreaterThan(0);
    expect(view.getByRole('button', { name: 'Deck 1: stop all stems' }).textContent).toBe('◷ Stop');
    expect(view.container.querySelector('fieldset')?.disabled).toBe(true);
  });
  // A wall of knobs is the part of this app with the least room for words on
  // it, which is exactly why every one of them has to answer the hint strip.
  // Written as "none of them is missing one" rather than as a list, so a knob
  // added later fails this until somebody says what it does.
  it('gives every knob, fader and crossfader a hint to put in the strip', () => {
    const props = fixture();
    props.state.effects = [{ id: 'delay-id', name: 'Delay', controls: [{ id: 'feedback', name: 'Feedback', param }] }];
    const view = render(createElement(MixerView, props));
    const turnable = [...view.container.querySelectorAll('.wdg-knob, .wdg-slider, .wdg-segmented')];
    expect(turnable.length).toBeGreaterThan(20);
    const mute = turnable.filter((el) => !el.getAttribute('data-hint')?.trim());
    expect(mute.map((el) => el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? el.className)).toEqual([]);
    expect(view.getByRole('slider', { name: 'Crossfader' }).closest('.wdg-slider')?.getAttribute('data-hint'))
      .toContain('Thru');
    expect(view.getByRole('slider', { name: 'Deck 1 trim' }).closest('.wdg-knob')?.getAttribute('data-hint'))
      .toContain('12 dB');
  });
});

it('disables Full for empty and original-only decks but permits available stems', () => {
  const props=fixture();props.commands.setDeckPlaying=vi.fn();
  props.state={...props.state,decks:props.state.decks.map((deck,index)=>index===0 ? {...deck,status:'empty'} : index===1 ? {...deck,full:true,stems:deck.stems.map(s=>({...s,available:false}))} : deck)};
  const view=render(createElement(MixerView,props));
  expect((view.getByRole('button',{name:'Deck 1 original full mix'}) as HTMLButtonElement).disabled).toBe(true);
  const original=view.getByRole('button',{name:'Deck 2 original full mix'}) as HTMLButtonElement;
  expect(original.disabled).toBe(true);fireEvent.click(original);expect(props.commands.setDeck).not.toHaveBeenCalled();
  expect((view.getByRole('button',{name:'Deck 2 play/pause'}) as HTMLButtonElement).disabled).toBe(false);
  expect((view.getByRole('button',{name:'Deck 3 original full mix'}) as HTMLButtonElement).disabled).toBe(false);
});
it('places a cutoff knob beside each pair of effect knobs with host parameter values',()=>{
  const props=fixture();props.commands.setEffectHighPass=vi.fn();props.state.effectHighPass={A:0,B:1};
  props.state.effectHighPassParam={kind:'enum',min:0,max:2,defaultValue:0,items:['Off','200Hz','2kHz']};
  props.state.effects=[{id:'delay-id',name:'Delay',controls:[{id:'feedback',name:'Feedback',param},{id:'tone',name:'Tone',param}]}];
  const view=render(createElement(MixerView,props));
  const cutoff=view.getByRole('slider',{name:'FX A high pass cutoff'});
  expect(cutoff.getAttribute('aria-valuetext')).toBe('Off');
  expect(cutoff.closest('.play-fx-params')!.querySelectorAll('[role="slider"]')).toHaveLength(3);
  expect(view.queryByRole('button',{name:'FX A high pass'})).toBeNull();
  fireEvent.keyDown(cutoff,{key:'ArrowRight'});act(()=>frames.splice(0).forEach(frame=>frame(0)));expect(props.commands.setEffectHighPass).toHaveBeenCalledWith('A',1);
});
