import type { View } from '@openflow/widgets/debug/axis.ts';
import { xOf } from '@openflow/widgets/debug/axis.ts';
import type { DirectionOptions } from './directions.ts';
import type { Measurement } from './measure.ts';
import { smooth } from './features.ts';
import { BEATS_PER_BAR, beatAt, sampleOf } from '../../warp.ts';

interface Softened {
  stems: Float32Array[];
  stemPeaks: number[];
  ceiling: number;
}

const cache = new WeakMap<Measurement, Softened>();
const HUES: Record<string, number> = { drums: 28, bass: 226, other: 174, vocals: 316, guitar: 112, piano: 278 };

function softened(data: Measurement): Softened {
  const known = cache.get(data);
  if (known) return known;
  const stems = data.stems.map((stem) => smooth(stem.rms, data.step, 0.8));
  const stemPeaks = stems.map((stem) => stem.reduce((peak, value) => Math.max(peak, value), 0.001));
  let ceiling = 0.001;
  for (let i = 0; i < data.peak.length; i++) {
    ceiling = Math.max(ceiling, stems.reduce((sum, stem) => sum + Math.pow(stem[i], 0.72), 0));
  }
  const result = { stems, stemPeaks, ceiling };
  cache.set(data, result);
  return result;
}

function sampleAt(data: Measurement, view: View, x: number): number {
  const time = view.from + x / view.width * (view.to - view.from);
  return Math.max(0, Math.min(data.peak.length - 1, Math.floor(time / data.step)));
}

function sectionBands(g: CanvasRenderingContext2D, view: View, o: Pick<DirectionOptions, 'sections'>, alpha = 0.06) {
  o.sections.forEach((section, i) => {
    const left = Math.max(0, xOf(view, section.from));
    const right = Math.min(view.width, xOf(view, section.to));
    if (right <= left) return;
    g.fillStyle = `hsla(${(i * 61 + 230) % 360},70%,52%,${alpha})`;
    g.fillRect(left, 0, right - left, view.height);
    if (right - left > 36) {
      g.fillStyle = '#d8d3e7a0';
      g.font = '11px system-ui';
      g.save();
      g.beginPath();
      g.rect(left + 5, 0, right - left - 10, 32);
      g.clip();
      g.fillText(section.name.toLowerCase(), left + 9, 21);
      g.restore();
    }
  });
}

function spectrum(data: Measurement, n: number): { warmth: number; brightness: number } {
  const low = data.bands[0][n];
  const mid = data.bands[1][n];
  const high = data.bands[2][n];
  const total = low + mid + high || 1;
  return { warmth: (mid + high * 2) / total, brightness: Math.min(1, high * 18) };
}

