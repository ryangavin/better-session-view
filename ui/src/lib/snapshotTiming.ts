// The snapshot phase breakdown printed to the browser console, and the
// error-text helper the log lines share. Pure functions — no React.

import type { WireTiming } from './client.js';

/** Scenes in the full-size set we're actually building for. */
export const TARGET_SCENES = 848;

/**
 * Writes the phase breakdown to the browser console. Every phase of the walk is
 * a linear scan, so a projection to full-set size is a fair extrapolation — and
 * it's the number that decides whether snapshotting needs a progress bar.
 */
export function reportSnapshotTiming(
  e: BSV.EventOf<'snapshot'>,
  wire: WireTiming | null,
  commitMs: number,
): void {
  const { data, dictMs, hostMs } = e;
  const t = data.timings;
  const total = wire ? wire.totalMs + commitMs : data.ms;
  const scale = data.sceneCount > 0 ? TARGET_SCENES / data.sceneCount : 1;

  const row = (ms: number, note: string) => ({
    ms: Math.round(ms * 10) / 10,
    'share': total > 0 ? `${Math.round((ms / total) * 100)}%` : '—',
    note,
  });

  console.groupCollapsed(
    `%c⏱ snapshot%c ${data.clipCount} clips · ${data.sceneCount} scenes · ` +
      `${Math.round(total)}ms end-to-end`,
    'color:#f0b23c;font-weight:600',
    'color:inherit',
  );
  console.table({
    'lom: tracks': row(t.tracks, `${data.trackCount} tracks`),
    'lom: scenes': row(t.scenes, `${data.sceneCount} scenes`),
    'lom: slot scan': row(t.slots, `${t.slotsScanned} slots probed`),
    'lom: clip reads': row(t.clips, `${data.clipCount} clips`),
    'v8 → dict': row(dictMs, 'JSON.stringify + Dict.parse'),
    'node getDict': row(hostMs, 'Max dict → JS object'),
    'wire + parse': row(
      wire ? Math.max(0, wire.totalMs - data.ms - dictMs - hostMs) : 0,
      wire ? `${(wire.bytes / 1024).toFixed(0)} kB payload` : 'unmeasured',
    ),
    'react commit': row(commitMs, `${data.sceneCount} rows`),
  });
  console.debug(
    `projection to ${TARGET_SCENES} scenes (×${scale.toFixed(1)}, linear): ` +
      `~${((total * scale) / 1000).toFixed(1)}s end-to-end`,
  );
  console.groupEnd();
}

/**
 * A non-empty description of a thrown value. `||` rather than `??`: an Error with
 * an empty message logs as "color: " and says nothing at all.
 */
export function errText(e: unknown): string {
  const m = (e as Error)?.message;
  if (typeof m === 'string' && m !== '') return m;
  const s = String(e);
  return s && s !== 'undefined' && s !== 'null' && s !== '[object Object]'
    ? s
    : 'failed with no message — check the Max window';
}
