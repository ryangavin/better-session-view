import { renderAlignment } from './render.ts';
import type { Alignment } from './model.ts';

self.onmessage = (event: MessageEvent<{ channels: Float32Array[]; map: Alignment; origin: number }>) => {
  try {
    const { channels, map, origin } = event.data;
    const rendered = renderAlignment(channels, map, origin);
    self.postMessage({ channels: rendered }, { transfer: rendered.map((c) => c.buffer) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
