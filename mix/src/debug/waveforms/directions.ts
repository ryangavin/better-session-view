import type { View } from '@openflow/widgets/debug/axis.ts';
import { xOf } from '@openflow/widgets/debug/axis.ts';
import { ink } from '@openflow/widgets/debug/ink.ts';
import type { Beats } from '../../warp.ts';
import type { Measurement } from './measure.ts';
import type { Features } from './features.ts';
import { drawAurora } from './aurora.ts';
import { drawDiscoLasagna, drawElectricDelta, drawLaserGarden } from './excursions.ts';

export const DIRECTIONS = [
  { id: 'prism', name: 'D · Prism', intent: 'A cross-section of the music', description: 'Frequency fills the upper half. Quiet source threads occupy the center; the lower outline keeps the amplitude readable. The white inner curve is sustained signal level.' },
  { id: 'threads', name: 'E · Threads', intent: 'Follow the players', description: 'Thin colored threads trace the source contributions inside an unchanged outline. Three neutral strips at the top show low, mid and high activity.' },
  { id: 'emblems', name: 'F · Emblems', intent: 'Recognize changes at a glance', description: 'A restrained spectral rim follows the waveform. Repeated source symbols collapse into long brackets: entrances and exits become landmarks, with no constant field of color.' },
  { id: 'aurora', name: 'G · Aurora', intent: 'Let the music become a river', description: 'Stems become ribbons of shifting color. They swell, fold and thin with the sound; bright frequencies leave little glints along the edge.' },
  { id: 'lasagna', name: 'H · Disco Lasagna al Dente', intent: 'Separate the layers; keep the groove', description: 'Saturated layers with luminous centers. Open the stems for source identity, or collapse to one RGB silhouette of the whole mix.' },
  { id: 'garden', name: 'I · The Listening Garden', intent: 'Let every bar grow what it contains', description: 'Each musical bar grows a cluster of source-specific plants. Level is height, low energy grows roots, mids grow leaves, and highs become flowers.' },
  { id: 'delta', name: 'J · Electric Delta', intent: 'Follow the current through the song', description: 'Stems flow as stable electrical rivers. Level changes their current, downbeats become pulses, and section boundaries connect them through luminous buses.' },
] as const;
export type Direction = typeof DIRECTIONS[number]['id'];
export const READINGS = ['Everything', 'Amplitude', 'Spectrum', 'Stems', 'Sections', 'Level', 'Grid'];
export const GLYPHS: Record<string, string> = { drums: '◇', bass: '●', vocals: '○', other: '+', guitar: '△', piano: '□' };
export interface Section { name: string; from: number; to: number }
export interface DirectionOptions {
  kind: Direction;
  data: Measurement;
  features: Features;
  sections: Section[];
  grid: Beats;
  automatic: boolean;
  reading: number;
  collapsed?: boolean;
}

