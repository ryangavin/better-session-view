import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { measureCoverage } from './ribbonFullness.ts';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { Group, Toolbar } from '@openflow/widgets/debug/Harness.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { View } from '@openflow/widgets/debug/axis.ts';
import type { Mix } from '../../state.ts';
import { placeOf } from '../../warp.ts';
import { measure, type Measurement } from '../waveforms/measure.ts';
import { featuresOf } from '../waveforms/features.ts';
import { GEOMETRIES, PALETTES, TREATMENTS, PRESETS, musicalData, paintMusical, type MusicalData, type MusicalStyle } from './musicalVector.ts';

export function DesignBrowser({ mix }: { mix: Mix }) {
  const [data, setData] = useState<Measurement | null>(null);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState(0);
  const [style, setStyle] = useState<MusicalStyle>({ ...PRESETS[0], density: 0.5, smoothing: 0.5 });
  const [compare, setCompare] = useState(false);
  const [height, setHeight] = useState(4);
  const [controls, setControls] = useState(false);
  const [evidence, setEvidence] = useState(true);
  const [notes, setNotes] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(460);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.max(240, Math.floor(entry.contentRect.height))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [marks, setMarks] = useState(true);
  const [activity, setActivity] = useState(false);
  const axis = useAxis({ seconds: mix.seconds, narrowest: Math.max(0.1, mix.seconds / 16384 * 100) });
  const sources = mix.song!.sources, audioOf = mix.audioOf;
  useEffect(() => {
    setData(null); setError('');
    if (mix.decoding || !mix.playable) return;
    const cancel = new AbortController();
    const input = sources.flatMap((id) => {
      const b = audioOf(id);
      return b ? [{ id, channels: Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)) }] : [];
    });
    void measure(input, mix.rate, cancel.signal).then(async (d) => { d.coverage = await measureCoverage(input, mix.rate, d, cancel.signal); if (!cancel.signal.aborted) setData(d); }).catch((e: unknown) => { if (!cancel.signal.aborted) setError(String(e)); });
    return () => cancel.abort();
  }, [sources, audioOf, mix.decoding, mix.playable, mix.rate]);
  const model = useMemo(() => data && musicalData(data), [data]);
  const features = useMemo(() => data && featuresOf(data), [data]);
  const sections = useMemo(() => mix.slices.map((s) => ({ name: s.name, at: placeOf(mix.grid, s.bar) * mix.seconds })), [mix.slices, mix.grid, mix.seconds]);
  const choose = (i: number) => { setPreset(i); setStyle({ ...style, ...PRESETS[i] }); };
  const change = (key: 'geometry' | 'palette' | 'treatment', value: number) => { setPreset(-1); setStyle({ ...style, ...(key === 'geometry' && value !== 4 && style.treatment === 6 ? { treatment: 1 } : {}), [key]: value }); };
  const evidenceHeight = evidence && style.geometry === 4 && !compare ? 78 : 0;
  const rowHeight = height === 4 ? (compare ? 160 : Math.max(200, available - evidenceHeight - 2)) : [24, 48, 160, 320][height];
  return <div className="mf-design-browser" data-controls={controls}>
    <Toolbar className="mf-design-primary">
      <Group caption="Preset"><Select label="Vector preset" items={['Custom', ...PRESETS.map((p) => p.name)]} index={preset + 1} onChange={(i) => i === 0 ? setPreset(-1) : choose(i - 1)} width={160} /></Group>
      <Group caption="Paint"><Select label="Vector treatment" items={style.geometry === 4 ? ['Filaments', 'Solid silk', 'Pearlescent'] : style.geometry === 3 ? ['Filaments', 'Solid silk'] : [...TREATMENTS]} index={style.geometry >= 3 ? (style.treatment === 6 ? 2 : style.treatment === 1 ? 1 : 0) : style.treatment} onChange={(i) => change('treatment', style.geometry >= 3 ? [4, 1, 6][i] : i)} width={130} /></Group>
      {style.geometry === 4 && <Group caption="Ribbons"><Select label="Ribbon layout" items={['Overlaid', 'Separated']} index={style.ribbonSplit ? 1 : 0} onChange={(i) => setStyle({ ...style, ribbonSplit: i === 1 })} width={105} /></Group>}
      <Group caption="Range"><Button onPress={axis.whole}>Whole track</Button><Button label="Zoom vector in" onPress={() => axis.zoom(0.5, 0.5)}>+</Button><Button label="Zoom vector out" onPress={() => axis.zoom(2, 0.5)}>−</Button></Group>
      <Group caption="View"><Toggle width={65} on={controls} onChange={setControls}>Controls</Toggle><Toggle width={65} on={evidence} onChange={setEvidence}>Evidence</Toggle><Toggle width={48} on={notes} onChange={setNotes}>Notes</Toggle></Group>
    </Toolbar>
    {controls && <Toolbar className="mf-design-controls">
      <Group caption="Geometry"><Select label="Vector geometry" items={[...GEOMETRIES]} index={style.geometry} onChange={(i) => change('geometry', i)} width={130} /></Group>
      {style.geometry !== 4 && <Group caption="Color"><Select label="Vector palette" items={[...PALETTES]} index={style.palette} onChange={(i) => change('palette', i)} width={120} /></Group>}
      <Group caption="Detail"><Select label="Vector density" items={['0.25/px', '0.5/px', '1/px', '2/px']} index={[0.25, 0.5, 1, 2].indexOf(style.density)} onChange={(i) => setStyle({ ...style, density: [0.25, 0.5, 1, 2][i] })} width={85} />{style.geometry < 3 && <Select label="Vector curve" items={['Straight', 'Gentle', 'Smooth']} index={[0, 0.5, 1].indexOf(style.smoothing)} onChange={(i) => setStyle({ ...style, smoothing: [0, 0.5, 1][i] })} width={90} />}</Group>
      {style.geometry === 4 && <>
        <Group caption="Shape"><Select label="Ribbon sizing" items={['Arrangement fullness', 'Loudness']} index={style.ribbonFullness === false ? 1 : 0} onChange={(i) => setStyle({ ...style, ribbonFullness: i === 0 })} width={155} /></Group>
        {!style.ribbonSplit && <>
          <Group caption="Blend"><Select label="Ribbon blend" items={['Normal', 'Screen', 'Additive']} index={style.ribbonBlend ?? 1} onChange={(i) => setStyle({ ...style, ribbonBlend: i })} width={100} /></Group>
          <Group caption="Order"><Select label="Ribbon order" items={['Source order', 'Energy forward']} index={style.ribbonOrder ?? 1} onChange={(i) => setStyle({ ...style, ribbonOrder: i })} width={125} /></Group>
        </>}
      </>}
      <Group caption="Size"><Select label="Vector height" items={['24 px', '48 px', '160 px', '320 px', 'Fill view']} index={height} onChange={setHeight} width={85} /></Group>
      <Group caption="Layers"><Toggle width={75} on={marks} onChange={setMarks}>Sections</Toggle><Toggle width={120} on={activity} onChange={setActivity}>Source entrances</Toggle><Toggle width={120} on={compare} onChange={setCompare}>Compare presets</Toggle></Group>
    </Toolbar>}
    <div className="mf-design-status" role="status">{error || (!model ? 'Measuring decoded audio…' : `${preset < 0 ? 'Custom' : PRESETS[preset].name} · ${data!.seconds.toFixed(1)}s · ${data!.stems.length} stems`)}<span>Scroll to pan · Shift-scroll to zoom</span></div>
    <div ref={stage} className="mf-design-stage" data-fill={height === 4 && !compare}>
    {model && <Scope axis={axis} labels={compare ? 110 : 0}>
      {(compare ? PRESETS : [{ ...style, name: preset < 0 ? 'Custom' : PRESETS[preset].name }]).map((p) => <MusicalRow key={p.name} label={p.name} model={model} style={{ ...style, ...p }} height={rowHeight} sectionStarts={sections} sections={marks ? sections : []} entrances={activity ? features!.sources.flatMap((s) => s.spans.map((span) => ({ at: span.from, id: s.id }))) : []} />)}
      {evidenceHeight > 0 && <SectionEvidence model={model} sections={sections} />}
    </Scope>}
    </div>
    {notes && <div className="mf-design-notes">
    {data && <p className="mf-render-note">Analysis resolution: {(data.step * 1000).toFixed(1)} ms per bin. Measurements use decoded source audio before mixer processing and warp.</p>}
    {style.geometry === 4 && <p className="mf-render-note">Stem ribbons · gold drums, violet bass, mint other, pink vocals. Each source keeps its own ribbon; measured energy drives breadth and opacity. Separate them to read each part. Screen and Additive brighten overlaps; Energy forward orders louder sources in front under Normal blending. Half-turns mark section boundaries; Arrangement fullness combines spectral coverage and source participation; Loudness retains the earlier sizing. These are section markers, not audio phase.</p>}
    {style.geometry === 3 && <p className="mf-render-note">Silk · a folded sheet of source-colored filaments. Stem energy sets its breadth and color proportions; rotation and lighting give expressive depth, not audio phase.</p>}
    {style.geometry < 3 && style.treatment === 5 && <p className="mf-render-note">Melt · gold drums, violet bass, pink vocals, mint other, green guitar, lilac piano. Color follows each stem’s smoothed level on a shared scale. Gradients connect the source colors inside a crisp silhouette.</p>}
    </div>}
    {model && evidence && style.geometry === 4 && <details className="mf-render-note mf-design-evidence"><summary>Section measurements · full table</summary>
      <table><thead><tr><th>Section</th><th>Mix RMS</th><th>Spectral coverage</th><th>Stem participation</th></tr></thead><tbody>
        {sections.map((section, i) => {
          const first = Math.max(0, Math.floor(section.at / model.data.step));
          const last = Math.min(model.data.rms.length, Math.ceil((sections[i + 1]?.at ?? model.data.seconds) / model.data.step));
          const average = (values: Float32Array | undefined) => {
            if (!values || last <= first) return 0;
            let sum = 0; for (let bin = first; bin < last; bin++) sum += values[bin];
            return sum / (last - first);
          };
          let power = 0; for (let bin = first; bin < last; bin++) power += model.data.rms[bin] ** 2;
          const rms = Math.sqrt(power / Math.max(1, last - first));
          return <tr key={i}><td>{section.name}</td><td>{rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : '−∞'} dBFS</td><td>{(100 * average(model.data.coverage)).toFixed(0)}%</td><td>{(100 * average(model.participation)).toFixed(0)}%</td></tr>;
        })}
      </tbody></table>
    </details>}
    {notes && <div className="mf-design-notes"><p className="mf-render-note">RGB = mix lows/red, mids/green, highs/blue with fixed upper-band emphasis. Source colors name the layers; rainbow is ornament. Mix geometry uses peak and RMS on one track scale. Stem/flow geometry normally uses smoothed level scaled per source; Melt uses a shared reference to retain relative levels. Inner contours are decorative. Source entrances are activity heuristics, not detected notes. Section labels hide at compact heights. Compare presets fixes each preset’s geometry/color/paint; detail, size and layers apply to all.</p>
    <p className="mf-render-note">These are vector adaptations of the experiments, not identical reproductions of every artwork. The garden’s botanical drawing remains in Waveform lab. This browser uses measured summaries and stops zooming before sample detail; the Performance bench retains raw-sample zoom and the existing drawing comparison.</p>
    </div>}
  </div>;
}

