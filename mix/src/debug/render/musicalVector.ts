import { levelsOf, type Steps } from '@openflow/widgets/wave/levels.ts';
import { edgesOf, pathOf, type Edges } from '@openflow/widgets/wave/outline.ts';
import type { View } from '@openflow/widgets/debug/axis.ts';
import type { Measurement } from '../waveforms/measure.ts';
import { paintSilk, paintStemSilk } from './silkVector.ts';
import { smooth } from '../waveforms/features.ts';

export const GEOMETRIES = ['Mix peak', 'Stem layers', 'Flowing stack', 'Silk ribbon', 'Stem ribbons'] as const;
export const PALETTES = ['Spectral RGB', 'Source colors', 'Rainbow'] as const;
export const TREATMENTS = ['Luminous RMS', 'Solid', 'Spectral rim', 'Contours', 'Threads', 'Melt'] as const;
export interface MusicalStyle { geometry: number; palette: number; treatment: number; density: number; smoothing: number; ribbonFullness?: boolean; ribbonSplit?: boolean; ribbonBlend?: number; ribbonOrder?: number }
export const PRESETS = [
  { name: 'Collapsed RGB', geometry: 0, palette: 0, treatment: 0 },
  { name: 'Prism', geometry: 0, palette: 0, treatment: 1 },
  { name: 'Emblems · rim', geometry: 0, palette: 0, treatment: 2 },
  { name: 'Lasagna · stems', geometry: 1, palette: 1, treatment: 3 },
  { name: 'Threads', geometry: 1, palette: 1, treatment: 4 },
  { name: 'Aurora', geometry: 2, palette: 2, treatment: 3 },
  { name: 'Electric Delta', geometry: 1, palette: 1, treatment: 0 },
  { name: 'Silk · stem ribbons', geometry: 4, palette: 1, treatment: 6, ribbonBlend: 0 },
  { name: 'Silk · woven light', geometry: 3, palette: 1, treatment: 4 },
  { name: 'Melt · source pigment', geometry: 2, palette: 1, treatment: 5 },
] as const;
const COLORS: Record<string, string> = { drums: '#ffb84c', bass: '#7974ff', other: '#52e1ca', vocals: '#ff66b0', guitar: '#a5df59', piano: '#c99aff' };
export interface MusicalData { data: Measurement; peak: readonly Steps[]; ceiling: number; energy: Float64Array; bands: Float64Array[]; stems: Float32Array[]; maxima: number[]; pigment: Float32Array[]; pigmentCeiling: number; participation: Float32Array }
export function powerPrefix(values: Float32Array): Float64Array {
  const out = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) out[i + 1] = out[i] + values[i] ** 2;
  return out;
}
export function rmsBetween(prefix: Float64Array, from: number, to: number): number {
  const a = Math.max(0, Math.min(prefix.length - 2, Math.floor(from)));
  const b = Math.max(a + 1, Math.min(prefix.length - 1, Math.ceil(to)));
  return Math.sqrt(Math.max(0, prefix[b] - prefix[a]) / (b - a));
}
export function musicalData(data: Measurement): MusicalData {
  const ceiling = Math.max(0.001, data.peak.reduce((a, b) => Math.max(a, b), 0));
  const packed = new Float32Array(data.peak.length * 2);
  data.peak.forEach((p, i) => { packed[i * 2] = -p / ceiling; packed[i * 2 + 1] = p / ceiling; });
  const stems = data.stems.map((s) => smooth(s.rms, data.step, 0.8));
  // Two passes soften the boundary trajectories before any color is painted.
  const pigment = data.stems.map((s) => smooth(smooth(s.rms, data.step, 8), data.step, 8));
  let pigmentCeiling = 0.001;
  for (let i = 0; i < data.peak.length; i++) pigmentCeiling = Math.max(pigmentCeiling, pigment.reduce((sum, stem) => sum + stem[i] ** 0.85, 0));
  const sourceRefs = pigment.map((values) => {
    const sorted = Array.from(values).sort((a, b) => a - b);
    return Math.max(0.0001, sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0);
  });
  const participation = Float32Array.from(data.rms, (_, i) => pigment.reduce((sum, stem, s) => {
    const relative = stem[i] / sourceRefs[s];
    return sum + Math.min(1, Math.max(0, (relative - 0.08) / 0.52));
  }, 0) / Math.max(1, pigment.length));
  // A single master avoids the shared peak ladder's odd-tail truncation in these summaries.
  // Pad to a power of two and retain the original bin count for the time mapping.
  const size = 2 ** Math.ceil(Math.log2(Math.max(1, data.peak.length)));
  const padded = new Float32Array(size * 2); padded.set(packed);
  return { data, peak: levelsOf(padded), ceiling, energy: powerPrefix(data.rms), bands: data.bands.map(powerPrefix), stems, maxima: stems.map((s) => s.reduce((a, b) => Math.max(a, b), 0.001)), pigment, pigmentCeiling, participation };
}

