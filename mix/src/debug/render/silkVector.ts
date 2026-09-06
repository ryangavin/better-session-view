import type { View } from '@openflow/widgets/debug/axis.ts';
import type { MusicalData, MusicalStyle } from './musicalVector.ts';

const SOURCE: Record<string, string> = { drums: '#ffb84c', bass: '#7974ff', other: '#52e1ca', vocals: '#ff66b0', guitar: '#a5df59', piano: '#c99aff' };
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** An expressive folded sheet: time stays horizontal; rotation is ornament, not phase. */
export function paintSilk(g: CanvasRenderingContext2D, v: View, model: MusicalData, style: MusicalStyle) {
  const start = performance.now();
  const count = Math.max(48, Math.ceil(v.width * style.density));
  const strands = v.height < 60 ? 12 : 24;
  const colors = model.data.stems.map((s) => rgb(SOURCE[s.id] ?? '#c5a5ff'));
  const columns = Array.from({ length: count + 1 }, (_, i) => {
    const time = v.from + i / count * (v.to - v.from);
    const bin = Math.min(model.data.peak.length - 1, Math.max(0, time / model.data.step));
    const a = Math.floor(bin), b = Math.min(a + 1, model.data.peak.length - 1), f = bin - a;
    const weights = model.pigment.map((s) => (s[a] * (1 - f) + s[b] * f) ** 0.85);
    const sum = weights.reduce((x, y) => x + y, 0);
    const amplitude = sum / model.pigmentCeiling * v.height * 0.39;
    // Absolute source time keeps folds stable when panning or changing row width.
    const balance = weights.reduce((total, weight, s) => total + weight * s, 0) / Math.max(sum, 0.000001);
    const turn = time * 0.085 + 0.8 * Math.sin(time * 0.034) + balance * 1.7;
    const point = (u: number) => {
      const cross = 2 * u - 1;
      const bow = 0.36 * (1 - cross * cross);
      return {
        x: i / count * v.width,
        y: v.height / 2 + amplitude * (cross * Math.cos(turn) + bow * Math.sin(turn) + 0.2 * Math.sin(turn * 0.7)),
        z: cross * Math.sin(turn) - bow * Math.cos(turn),
      };
    };
    const color = (u: number) => {
      if (style.palette === 2) return `hsl(${210 + time / model.data.seconds * 300 + u * 55},90%,68%)`;
      if (style.palette === 0) {
        const bands = model.data.bands.map((band, k) => band[a] * [1, 2, 4][k]);
        const max = Math.max(0.000001, ...bands);
        return `rgb(${bands.map((x) => Math.round(255 * (x / max) ** 0.8)).join(',')})`;
      }
      // The cross-section is apportioned by actual relative source energy.
      let edge = 0;
      for (let s = 0; s < weights.length; s++) {
        edge += weights[s] / Math.max(sum, 0.000001);
        if (u <= edge || s === weights.length - 1) {
          const blend = Math.max(0, Math.min(1, (u - edge + 0.035) / 0.07));
          const next = colors[Math.min(s + 1, colors.length - 1)];
          return `rgb(${colors[s].map((x, k) => Math.round(x + (next[k] - x) * blend)).join(',')})`;
        }
      }
      return '#c5a5ff';
    };
    return { point, color };
  });
  const built = performance.now();
  g.save(); g.fillStyle = '#090913'; g.fillRect(0, 0, v.width, v.height);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // Within each time slice, rear surfaces are painted before front surfaces.
  for (let i = 0; i < count; i++) {
    const left = columns[i], right = columns[i + 1];
    const order = Array.from({ length: strands }, (_, j) => j)
      .sort((a, b) => left.point((a + 0.5) / strands).z - left.point((b + 0.5) / strands).z);
    for (const j of order) {
      const u = j / strands, w = (j + 1) / strands;
      const a = left.point(u), b = right.point(u), c = right.point(w), d = left.point(w);
      const ink = g.createLinearGradient(a.x, 0, b.x, 0);
      ink.addColorStop(0, left.color(u)); ink.addColorStop(1, right.color(u));
      g.fillStyle = ink; g.strokeStyle = ink;
      g.globalAlpha = style.treatment === 1 ? 0.7 : 0.09 + (a.z + 1) * 0.045;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
      g.globalAlpha = 0.46 + (a.z + 1) * 0.24;
      g.lineWidth = v.height < 60 ? 0.65 : 0.85;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      if (j === strands - 1) { g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(c.x, c.y); g.stroke(); }
    }
  }
  g.restore();
  return { build: built - start, fill: performance.now() - built, points: (count + 1) * (strands + 1), read: (count + 1) * model.data.stems.length * 2 };
}

/** Smooth half-turns centered on known section starts; input boundaries are sorted. */
export function sectionRotation(time: number, boundaries: readonly number[], seconds: number): number {
  let angle = 0;
  for (let i = 0; i < boundaries.length; i++) {
    const at = boundaries[i];
    const radius = Math.min(16, (at - (boundaries[i - 1] ?? 0)) * 0.45,
      ((boundaries[i + 1] ?? seconds) - at) * 0.45);
    if (radius <= 0) continue;
    const t = Math.max(0, Math.min(1, (time - at + radius) / (2 * radius)));
    angle += Math.PI * t * t * (3 - 2 * t);
  }
  return angle;
}

/** Exaggerated total extent while retaining each source's proportion. */
export function ribbonBalance(weights: readonly number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  return { extent: Math.min(1, sum) ** 1.7, shares: weights.map((w) => sum > 0 ? w / sum : 0) };
}