function MusicalRow({ model, style, label, height, sections, sectionStarts, entrances }: { model: MusicalData; style: MusicalStyle; label: string; height: number; sectionStarts: { at: number }[]; sections: { name: string; at: number }[]; entrances: { id: string; at: number }[] }) {
  const latest = useRef({ build: 0, fill: 0, points: 0, read: 0 });
  const [stats, setStats] = useState(latest.current);
  useEffect(() => { const timer = setInterval(() => setStats({ ...latest.current }), 500); return () => clearInterval(timer); }, []);
  const draw = useCallback((g: CanvasRenderingContext2D, v: View) => {
    latest.current = paintMusical(g, v, model, style, sectionStarts.map((s) => s.at));
    const xOf = (at: number) => (at - v.from) / (v.to - v.from) * v.width;
    g.save(); g.font = '10px system-ui';
    for (const section of sections) {
      const x = xOf(section.at); if (x < 0 || x > v.width) continue;
      if (style.treatment !== 5 && style.geometry < 3) { g.strokeStyle = '#ffffff25'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, v.height); g.stroke(); }
      if (v.height >= 100) { g.fillStyle = '#d8cce7'; g.fillText(section.name.toLowerCase(), x + 5, 14); }
    }
    for (const e of entrances) { const x = xOf(e.at); if (x < 0 || x > v.width) continue; g.fillStyle = '#fff9'; g.fillText(e.id[0].toUpperCase(), x, v.height - 4); }
    g.restore();
  }, [model, style, sections, sectionStarts, entrances]);
  return <ScopeRow label={label} height={height} draw={draw} ruler legend={<span>{stats.points} vertices per paired edges · geometry {stats.build.toFixed(2)} ms · paint {stats.fill.toFixed(2)} ms · {stats.read} geometry reads (excludes color/overlays)</span>} />;
}

