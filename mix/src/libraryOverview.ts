import type { SpectralEnergy } from '@openflow/widgets/theme/spectral.ts';
import type { KeptScans } from './openflow.ts';
import { SCAN_VALUES } from './play/scan.ts';

export interface LibraryColumn { path: string; energy: SpectralEnergy }

/** Fold the saved original-audio scan into 68 whole-song min/max columns. No decoding. */
export function libraryOverview(held: KeptScans | null): LibraryColumn[] | null {
  const full = held?.sources.full;
  if (!full || full.bins < 1 || full.values.length !== full.bins * SCAN_VALUES) return null;
  const lines: LibraryColumn[] = [];
  for (let x = 0; x < 68; x++) {
    let min = 0, max = 0, lowEnergy = 0, midEnergy = 0, highEnergy = 0;
    const from = Math.floor(x * full.bins / 68), to = Math.max(from + 1, Math.floor((x + 1) * full.bins / 68));
    for (let bin = from; bin < Math.min(to, full.bins); bin++) {
      const low = full.values[bin * SCAN_VALUES], high = full.values[bin * SCAN_VALUES + 1];
      if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
      const bands = full.values.subarray(bin * SCAN_VALUES + 2, bin * SCAN_VALUES + 5);
      if (bands.some(value => !Number.isFinite(value) || value < 0)) return null;
      min = Math.min(min, low); max = Math.max(max, high);
      lowEnergy += bands[0]; midEnergy += bands[1]; highEnergy += bands[2];
    }
    const count = Math.min(to, full.bins) - from;
    lines.push({ path: `M${x + .5},${(9 - Math.min(1, max) * 8).toFixed(2)}V${(9 - Math.max(-1, min) * 8).toFixed(2)}`,
      energy: [lowEnergy / count, midEnergy / count, highEnergy / count] });
  }
  return lines;
}
