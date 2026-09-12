import type { SpectralEnergy } from '@openflow/widgets/theme/spectral.ts';
import type { KeptScans } from './openflow.ts';
import { SCAN_VALUES } from './play/scan.ts';

export const LIBRARY_ENVELOPE_HEIGHT = 22;
export interface LibraryColumn { path: string; energy: SpectralEnergy; height: number }

/** Representative whole-song envelope: 80% mean 5ms extrema + 20% regional peak.
 * A fixed 1.4 contrast curve keeps quiet regions legible, without per-track normalization.
 * This miniature is not a sample-accurate peak meter. The timeline retains true extrema.
 */
export function libraryOverview(held: KeptScans | null): LibraryColumn[] | null {
  const full = held?.sources.full;
  if (!full || full.bins < 1 || full.values.length !== full.bins * SCAN_VALUES) return null;
  const lines: LibraryColumn[] = [];
  for (let x = 0; x < 68; x++) {
    let min = 0, max = 0, lowSum = 0, highSum = 0, lowEnergy = 0, midEnergy = 0, highEnergy = 0;
    const from = Math.floor(x * full.bins / 68), to = Math.max(from + 1, Math.floor((x + 1) * full.bins / 68));
    for (let bin = from; bin < Math.min(to, full.bins); bin++) {
      const low = full.values[bin * SCAN_VALUES], high = full.values[bin * SCAN_VALUES + 1];
      if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
      const bands = full.values.subarray(bin * SCAN_VALUES + 2, bin * SCAN_VALUES + 5);
      if (bands.some(value => !Number.isFinite(value) || value < 0)) return null;
      min = Math.min(min, low); max = Math.max(max, high);
      lowSum += Math.max(0, -low); highSum += Math.max(0, high);
      lowEnergy += bands[0]; midEnergy += bands[1]; highEnergy += bands[2];
    }
    const count = Math.min(to, full.bins) - from;
    const height = (mean: number, peak: number) => Math.pow(Math.min(1, .8 * mean + .2 * peak), 1.4) * (LIBRARY_ENVELOPE_HEIGHT / 2 - 1);
    lines.push({ height: LIBRARY_ENVELOPE_HEIGHT, path: `M${x + .5},${(LIBRARY_ENVELOPE_HEIGHT / 2 - height(highSum / count, max)).toFixed(2)}V${(LIBRARY_ENVELOPE_HEIGHT / 2 + height(lowSum / count, -min)).toFixed(2)}`,
      energy: [lowEnergy / count, midEnergy / count, highEnergy / count] });
  }
  return lines;
}