/** A deliberately ordered stem score: hue names a source, thickness says level. */
export function drawDiscoLasagna(g: CanvasRenderingContext2D, view: View, o: DirectionOptions) {
  if (o.collapsed) { drawCollapsedLasagna(g, view, o); return; }
  const data = o.data;
  const soft = softened(data);
  const ground = g.createLinearGradient(0, 0, 0, view.height);
  ground.addColorStop(0, '#0a0a17');
  ground.addColorStop(0.5, '#130d21');
  ground.addColorStop(1, '#090a15');
  g.fillStyle = ground;
  g.fillRect(0, 0, view.width, view.height);
  sectionBands(g, view, o, 0.035);

  const top = 48;
  const lane = (view.height - 78) / data.stems.length;
  data.stems.forEach((stem, s) => {
    const middle = top + lane * (s + 0.5);
    const hue = HUES[stem.id] ?? s * 75;
    g.strokeStyle = `hsla(${hue},55%,55%,0.15)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, middle + 0.5);
    g.lineTo(view.width, middle + 0.5);
    g.stroke();

    for (let x = 0; x < view.width; x++) {
      const n = sampleAt(data, view, x);
      const power = Math.pow(soft.stems[s][n] / soft.stemPeaks[s], 0.68);
      const h = power * lane * 0.38;
      const { warmth, brightness } = spectrum(data, n);
      const light = 23 + power * 30 + brightness * 12;
      const color = hue + warmth * 48;
      g.fillStyle = `hsl(${color},100%,${light}%)`;
      g.fillRect(x, middle - h, 1, h * 2);
      // A saturated body with a hot center, rather than a uniformly pastel ribbon.
      g.fillStyle = `hsla(${color + 35},100%,${54 + power * 25}%,${power * 0.85})`;
      g.fillRect(x, middle - h * 0.28, 1, h * 0.56);
    }

    for (const side of [-1, 1]) {
      g.beginPath();
      for (let x = 0; x <= view.width; x += 2) {
        const n = sampleAt(data, view, x);
        const power = Math.pow(soft.stems[s][n] / soft.stemPeaks[s], 0.68);
        const y = middle + side * power * lane * 0.38;
        if (!x) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = `hsla(${hue + 28},100%,76%,0.74)`;
      g.shadowBlur = 7;
      g.shadowColor = `hsl(${hue},90%,58%)`;
      g.stroke();
      g.shadowBlur = 0;
    }

    for (const fraction of [0.25, 0.5, 0.75]) {
      g.beginPath();
      for (let x = 0; x <= view.width; x += 3) {
        const n = sampleAt(data, view, x);
        const power = Math.pow(soft.stems[s][n] / soft.stemPeaks[s], 0.68);
        const y = middle - power * lane * 0.38 + power * lane * 0.76 * fraction;
        if (!x) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = `hsla(${hue + 48},100%,84%,0.19)`;
      g.stroke();
    }
    g.fillStyle = '#fff8ffd8';
    g.font = '11px system-ui';
    g.fillText(stem.id, 10, middle + 4);
  });
}

/** RGB describes the measured mixture, not a sum of separately normalized stems. */
export function drawCollapsedLasagna(g: CanvasRenderingContext2D, view: View, o: Pick<DirectionOptions, 'data' | 'features' | 'sections'>) {
  const { data } = o;
  const compact = view.height <= 64;
  const middle = compact ? view.height / 2 : (view.height + 22) / 2;
  const height = compact ? Math.max(0, view.height / 2 - 2) : (view.height - 66) / 2;
  const ceiling = Math.max(0.001, o.features.peak);
  g.fillStyle = '#090913';
  g.fillRect(0, 0, view.width, view.height);
  if (!compact) sectionBands(g, view, o, 0.035);
  for (let x = 0; x < view.width; x++) {
    const start = sampleAt(data, view, x);
    const end = Math.min(data.peak.length, Math.max(start + 1, sampleAt(data, view, x + 1)));
    let peak = 0, energy = 0;
    const bands = [0, 0, 0];
    for (let n = start; n < end; n++) {
      peak = Math.max(peak, data.peak[n]);
      energy += data.rms[n] ** 2;
      for (let b = 0; b < 3; b++) bands[b] += data.bands[b][n] ** 2;
    }
    // Fixed emphasis lifts quieter upper bands; it does not change with zoom or track.
    const balanced = bands.map((v, b) => Math.sqrt(v / (end - start)) * [1, 2, 4][b]);
    const strongest = Math.max(0.000001, ...balanced);
    const rgb = balanced.map((v) => Math.round(255 * Math.pow(v / strongest, 1.4)));
    const color = rgb.join(',');
    const extent = Math.min(1, peak / ceiling) * height;
    const core = Math.min(extent, Math.sqrt(energy / (end - start)) / ceiling * height);
    g.fillStyle = `rgba(${color},0.38)`;
    g.fillRect(x, middle - extent, 1, extent * 2);
    g.fillStyle = `rgb(${color})`;
    g.fillRect(x, middle - core, 1, core * 2);
    g.fillStyle = `rgba(${color},0.95)`;
    if (extent > 0.2) {
      g.fillRect(x, middle - extent, 1, 1);
      g.fillRect(x, middle + extent, 1, 1);
    }
  }
  g.fillStyle = '#e9e0f5';
  g.font = '11px system-ui';
  if (!compact) g.fillText('COLLAPSED · peak silhouette / luminous RMS', 10, view.height - 12);
}

interface Bar { from: number; to: number }

function visibleBars(o: DirectionOptions, view: View): Bar[] {
  const bars: Bar[] = [];
  const first = Math.floor(beatAt(o.grid, view.from * o.grid.rate) / BEATS_PER_BAR) - 1;
  const last = Math.ceil(beatAt(o.grid, view.to * o.grid.rate) / BEATS_PER_BAR) + 1;
  for (let bar = first; bar <= last; bar++) {
    const from = sampleOf(o.grid, bar * BEATS_PER_BAR) / o.grid.rate;
    const to = sampleOf(o.grid, (bar + 1) * BEATS_PER_BAR) / o.grid.rate;
    if (to >= view.from && from <= view.to && to > from) bars.push({ from, to });
  }
  const px = bars.length > 1 ? xOf(view, bars[1].from) - xOf(view, bars[0].from) : view.width;
  const stride = Math.max(1, Math.ceil(11 / Math.max(1, px)));
  return bars.filter((_, i) => i % stride === 0).map((bar, i, kept) => ({ from: bar.from, to: kept[i + 1]?.from ?? bar.to }));
}

function average(values: Float32Array, data: Measurement, from: number, to: number): number {
  const start = Math.max(0, Math.floor(from / data.step));
  const end = Math.min(values.length, Math.max(start + 1, Math.ceil(to / data.step)));
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i] ** 2;
  return Math.sqrt(sum / (end - start));
}

function plant(g: CanvasRenderingContext2D, id: string, x: number, soil: number, height: number, low: number, mid: number, high: number, hue: number) {
  const bend = Math.sin(x * 0.17 + hue) * Math.min(5, height * 0.08);
  g.strokeStyle = `hsla(${hue},78%,65%,0.82)`;
  g.fillStyle = `hsla(${hue + 34},92%,68%,0.86)`;
  g.lineWidth = 0.8 + low * 1.4;
  g.beginPath();
  g.moveTo(x, soil);
  g.quadraticCurveTo(x - bend, soil - height * 0.55, x + bend, soil - height);
  g.stroke();

  if (id === 'drums') {
    const leaves = 1 + Math.round(mid * 3);
    for (let i = 1; i <= leaves; i++) {
      const y = soil - height * i / (leaves + 1);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (i % 2 ? 1 : -1) * (4 + mid * 5), y - 5);
      g.stroke();
    }
    g.save();
    g.translate(x + bend, soil - height);
    g.rotate(Math.PI / 4);
    g.fillRect(-2 - high * 2, -2 - high * 2, 4 + high * 4, 4 + high * 4);
    g.restore();
  } else if (id === 'bass') {
    g.beginPath();
    g.arc(x + bend, soil - height, 2 + high * 3.5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x, soil);
    g.quadraticCurveTo(x - 5, soil + low * 11, x - 3 - low * 6, soil + low * 15);
    g.moveTo(x, soil);
    g.quadraticCurveTo(x + 5, soil + low * 10, x + 3 + low * 6, soil + low * 14);
    g.stroke();
  } else if (id === 'vocals') {
    const petals = 5;
    const radius = 1.5 + high * 4;
    for (let i = 0; i < petals; i++) {
      const angle = i / petals * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + bend + Math.cos(angle) * radius, soil - height + Math.sin(angle) * radius, radius, radius * 0.42, angle, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    const branches = 2 + Math.round(mid * 3);
    for (let i = 1; i <= branches; i++) {
      const y = soil - height * i / (branches + 1);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (i % 2 ? 7 : -7), y - 2, x + (i % 2 ? 9 : -9), y - 8);
      g.stroke();
      g.beginPath();
      g.arc(x + (i % 2 ? 9 : -9), y - 8, 1 + high * 1.5, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A botanical score: one cluster per musical bar, one species per source. */
export function drawLaserGarden(g: CanvasRenderingContext2D, view: View, o: DirectionOptions) {
  const data = o.data;
  const soft = softened(data);
  const sky = g.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, '#090b1b');
  sky.addColorStop(0.68, '#11172a');
  sky.addColorStop(1, '#181322');
  g.fillStyle = sky;
  g.fillRect(0, 0, view.width, view.height);
  sectionBands(g, view, o, 0.045);
  const soil = view.height - 44;
  g.fillStyle = '#25142a';
  g.fillRect(0, soil, view.width, view.height - soil);
  g.strokeStyle = '#93609f66';
  g.beginPath();
  g.moveTo(0, soil + 0.5);
  g.lineTo(view.width, soil + 0.5);
  g.stroke();

  for (const bar of visibleBars(o, view)) {
    const left = xOf(view, bar.from);
    const right = xOf(view, bar.to);
    const width = right - left;
    data.stems.forEach((stem, s) => {
      const rms = average(soft.stems[s], data, bar.from, bar.to);
      const power = Math.pow(rms / soft.stemPeaks[s], 0.72);
      if (power < 0.045) return;
      const bands = data.bands.map((band) => average(band, data, bar.from, bar.to));
      const maximum = Math.max(...bands, 0.001);
      const x = left + width * (s + 0.5) / data.stems.length;
      const height = 12 + power * (view.height - 106);
      plant(g, stem.id, x, soil, height, bands[0] / maximum, bands[1] / maximum, bands[2] / maximum, HUES[stem.id] ?? s * 75);
    });
  }
}

/** Stable source currents, joined by section buses and pulsed by the musical grid. */
export function drawElectricDelta(g: CanvasRenderingContext2D, view: View, o: DirectionOptions) {
  const data = o.data;
  const soft = softened(data);
  const ground = g.createRadialGradient(view.width * 0.5, view.height * 0.5, 8, view.width * 0.5, view.height * 0.5, view.width * 0.75);
  ground.addColorStop(0, '#0d1620');
  ground.addColorStop(0.62, '#080f17');
  ground.addColorStop(1, '#05080d');
  g.fillStyle = ground;
  g.fillRect(0, 0, view.width, view.height);
  sectionBands(g, view, o, 0.025);

  const top = 72;
  const lane = (view.height - 118) / data.stems.length;
  const paths: number[][] = data.stems.map(() => []);
  for (let s = 0; s < data.stems.length; s++) {
    const hue = HUES[data.stems[s].id] ?? s * 75;
    const center = top + lane * (s + 0.5);
    for (let x = 0; x <= view.width; x += 2) {
      const n = sampleAt(data, view, x);
      const power = Math.pow(soft.stems[s][n] / soft.stemPeaks[s], 0.68);
      paths[s].push(center + Math.sin(n * data.step * 0.19 + s * 1.4) * (1 + power * 5));
    }
    for (const halo of [10, 4, 1]) {
      g.beginPath();
      paths[s].forEach((y, i) => i ? g.lineTo(i * 2, y) : g.moveTo(0, y));
      g.strokeStyle = `hsla(${hue},95%,${halo === 1 ? 72 : 55}%,${halo === 10 ? 0.08 : halo === 4 ? 0.2 : 0.88})`;
      g.lineWidth = halo;
      g.stroke();
    }
    for (let x = 0; x < view.width; x += 3) {
      const n = sampleAt(data, view, x);
      const power = Math.pow(soft.stems[s][n] / soft.stemPeaks[s], 0.68);
      if (power < 0.025) continue;
      const y = paths[s][Math.min(paths[s].length - 1, Math.floor(x / 2))];
      g.fillStyle = `hsla(${hue + spectrum(data, n).warmth * 28},100%,74%,${0.18 + power * 0.65})`;
      g.fillRect(x, y - 0.5 - power * 2, 3, 1 + power * 4);
    }
    g.fillStyle = '#eaf7ffcc';
    g.font = '11px system-ui';
    g.fillText(data.stems[s].id, 10, center - 9);
  }

  for (const section of o.sections.slice(1)) {
    const x = xOf(view, section.from);
    if (x < 0 || x > view.width) continue;
    g.strokeStyle = '#7d9dac44';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, top + lane * 0.5);
    g.lineTo(x, top + lane * (data.stems.length - 0.5));
    g.stroke();
    paths.forEach((path, s) => {
      const y = path[Math.max(0, Math.min(path.length - 1, Math.round(x / 2)))];
      const hue = HUES[data.stems[s].id] ?? s * 75;
      g.fillStyle = `hsl(${hue},100%,74%)`;
      g.shadowBlur = 10;
      g.shadowColor = `hsl(${hue},100%,60%)`;
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    });
  }

  for (let i = 0; i < o.grid.samples.length; i++) {
    if ((o.grid.first + i) % 4 !== 0) continue;
    const time = o.grid.samples[i] / o.grid.rate;
    const x = xOf(view, time);
    if (x < 0 || x > view.width) continue;
    const n = Math.max(0, Math.min(data.peak.length - 1, Math.floor(time / data.step)));
    let strongest = 0;
    for (let s = 1; s < soft.stems.length; s++) if (soft.stems[s][n] > soft.stems[strongest][n]) strongest = s;
    const y = paths[strongest][Math.max(0, Math.min(paths[strongest].length - 1, Math.round(x / 2)))];
    g.fillStyle = '#f4fbffcc';
    g.beginPath();
    g.arc(x, y, 1.4, 0, Math.PI * 2);
    g.fill();
  }
}
