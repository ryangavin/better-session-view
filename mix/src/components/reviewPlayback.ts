import { useEffect, useRef, useState } from 'react';
import { sampleOf, type Beats } from '../warp.ts';

/** Four-bar checks at original speed. All voices, including future clicks, stop together. */
export function useReviewPlayback() {
  const context = useRef<AudioContext | null>(null);
  const nodes = useRef<AudioScheduledSourceNode[]>([]);
  const generation = useRef(0);
  const frame = useRef(0);
  const [head, setHead] = useState<number | null>(null);
  const stop = () => {
    generation.current++;
    cancelAnimationFrame(frame.current);
    nodes.current.forEach((node) => { try { node.stop(); } catch { /* already ended */ } node.disconnect(); });
    nodes.current = [];
    setHead(null);
  };
  useEffect(() => () => { stop(); void context.current?.close(); context.current = null; }, []);
  const play = async (buffers: AudioBuffer[], grid: Beats, from: number, to: number, click: boolean) => {
    stop();
    const attempt = generation.current;
    const ctx = context.current ??= new AudioContext({ latencyHint: 'interactive' });
    await ctx.resume();
    if (attempt !== generation.current) return;
    const start = ctx.currentTime + 0.04;
    for (const buffer of buffers) {
      const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination);
      node.start(start, from, to - from); nodes.current.push(node);
    }
    if (click) for (let beat = grid.first; beat < grid.first + grid.samples.length; beat++) {
      const at = sampleOf(grid, beat) / grid.rate;
      if (at < from || at >= to) continue;
      const when = start + at - from;
      const node = ctx.createOscillator(), gain = ctx.createGain();
      const down = beat % 4 === 0;
      node.frequency.value = down ? 1600 : 1000;
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(down ? 0.3 : 0.15, when + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      node.connect(gain).connect(ctx.destination);
      node.onended = () => gain.disconnect();
      node.start(when); node.stop(when + 0.05); nodes.current.push(node);
    }
    const tick = () => {
      const at = from + ctx.currentTime - start;
      if (at >= to) { stop(); return; }
      setHead(Math.max(from, at - ctx.baseLatency - (ctx.outputLatency ?? 0)));
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  };
  return { head, play, stop };
}