/** Closed vector geometry through the shared wave renderer, with independent color fields. */
export function paintMusical(g: CanvasRenderingContext2D, view: View, model: MusicalData, style: MusicalStyle, sectionStarts: readonly number[] = []) {
  if (style.geometry === 4) return paintStemSilk(g, view, model, style, sectionStarts);
  if (style.geometry === 3) return paintSilk(g, view, model, style);
  const t0 = performance.now();
  const { data } = model;
  // Phrase-scale control points give Melt long, deliberate curves at every zoom.
  const count = Math.max(2, Math.min(data.peak.length, Math.ceil(view.width * style.density),
    style.treatment === 5 && style.geometry !== 0 ? Math.ceil((view.to - view.from) / 4) + 1 : Infinity));
  const first = view.from / data.step, last = view.to / data.step;
  const index = (i: number) => Math.max(0, Math.min(data.peak.length - 1, Math.floor(first + i / (count - 1) * (last - first))));
  const custom = (bounds: (i: number) => [number, number]): Edges => {
    const topX = new Float32Array(count), lowX = new Float32Array(count), topY = new Float32Array(count), lowY = new Float32Array(count);
    for (let i = 0; i < count; i++) { topX[i] = lowX[i] = i / (count - 1) * view.width; [topY[i], lowY[i]] = bounds(i); }
    return { topX, lowX, topY, lowY, points: count, read: count, level: 0 };
  };
  const middle = view.height / 2, reach = view.height * 0.43;
  const n = data.stems.length;
  const paths: { body: Path2D; core: Path2D; color: string; edge?: Edges }[] = [];
  const curve = style.smoothing;
  let read = 0, points = 0;
  if (style.geometry === 0) {
    const paddedBins = model.peak[0].length / 2;
    const edge = edgesOf(model.peak, { from: first / paddedBins, to: last / paddedBins, width: view.width, height: view.height, density: style.density, smooth: style.smoothing, headroom: 0.86, thinnest: 0 });
    const core = custom((i) => {
      const at = first + i / (count - 1) * (last - first);
      const h = Math.min(1, rmsBetween(model.energy, at, at + Math.max(1, (last - first) / count)) / model.ceiling) * reach;
      return [middle - h, middle + h];
    });
    paths.push({ body: pathOf(edge, style.smoothing), core: pathOf(core, style.smoothing), color: '#c5a5ff' });
    read += edge.read + count; points += edge.points + count;
  } else {
    const value = (s: number, i: number) => style.treatment === 5
      ? model.pigment[s][index(i)] ** 0.85 / model.pigmentCeiling * n
      : Math.pow(model.stems[s][index(i)] / model.maxima[s], 0.68);
    for (let s = 0; s < n; s++) {
      const bounds = (i: number): [number, number] => {
        const h = value(s, i) * view.height * 0.38 / n;
        if (style.geometry === 1) { const center = (s + 0.5) * view.height / n; return [center - h, center + h]; }
        let total = 0, before = 0;
        for (let j = 0; j < n; j++) { const v = value(j, i) * view.height * 0.76 / n; total += v; if (j < s) before += v; }
        const y = middle - total / 2 + before;
        return [y, y + h * 2];
      };
      const edge = custom(bounds);
      const core = custom((i) => { const [a, b] = bounds(i); const c = (a + b) / 2; return [c - (b - a) * 0.14, c + (b - a) * 0.14]; });
      paths.push({ body: pathOf(edge, curve), core: pathOf(core, curve), edge, color: COLORS[data.stems[s].id] ?? '#b5b0cf' });
      read += count * 2; points += count * 2;
    }
  }
  const made = performance.now();
  const gradient = g.createLinearGradient(0, 0, view.width, 0);
  const stops = Math.min(256, Math.max(2, Math.ceil(view.width / 4)));
  for (let i = 0; i < stops; i++) {
    const at = first + i / (stops - 1) * (last - first);
    const rgb = model.bands.map((p, b) => rmsBetween(p, at, at + Math.max(1, (last - first) / stops)) * [1, 2, 4][b]);
    const max = Math.max(1e-6, ...rgb);
    gradient.addColorStop(i / (stops - 1), style.palette === 2 ? `hsl(${i / (stops - 1) * 300 + 210},95%,65%)` : `rgb(${rgb.map((v) => Math.round(255 * (v / max) ** 1.4)).join(',')})`);
  }
  g.save();
  g.fillStyle = '#090913'; g.fillRect(0, 0, view.width, view.height);
  if (style.treatment === 5) {
    const silhouette = new Path2D();
    for (const p of paths) silhouette.addPath(p.body);
    g.clip(silhouette);
    if (style.palette === 1 && style.geometry !== 0) {
      if (style.geometry === 1) {
        for (const p of paths) { g.fillStyle = p.color; g.fill(p.body); }
      } else if (paths.length) {
        // Paint overlapping vector ribbons along the SAME boundaries as the body.
        // Each step covers everything below it, avoiding antialias seams between strips.
        g.fillStyle = paths[0].color; g.fill(silhouette);
        const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
        for (let s = 0; s < n - 1; s++) {
          const edge = paths[s].edge!, next = paths[s + 1].edge!;
          const a = rgb(paths[s].color), b = rgb(paths[s + 1].color);
          for (let step = 0; step <= 12; step++) {
            const t = step / 12;
            const topY = new Float32Array(count), lowY = new Float32Array(count).fill(view.height);
            for (let i = 0; i < count; i++) {
              const radius = Math.max(0, Math.min(1.25, view.height * 0.008,
                (edge.lowY[i] - edge.topY[i]) / 4, (next.lowY[i] - next.topY[i]) / 4));
              topY[i] = edge.lowY[i] + (2 * t - 1) * radius;
            }
            // Smooth color acceleration, with a solid field on either side.
            const blend = t * t * (3 - 2 * t);
            g.fillStyle = `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * blend)).join(',')})`;
            g.fill(pathOf({ ...edge, topY, lowY }, curve));
          }
        }
      }
    } else {
      g.fillStyle = style.palette === 1 ? paths[0].color : gradient;
      g.fill(silhouette);
    }
    g.restore();
    return { build: made - t0, fill: performance.now() - made, points, read };
  }
  for (const p of paths) {
    const color = style.palette === 1 ? p.color : gradient;
    g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 1;
    g.globalAlpha = style.treatment === 0 ? 0.38 : style.treatment === 2 ? 0.12 : style.treatment === 4 ? 0.08 : 0.8;
    g.fill(p.body); g.globalAlpha = 0.95;
    if (style.treatment !== 1) g.stroke(p.body);
    if (style.treatment === 0 || style.treatment === 3) {
      g.save(); g.clip(p.body); g.fill(p.core); g.restore();
    }
    if (style.treatment === 3 || style.treatment === 4) {
      g.globalAlpha = 0.4; g.stroke(p.core);
    }
  }
  g.restore();
  return { build: made - t0, fill: performance.now() - made, points, read };
}