/** Evidence shares the waveform's axis, so section comparisons survive pan and zoom. */
function SectionEvidence({ model, sections }: { model: MusicalData; sections: { name: string; at: number }[] }) {
  const readings = useMemo(() => sections.map((section, i) => {
    const to = sections[i + 1]?.at ?? model.data.seconds;
    const first = Math.max(0, Math.floor(section.at / model.data.step));
    const last = Math.min(model.data.rms.length, Math.ceil(to / model.data.step));
    const mean = (values: Float32Array | undefined) => {
      if (!values || last <= first) return 0;
      let sum = 0; for (let j = first; j < last; j++) sum += values[j];
      return sum / (last - first);
    };
    return { ...section, to, coverage: mean(model.data.coverage), participation: mean(model.participation) };
  }), [model, sections]);
  const draw = useCallback((g: CanvasRenderingContext2D, v: View) => {
    g.fillStyle = '#0d0e16'; g.fillRect(0, 0, v.width, v.height);
    g.font = '10px system-ui';
    const xOf = (at: number) => (at - v.from) / (v.to - v.from) * v.width;
    for (const section of readings) {
      const left = Math.max(0, xOf(section.at)), right = Math.min(v.width, xOf(section.to));
      if (right <= left) continue;
      g.strokeStyle = '#ffffff12'; g.beginPath(); g.moveTo(left, 0); g.lineTo(left, v.height); g.stroke();
      const width = Math.max(0, right - left - 20);
      if (width < 8) continue;
      for (const [row, value, label, color] of [[0, section.coverage, 'Spectrum', '#8ea8f4'], [1, section.participation, 'Stems', '#66c5ae']] as const) {
        const y = row * 32 + 18;
        if (width >= 70) {
          g.fillStyle = '#9c9bad'; g.fillText(`${label} ${Math.round(value * 100)}%`, left + 10, y);
        }
        g.fillStyle = '#ffffff0b'; g.fillRect(left + 10, y + 7, width, 3);
        g.fillStyle = color; g.fillRect(left + 10, y + 7, width * value, 3);
      }
    }
  }, [readings]);
  return <ScopeRow label="Section evidence" height={78} draw={draw} legend={<span>Spectrum = spectral coverage · Stems = sustained participation · experimental proxies</span>} />;
}
