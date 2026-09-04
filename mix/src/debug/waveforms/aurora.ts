import type { View } from '@openflow/widgets/debug/axis.ts';
import { xOf } from '@openflow/widgets/debug/axis.ts';
import type { DirectionOptions } from './directions.ts';
import type { Measurement } from './measure.ts';
import { smooth } from './features.ts';

// A silk print of the music. X is still source time; thickness is softened stem RMS.
// The wandering center, rainbow dyes and glow are expressive, not additional analysis.
const cache = new WeakMap<Measurement, { stems: Float32Array[]; ceiling: number }>();
const HUES: Record<string, number> = { drums: 18, bass: 222, other: 155, vocals: 300, guitar: 90, piano: 270 };
export function drawAurora(g: CanvasRenderingContext2D, v: View, o: DirectionOptions) {
  const { data } = o;
  let held = cache.get(data);
  if (!held) {
    const stems = data.stems.map((s) => smooth(s.rms, data.step, 2.4));
    let ceiling = 0.001;
    for (let n = 0; n < data.peak.length; n++) ceiling = Math.max(ceiling, stems.reduce((sum, s) => sum + Math.pow(s[n], 0.65), 0));
    held = { stems, ceiling };
    cache.set(data, held);
  }
  const step = 2;
  const count = Math.ceil(v.width / step) + 1;
  const edges = Array.from({ length: data.stems.length + 1 }, () => new Float32Array(count));
  const strengths = data.stems.map(() => new Float32Array(count));
  const range = v.to - v.from;
  const height = v.height * 0.53;
  for (let p = 0; p < count; p++) {
    const time = v.from + p * step / v.width * range;
    const n = Math.min(data.peak.length - 1, Math.max(0, Math.floor(time / data.step)));
    const amounts = held.stems.map((s) => Math.pow(s[n], 0.65));
    const sum = amounts.reduce((a, b) => a + b, 0);
    const drift = Math.sin(time / data.seconds * Math.PI * 4 - 0.8) * v.height * 0.085;
    const tilt = ((amounts[0] ?? 0) - (amounts.at(-1) ?? 0)) / held.ceiling * v.height * 0.07;
    const center = v.height * 0.51 + drift + tilt;
    const total = sum / held.ceiling * height;
    edges[0][p] = center - total / 2;
    amounts.forEach((value, s) => {
      strengths[s][p] = value;
      edges[s + 1][p] = edges[s][p] + value / held!.ceiling * height;
    });
  }

  const ground = g.createLinearGradient(0, 0, v.width, v.height);
  ground.addColorStop(0, '#110c21'); ground.addColorStop(0.5, '#080e1b'); ground.addColorStop(1, '#170c1b');
  g.fillStyle = ground; g.fillRect(0, 0, v.width, v.height);

  const hueAt = (base: number, share: number) => base + Math.sin(share * Math.PI * 2) * 42 + share * 85;
  const dye = (base: number, light: number, alpha: number) => {
    const gradient = g.createLinearGradient(0, 0, v.width, 0);
    for (let stop = 0; stop <= 12; stop++) {
      const share = (v.from + stop / 12 * range) / data.seconds;
      gradient.addColorStop(stop / 12, `hsla(${hueAt(base, share)},92%,${light}%,${alpha})`);
    }
    return gradient;
  };
  const path = (s: number, fraction: number) => {
    g.beginPath();
    for (let p = 0; p < count; p++) {
      const y = edges[s][p] * (1 - fraction) + edges[s + 1][p] * fraction;
      if (!p) g.moveTo(0, y); else g.lineTo(p * step, y);
    }
  };

  // Each source is one continuous sheet of color; dark rests open real holes in it.
  data.stems.forEach((stem, s) => {
    const hue = HUES[stem.id] ?? s * 70;
    g.beginPath();
    for (let p = 0; p < count; p++) {
      if (!p) g.moveTo(0, edges[s][p]); else g.lineTo(p * step, edges[s][p]);
    }
    for (let p = count - 1; p >= 0; p--) g.lineTo(p * step, edges[s + 1][p]);
    g.closePath();
    g.fillStyle = dye(hue, 48, 0.82); g.fill();
    // Parallel folds follow the actual changing source contribution, like grain in silk.
    for (let fold = 1; fold < 13; fold++) {
      path(s, fold / 13);
      g.strokeStyle = dye(hue + fold * 2.5, 65, fold % 3 === 0 ? 0.48 : 0.17);
      g.lineWidth = fold % 3 === 0 ? 1.1 : 0.7; g.stroke();
    }
    path(s, 0.18);
    g.strokeStyle = dye(hue + 22, 80, 0.8); g.lineWidth = 1.5;
    g.shadowBlur = 13; g.shadowColor = `hsl(${hue},100%,65%)`; g.stroke(); g.shadowBlur = 0;
  });

  // A few high-frequency highlights shimmer on the upper edge. Positions stay tied to time.
  g.globalCompositeOperation = 'screen';
  for (let p = 3; p < count - 3; p += 4) {
    const time = v.from + p * step / v.width * range;
    const n = Math.min(data.peak.length - 1, Math.max(0, Math.floor(time / data.step)));
    const high = Math.min(1, data.bands[2][n] * 14);
    if (high < 0.14) continue;
    const radius = 0.6 + high * 1.5;
    g.fillStyle = `rgba(207,244,255,${high * 0.65})`;
    g.beginPath(); g.arc(p * step, edges[0][p] - 3, radius, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  // Whisper the sections above the river; no fences through the color.
  g.font = '11px system-ui';
  for (const section of o.sections) {
    const left = Math.max(0, xOf(v, section.from)), right = Math.min(v.width, xOf(v, section.to));
    if (right - left < 42) continue;
    g.fillStyle = '#dfd5eb99';
    g.save(); g.beginPath(); g.rect(left + 6, 0, right - left - 12, 44); g.clip();
    g.fillText(section.name.toLowerCase(), left + 10, 29); g.restore();
    g.fillStyle = '#cda5eb55'; g.beginPath(); g.arc(left + 3, 26, 1.5, 0, Math.PI * 2); g.fill();
  }

  // Name each ribbon once, where it has room. Labels identify sources even as dyes change.
  data.stems.forEach((stem, s) => {
    let at = 0;
    for (let p = 24; p < count - 60; p++) if (strengths[s][p] > strengths[s][at]) at = p;
    if (edges[s + 1][at] - edges[s][at] < 14 || at === 0) return;
    const y = (edges[s][at] + edges[s + 1][at]) / 2;
    g.font = '11px system-ui'; g.fillStyle = '#fff0f5dc';
    g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText(stem.id, at * step + 5, y + 3); g.shadowBlur = 0;
  });
  g.font = '10px system-ui'; g.fillStyle = '#bdabc174';
  for (let i = 0; i <= 4; i++) {
    const time = v.from + i / 4 * range;
    const label = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    g.textAlign = i === 4 ? 'right' : 'left'; g.fillText(label, i / 4 * v.width, v.height - 16);
  }
  g.textAlign = 'left';
}
