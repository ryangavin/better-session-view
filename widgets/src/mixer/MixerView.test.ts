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
      bpm: 128, quantized: true, cross: 0, master: 80, masterTrim: 0, masterFilter: 0, masterSendA: 0, masterSendB: 0, masterEq: [0, 0, 0],
      effects: [{ id: 'delay-id', name: 'Delay' }], fxA: 'delay-id', fxB: 'delay-id',
    },
    commands: { setRunning: vi.fn(), stopAll: vi.fn(), setQuantized: vi.fn(), loopIn: vi.fn(), loopOut: vi.fn(), setLoopEnabled: vi.fn(), setEffect: vi.fn(), setMaster: vi.fn(), setMasterEq: vi.fn(), setDeck: vi.fn(), setDeckEq: vi.fn(), setStemLevel: vi.fn(), launch: vi.fn() },
    readFrame: () => ({ decks: {}, masterLevel: 0 }),
    theme: { primary: '#c0c0c0', signal: '#00cc66', stems: {}, decks: {} },
    params: { level: param, trim: param, send: param, eq: param, filter: param, tempo: param, cross: param },
  };
}
describe('controlled mixer boundary', () => {
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
});
