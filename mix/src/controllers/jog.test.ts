import { afterEach, expect, it, vi } from 'vitest';
import { ModWheelJog } from './jog.ts';
import { initialMixer } from '../play/decks.ts';
import type { MixerCommands } from '@openflow/widgets/mixer/model.ts';
afterEach(()=>vi.useRealTimers());
it('initializes without jumping, accumulates direction deltas through coalescing, then commits',()=>{
  vi.useFakeTimers();const deck={...initialMixer().decks[0],status:'ready' as const},moveDeck=vi.fn();
  const jog=new ModWheelJog(()=>deck,{moveDeck} as unknown as MixerCommands);
  jog.receive(64);expect(moveDeck).not.toHaveBeenCalled();
  jog.receive(65);expect(moveDeck).toHaveBeenLastCalledWith('deck-a','move',4/127);
  for(let i=66;i<=127;i++)jog.receive(i);
  vi.advanceTimersByTime(20);expect(moveDeck.mock.calls.at(-1)![2]).toBeCloseTo(63*4/127);
  jog.receive(100);vi.advanceTimersByTime(20);expect(moveDeck.mock.calls.at(-1)![2]).toBeCloseTo(36*4/127);
  expect(moveDeck.mock.calls.filter(([,phase])=>phase==='begin')).toHaveLength(1);
  vi.advanceTimersByTime(120);expect(moveDeck).toHaveBeenLastCalledWith('deck-a','commit');jog.reset();
});
it('drops stale movement on replacement and never loads or plays an empty target',()=>{
  vi.useFakeTimers();let deck=initialMixer().decks[0];const moveDeck=vi.fn();
  const jog=new ModWheelJog(()=>deck,{moveDeck} as unknown as MixerCommands);
  jog.receive(0);jog.receive(127);expect(moveDeck).not.toHaveBeenCalled();
  deck={...deck,status:'ready',track:{id:'first',title:'First',artist:'Artist',bpm:120,key:'—'}};
  jog.receive(10);expect(moveDeck).not.toHaveBeenCalled();jog.receive(20);jog.receive(100);
  deck={...deck,track:{...deck.track!,id:'second'}};jog.changed();vi.advanceTimersByTime(150);
  const count=moveDeck.mock.calls.length;jog.receive(0);expect(moveDeck).toHaveBeenCalledTimes(count);
  jog.reset();
});
