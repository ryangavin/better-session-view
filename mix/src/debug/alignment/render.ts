import { resample } from '../../resample.ts';
import type { Alignment } from './model.ts';

/** All channels/stems receive the very same integer boundaries and kernel, with zero added delay. */
export function renderAlignment(channels: readonly Float32Array[], map: Alignment, sourceOrigin = 0): Float32Array[] {
  if (!channels.length || channels.some((c) => c.length !== channels[0].length) ||
      map.pins[0].source < sourceOrigin || map.pins.at(-1)!.source > sourceOrigin + channels[0].length)
    throw new Error('All stem channels must cover the same source timeline.');
  if (map.request.policy.kind === 'original')
    return channels.map((c) => c.slice(map.pins[0].source - sourceOrigin, map.pins.at(-1)!.source - sourceOrigin));
  const out = channels.map(() => new Float32Array(map.length));
  for (let i = 0; i + 1 < map.pins.length; i++) {
    const a = map.pins[i], b = map.pins[i + 1];
    channels.forEach((c, j) => out[j].set(resample(c, map.speeds[i], a.source - sourceOrigin, b.output - a.output), a.output));
  }
  return out;
}