/** All designs project the same measurements. No pixel-dependent musical decisions. */
export function drawDirection(g: CanvasRenderingContext2D, v: View, o: DirectionOptions) {
  if (o.kind === 'aurora') { drawAurora(g, v, o); return; }
  if (o.kind === 'lasagna') { drawDiscoLasagna(g, v, o); return; }
  if (o.kind === 'garden') { drawLaserGarden(g, v, o); return; }
  if (o.kind === 'delta') { drawElectricDelta(g, v, o); return; }
  const { data, features, kind, reading } = o;
  const white = ink(g.canvas, '--fg', '#d8d7d4');
  const muted = ink(g.canvas, '--detail', '#747875');
  const spectral = ['#5d9dbc', '#c9a26f', '#e0e4dd'];
  const active = (layer: number) => reading === 0 || reading === layer ? 1 : 0.09;
  const width = Math.ceil(v.width);
  const stemHeight = features.sources.length * 9 + 8;
  const center = v.height * 0.53;
  const half = (v.height - 84 - stemHeight) / 2;
  const topBase = center - stemHeight / 2, bottomBase = center + stemHeight / 2;
  const peak = new Float32Array(width), level = new Float32Array(width);
  const bands = Array.from({ length: 3 }, () => new Float32Array(width));
  const source = features.sources.map(() => new Float32Array(width));
  for (let x = 0; x < width; x++) {
    const start = Math.max(0, Math.floor((v.from + x / v.width * (v.to - v.from)) / data.step));
    const end = Math.min(data.peak.length, Math.max(start + 1, Math.ceil((v.from + (x + 1) / v.width * (v.to - v.from)) / data.step)));
    if (end <= start) continue;
    for (let i = start; i < end; i++) {
      peak[x] = Math.max(peak[x], data.peak[i]);
      level[x] += features.level[i] / (end - start);
      for (let b = 0; b < 3; b++) bands[b][x] += data.bands[b][i] / (end - start);
      source.forEach((values, s) => { values[x] += features.sources[s].level[i] / (end - start); });
    }
  }

  // Structure stays at the periphery. Dashes identify an automatically generated section set.
  g.globalAlpha = active(4);
  for (const section of o.sections) {
    const x = Math.max(0, xOf(v, section.from)), end = Math.min(v.width, xOf(v, section.to));
    if (end <= x) continue;
    g.strokeStyle = muted; g.lineWidth = 1;
    g.setLineDash(o.automatic ? [3, 4] : []);
    g.beginPath(); g.moveTo(x + 1, 27); g.lineTo(end - 3, 27); g.stroke(); g.setLineDash([]);
    g.fillStyle = white; g.fillRect(x, 23, 1, 7);
    if (end - x > 34) {
      g.save(); g.beginPath(); g.rect(x + 6, 0, end - x - 10, 22); g.clip();
      g.font = '11px system-ui'; g.fillText(section.name, x + 7, 17); g.restore();
    }
  }

  // Amplitude is an invariant silhouette, normalized once to the track peak.
  g.globalAlpha = active(1) * (kind === 'threads' ? 0.24 : 0.33);
  g.fillStyle = white;
  for (let x = 0; x < width; x++) {
    const h = peak[x] / features.peak * half;
    g.fillRect(x, topBase - h, 1, h); g.fillRect(x, bottomBase, 1, h);
  }
  g.globalAlpha = active(1) * 0.55;
  g.strokeStyle = white; g.lineWidth = 0.75;
  for (const side of [-1, 1]) {
    g.beginPath();
    for (let x = 0; x < width; x++) {
      const y = (side < 0 ? topBase : bottomBase) + side * peak[x] / features.peak * half;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }

  g.globalAlpha = active(2);
  for (let x = 0; x < width; x++) {
    const h = peak[x] / features.peak * half;
    const total = bands.reduce((sum, b) => sum + b[x], 0) || 1;
    if (kind === 'prism') {
      let offset = 0;
      bands.forEach((values, b) => {
        const size = h * values[x] / total;
        g.fillStyle = spectral[b]; g.fillRect(x, topBase - offset - size, 1, size); offset += size;
      });
    } else if (kind === 'threads') {
      bands.forEach((values, b) => {
        g.fillStyle = white;
        g.globalAlpha = active(2) * Math.min(0.9, Math.max(0.025, (20 * Math.log10(Math.max(values[x], 0.001)) + 60) / 60));
        g.fillRect(x, 35 + b * 4, 1, 2);
      });
    } else if (h > 1) {
      // Spectral balance changes only the thin rim; the body keeps its neutral reading.
      const rgb = [[93, 157, 188], [201, 162, 111], [224, 228, 221]];
      const mix = [0, 1, 2].map((c) => Math.round(bands.reduce((sum, b, i) => sum + b[x] / total * rgb[i][c], 0)));
      g.fillStyle = `rgb(${mix.join(',')})`;
      g.fillRect(x, topBase - h - 1, 1, 2.5);
    }
  }

  if (kind === 'threads') {
    // Unfilled paths reveal composition without turning the amplitude body into a color wall.
    features.sources.forEach((stem, s) => {
      g.strokeStyle = ink(g.canvas, `--stem-${stem.id}`, white);
      g.globalAlpha = active(3) * 0.9;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = 0; x < width; x++) {
        const total = source.reduce((sum, values) => sum + values[x], 0) || 1;
        const before = source.slice(0, s).reduce((sum, values) => sum + values[x], 0);
        const y = topBase - peak[x] / features.peak * half * (before + source[s][x] / 2) / total;
        if (source[s][x] < 0.003 || x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    });
  }

  // Sources keep a stable vertical position. Hue has one job in each direction.
  g.font = '11px system-ui';
  features.sources.forEach((stem, s) => {
    const y = topBase + 8 + s * 9;
    const color = kind === 'threads' ? ink(g.canvas, `--stem-${stem.id}`, white) : white;
    if (kind !== 'emblems') {
      g.fillStyle = color;
      for (let x = 0; x < width; x++) {
        const strength = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(source[s][x], 0.001)) + 54) / 48));
        g.globalAlpha = active(3) * strength;
        g.fillRect(x, y, 1, kind === 'threads' ? 1 + strength * 2 : 2);
      }
    }
    g.globalAlpha = active(3);
    g.strokeStyle = color; g.fillStyle = color;
    for (const span of stem.spans) {
      const start = xOf(v, span.from), end = xOf(v, span.to);
      if (end < 0 || start > v.width) continue;
      if (kind === 'emblems') {
        g.lineWidth = 1;
        g.globalAlpha = active(3) * 0.6;
        g.beginPath(); g.moveTo(Math.max(0, start), y); g.lineTo(Math.min(v.width, end), y); g.stroke();
        if (end < v.width) g.fillRect(end, y - 2, 1, 5);
      }
      // One symbol at an entrance, never an invented classification or a per-pixel glyph.
      if (start >= 0 && end - start > 18) {
        g.globalAlpha = active(3);
        g.clearRect(start, y - 5, 11, 10);
        g.fillText(GLYPHS[stem.id] ?? '·', start + 1, y + 3);
      }
    }
  });

  // The fixed-window RMS curve has a different geometry from the jagged peak boundary.
  g.globalAlpha = active(5) * 0.85; g.strokeStyle = white; g.lineWidth = 1.6;
  g.beginPath();
  for (let x = 0; x < width; x++) {
    const y = bottomBase + level[x] / features.peak * half;
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();

  // Grid marks appear only as their spacing becomes useful, and never fence the whole picture.
  g.globalAlpha = active(6); g.fillStyle = muted;
  let last = -100;
  o.grid.samples.forEach((sample, i) => {
    const x = xOf(v, sample / o.grid.rate);
    const down = (o.grid.first + i) % 4 === 0;
    if (x < 0 || x > v.width || (!down && v.width / (v.to - v.from) < 80) || x - last < 14) return;
    g.fillRect(x, v.height - (down ? 10 : 6), 1, down ? 6 : 2); last = x;
  });
  g.globalAlpha = 1;
}