/** Independent source sheets; the split view only changes their vertical placement/scale. */
export function paintStemSilk(g: CanvasRenderingContext2D, v: View, model: MusicalData, style: MusicalStyle, sectionStarts: readonly number[] = []) {
  const start = performance.now(), n = model.data.stems.length;
  const split = style.ribbonSplit ?? false;
  const height = split ? v.height / Math.max(1, n) : v.height;
  const count = Math.max(48, Math.ceil(v.width * style.density));
  const pearl = style.treatment === 6;
  const strands = pearl ? 24 : height < 60 ? 7 : 12;
  const boundaries = [...new Set(sectionStarts.filter((t) => Number.isFinite(t) && t >= 0 && t < model.data.seconds))].sort((a, b) => a - b).slice(1);
  const sheets = model.data.stems.map((source, s) => {
    const columns = Array.from({ length: count + 1 }, (_, i) => {
      const time = v.from + i / count * (v.to - v.from);
      const bin = Math.max(0, Math.min(model.data.peak.length - 1, time / model.data.step));
      const a = Math.floor(bin), b = Math.min(a + 1, model.data.peak.length - 1), f = bin - a;
      const weights = model.pigment.map((stem) => (stem[a] * (1 - f) + stem[b] * f) ** 0.85 / model.pigmentCeiling);
      const energy = weights[s];
      const level = Math.min(1, (energy / 0.6) ** 0.7);
      const original = ribbonBalance(weights);
      const coverage = model.data.coverage ? model.data.coverage[a] * (1 - f) + model.data.coverage[b] * f : 0;
      const participation = model.participation[a] * (1 - f) + model.participation[b] * f;
      const full = model.data.coverage ? 0.35 * coverage + 0.65 * participation : participation;
      const balanced = weights.map((w) => Math.sqrt(w));
      const balancedSum = balanced.reduce((a, b) => a + b, 0);
      const perceptual = style.ribbonFullness !== false;
      const extent = perceptual ? Math.pow(original.extent, 0.25) * Math.pow(Math.min(1, full / 0.9), 2.2) : original.extent;
      const shares = perceptual ? balanced.map((w) => balancedSum > 0 ? w / balancedSum : 0) : original.shares;
      const turn = sectionRotation(time, boundaries, model.data.seconds);
      const total = v.height * (perceptual ? 0.95 : 0.8) * extent;
      // Overlapping widths still accumulate into one legible arrangement silhouette.
      const amplitude = split ? (perceptual ? Math.sqrt(level) : level) * height * 0.36 : total * (0.08 + shares[s] * 0.52);
      const center = split ? (s + 0.5) * height : v.height / 2;
      const point = (u: number) => {
        const cross = 2 * u - 1;
        // Signed rotation exchanges the two edges: a real turnover, not abs(cos)'s kink.
        const face = Math.cos(turn);
        const bow = 0.12 * cross * (1 - cross * cross) * Math.sin(turn);
        return { x: i / count * v.width,
          y: center + amplitude * (cross * face + bow),
          z: cross * Math.sin(turn) };
      };
      return { point, energy, level };
    });
    const color = SOURCE[source.id] ?? '#c5a5ff';
    return { columns, color, channels: rgb(color), name: source.id };
  });
  const built = performance.now();
  g.save(); g.fillStyle = '#090913'; g.fillRect(0, 0, v.width, v.height);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.globalCompositeOperation = split ? 'source-over' : (['source-over', 'screen', 'lighter'] as const)[style.ribbonBlend ?? 1];
  for (let i = 0; i < count; i++) {
    const order = Array.from({ length: n }, (_, s) => s);
    if ((style.ribbonOrder ?? 1) === 1) order.sort((a, b) => sheets[a].columns[i].energy - sheets[b].columns[i].energy);
    for (const s of order) {
      const sheet = sheets[s], left = sheet.columns[i], right = sheet.columns[i + 1];
      if (Math.max(left.level, right.level) < 0.001) continue;
      g.fillStyle = sheet.color; g.strokeStyle = sheet.color;
      for (let j = 0; j < strands; j++) {
        const a = left.point(j / strands), b = right.point(j / strands);
        const c = right.point((j + 1) / strands), d = left.point((j + 1) / strands);
        const strength = 0.3 + 0.7 * (style.ribbonFullness !== false ? Math.sqrt(left.level) : left.level);
        if (pearl) {
          // A narrow moving specular ridge makes the sheet read as a surface.
          // Its location follows the ornamental fold, never changes source identity.
          const u = (j + 0.5) / strands;
          const ridge = 0.35 + 0.22 * a.z;
          const shine = Math.exp(-(((u - ridge) / 0.055) ** 2));
          const shade = 0.72 + 0.28 * Math.sin(Math.PI * u);
          g.fillStyle = `rgb(${sheet.channels.map((channel) => Math.round(channel * shade + (255 - channel * shade) * shine * 0.38)).join(',')})`;
          g.globalAlpha = strength * (0.78 + 0.15 * shine);
        } else {
          g.fillStyle = sheet.color;
          g.globalAlpha = strength * (style.treatment === 1 ? 0.42 : 0.1);
        }
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
        g.globalAlpha = strength * (pearl ? (j % 4 === 0 ? 0.22 : 0) : 0.42 + (a.z + 1) * 0.2);
        g.lineWidth = height < 60 ? 0.6 : 0.8;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        if (j === strands - 1) { g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(c.x, c.y); g.stroke(); }
      }
    }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.85;
  g.font = '10px system-ui';
  if (split && height >= 40) for (let s = 0; s < n; s++) {
    g.fillStyle = sheets[s].color; g.fillText(sheets[s].name, 8, s * height + (s === 0 ? 27 : 13));
  }
  g.restore();
  return { build: built - start, fill: performance.now() - built, points: n * (count + 1) * (strands + 1), read: n * n * (count + 1) * 2 };
}
