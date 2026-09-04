import { useCallback, useEffect, useMemo, useState } from 'react';
import { Harness, Toolbar, Group, Status } from '@openflow/widgets/debug/Harness.tsx';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { ink } from '@openflow/widgets/debug/ink.ts';
import { xOf, type View } from '@openflow/widgets/debug/axis.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import type { Mix } from '../../state.ts';
import { placeOf } from '../../warp.ts';
import { drawRuler, inksOf } from '../draw.ts';
import { measure, type Measurement } from './measure.ts';
import { DIRECTIONS, READINGS, GLYPHS, drawDirection, type DirectionOptions } from './directions.ts';
import { featuresOf } from './features.ts';
import { PocketStudies } from './PocketStudies.tsx';
import './waveforms.css';

const names = ['A · Musical topology', 'B · Stem weave', 'C · Structure map'];
const colors = ['#548ddc', '#e9a259', '#e6e9ef'];
type Section = { name: string; from: number; to: number };

export function WaveformLab({ mix }: { mix: Mix }) {
  const songs = mix.songs.filter((s) => s.stems && s.sources.length);
  return <Harness className="mf-wave-lab" title="Waveform lab" subject={<Select label="Experiment track" items={songs.map((s) => s.title)} index={Math.max(0, songs.findIndex((s) => s.id === mix.song?.id))} onChange={(i) => mix.select(songs[i].id)} width={240} />}>
    {mix.song && !mix.decoding && mix.playable ? <TrackLab key={mix.song.id} mix={mix} /> : <p className="mf-wave-note">{mix.audioProblem || (mix.decoding ? 'Decoding stems…' : 'Open a track with decoded stems to compare waveforms.')}</p>}
  </Harness>;
}
function TrackLab({ mix }: { mix: Mix }) {
  const [data, setData] = useState<Measurement | null>(null);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(8);
  const [lasagnaLayout, setLasagnaLayout] = useState(3);
  const [reading, setReading] = useState(0);
  const [mode, setMode] = useState(2);
  const axis = useAxis({ seconds: mix.seconds, narrowest: Math.max(0.1, mix.seconds / 16384 * 100) });
  const sources = mix.song!.sources;
  const audioOf = mix.audioOf;
  useEffect(() => {
    const cancel = new AbortController();
    const input = sources.flatMap((id) => {
      const buffer = audioOf(id);
      return buffer ? [{ id, channels: Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)) }] : [];
    });
    void measure(input, mix.rate, cancel.signal).then((next) => { if (!cancel.signal.aborted) setData(next); }).catch((e: unknown) => { if (!cancel.signal.aborted) setError(String(e)); });
    return () => cancel.abort();
  }, [sources, audioOf, mix.rate]);
  const sections = useMemo(() => mix.slices.map((s, i) => ({ name: s.name, from: Math.max(0, placeOf(mix.grid, s.bar) * mix.seconds), to: Math.min(mix.seconds, placeOf(mix.grid, mix.slices[i + 1]?.bar ?? mix.bars) * mix.seconds) })), [mix.slices, mix.grid, mix.seconds, mix.bars]);
  const features = useMemo(() => data && featuresOf(data), [data]);
  const creative = focus >= 4;
  const comparison = 4 + DIRECTIONS.length;
  const expressive = ['aurora', 'lasagna', 'garden', 'delta'].includes(DIRECTIONS[focus - 4]?.id ?? '');
  const direction = DIRECTIONS[focus - 4];
  const ruler = useCallback((g: CanvasRenderingContext2D, v: View) => drawRuler(g, v, mix.grid, inksOf(g.canvas)), [mix.grid]);
  return <>
    <div className="mf-wave-directions" aria-label="New waveform directions">
      {DIRECTIONS.map((d, i) => <button type="button" key={d.id} aria-pressed={focus === i + 4} onClick={() => setFocus(i + 4)}>
        <span>{d.name}</span><small>{d.intent}</small>
      </button>)}
    </div>
    <Toolbar>
      <Group caption="View"><Select label="Waveform comparison" items={['Compare originals', ...names, ...DIRECTIONS.map((d) => d.name), 'Compare structured directions']} index={focus} onChange={setFocus} width={180} /></Group>
      {direction?.id === 'lasagna' && <Group caption="Layers"><Select label="Lasagna layout" items={['Stems', 'Collapsed RGB', 'Compare both', 'Pocket studies']} index={lasagnaLayout} onChange={setLasagnaLayout} width={145} /></Group>}
      {creative && !expressive ? <Group caption="Read"><Select label="Read a visual layer" items={READINGS} index={reading} onChange={setReading} width={110} /></Group> : (focus === 0 || focus === 1) && <Group caption="Spectrum"><Select label="Spectrum colors" items={['Blue', 'RGB', '3Band']} index={mode} onChange={setMode} width={95} /></Group>}
      <Group caption="Range"><Button onPress={axis.whole}>Whole track</Button><Button label="Zoom in" onPress={() => axis.zoom(0.5, 0.5)}>+</Button><Button label="Zoom out" onPress={() => axis.zoom(2, 0.5)}>−</Button><Button label="Earlier" onPress={() => axis.pan(-(axis.window.to - axis.window.from) / 2)}>←</Button><Button label="Later" onPress={() => axis.pan((axis.window.to - axis.window.from) / 2)}>→</Button></Group>
      <Group caption="Section"><Select label="Focus section" items={['Choose a section', ...sections.map((s) => s.name)]} index={0} onChange={(i) => { if (i > 0) axis.frame(sections[i - 1]); }} width={150} /></Group>
    </Toolbar>
    <div className="mf-wave-note"><Status tone={error ? 'bad' : 'quiet'}>{error || (data ? `${data.seconds.toFixed(1)}s · ${data.stems.length} decoded stems · ${axis.window.from.toFixed(1)}–${axis.window.to.toFixed(1)}s shown · original audio, before mixer and warp` : 'Measuring real audio… you can switch tabs to cancel.')}</Status></div>
    {data && features && <>
      {creative && <div className="mf-wave-direction-intro"><b>{direction ? direction.intent : 'Different ways to feel the same music'}</b><span>{direction ? direction.description : 'The range, measurements and Read filter are shared. Compare how each design separates the information.'}</span></div>}
      {direction?.id === 'lasagna' && lasagnaLayout === 3 && <PocketStudies data={data} features={features} title={mix.song!.title} />}
      <Scope axis={axis} labels={expressive ? 0 : 132}>
        {!expressive && <ScopeRow label="Source time" height={30} draw={ruler} ruler />}
        {names.map((name, i) => (focus === 0 || focus === i + 1) && <Example key={name} name={name} kind={i} data={data} mode={mode} sections={sections} height={focus === 0 ? 170 : 300} />)}
        {direction?.id === 'lasagna' && lasagnaLayout !== 0 && <DirectionRow label={lasagnaLayout === 3 ? 'Slim · 48 px' : 'Collapsed RGB'} height={lasagnaLayout === 3 ? 48 : 190} options={{ kind: 'lasagna', data, features, sections, grid: mix.grid, automatic: mix.slicesAuto, reading, collapsed: true }} />}
        {direction?.id === 'lasagna' && lasagnaLayout === 3 && <DirectionRow label="Sliver · 24 px" height={24} options={{ kind: 'lasagna', data, features, sections, grid: mix.grid, automatic: mix.slicesAuto, reading, collapsed: true }} />}
        {creative && DIRECTIONS.map((d, i) => ((focus === comparison && !['aurora', 'lasagna', 'garden', 'delta'].includes(d.id)) || (focus === i + 4 && (d.id !== 'lasagna' || lasagnaLayout === 0 || lasagnaLayout === 2))) && <DirectionRow key={d.id} label={d.name} height={d.id === 'lasagna' && lasagnaLayout === 2 ? 300 : focus === comparison ? 300 : ['aurora', 'lasagna', 'garden', 'delta'].includes(d.id) ? 430 : 360} options={{ kind: d.id, data, features, sections, grid: mix.grid, automatic: mix.slicesAuto, reading }} />)}
        {!creative && data.stems.map((s) => <Activity key={s.id} id={s.id} values={s.rms} data={data} />)}
      </Scope>
      {direction?.id === 'lasagna' && <p className="mf-wave-note">RGB: red lows · green mids · blue highs (upper bands emphasized). Outer silhouette = mix peaks; bright center = RMS energy. Stem thickness is scaled per source; stem lighting follows the mix spectrum. Both views share the same time range.</p>}
      {expressive ? <div className="mf-wave-aurora-caption"><span>{direction?.intent}</span><p>{direction?.description} Geometry follows measured audio; ornament and motion of form are expressive. Time still runs left to right.</p></div> : creative ? <>
        <div className="mf-wave-source-key" aria-label="Source symbols">
          {data.stems.map((s) => <span key={s.id} style={{ color: focus === 5 ? `var(--stem-${s.id})` : undefined }}><b>{GLYPHS[s.id] ?? '·'}</b>{s.id}</span>)}
          <small>{mix.slicesAuto ? 'Dashed brackets · automatic sections' : 'Solid brackets · edited section set'}</small>
        </div>
        <div className="mf-wave-reading-key">
          {READINGS.slice(1).map((name, i) => <button type="button" key={name} aria-pressed={reading === i + 1} onClick={() => setReading(reading === i + 1 ? 0 : i + 1)}>{name}</button>)}
          <span>Pick a layer to quiet the others. Pick it again for the full picture.</span>
        </div>
        <div className="mf-wave-explanations">
          <p><b>Shape + level</b>The jagged boundary is peak magnitude. The smoother white curve inside the lower half is 600 ms RMS. Both keep the same scale as you zoom.</p>
          <p><b>{focus === comparison ? 'Color has one job per design' : focus === 5 ? 'Color = source' : 'Color = frequency'}</b>{focus === comparison ? 'Prism and Emblems use color for frequency; Threads uses it for sources. Each source also keeps the same symbol in all three.' : focus === 5 ? 'Each stem keeps its own hue and order. Thread positions show relative RMS shares, not separate stem amplitudes. The three neutral strips read low → mid → high from top to bottom.' : 'Blue lows, sand-colored mids, pale highs. Source identity uses fixed positions and symbols, so it never competes for frequency color.'}</p>
          <p><b>Landmarks, not certainty</b>Sections come from the app; small bottom ticks show its current grid. Source symbols mark sustained activity in separated stems, not a claim that an instrument was recognized perfectly.</p>
        </div>
      </> : <div className="mf-wave-explanations">
        <p><b>A · Frequency</b> The same peak outline in Blue, RGB or three broad bands. 3Band: blue lows, orange mids, pale highs. RGB: red lows, green mids, blue highs.</p>
        <p><b>B · Source identity</b> Stem RMS shares divide the same outline; these are relative contributions, not additive stem peaks. Colors match the activity strips below (−60 to 0 dBFS).</p>
        <p><b>C · Structure</b> Current app sections over a neutral outline, with a gold RMS contour. {mix.slicesAuto ? 'Section names and boundaries are analysis guesses.' : 'Sections include saved user edits.'}</p>
      </div>}
      {!expressive && <p className="mf-wave-note">Shift-scroll to zoom; scroll to pan. All views share one range and one fixed amplitude scale. Broad bands use first-order 250 / 2500 Hz crossovers, not Rekordbox’s algorithm. RMS measures signal level, not musical energy. Source landmarks use a fixed activity threshold; separation bleed may remain. This preview stops at its measured bin resolution.</p>}
    </>}
  </>;
}
function Example({ name, kind, data, mode, sections, height }: { name: string; kind: number; data: Measurement; mode: number; sections: Section[]; height: number }) {
  const draw = useCallback((g: CanvasRenderingContext2D, v: View) => {
    const scale = Math.max(0.001, data.peak.reduce((a, b) => Math.max(a, b), 0));
    const center = v.height * 0.55, amplitude = v.height * 0.36;
    if (kind === 2) {
      sections.forEach((s, i) => {
        const left = Math.max(0, xOf(v, s.from)), right = Math.min(v.width, xOf(v, s.to));
        if (right <= left) return;
        g.fillStyle = i % 2 ? '#ffffff0c' : '#ffffff05'; g.fillRect(left, 0, right - left, v.height);
        g.fillStyle = ink(g.canvas, '--fg', '#bbb'); g.font = '11px system-ui';
        g.save(); g.beginPath(); g.rect(left + 4, 0, Math.max(0, right - left - 8), 24); g.clip(); g.fillText(s.name, left + 6, 17); g.restore();
        g.fillStyle = '#ffffff30'; g.fillRect(left, 0, 1, v.height);
      });
    }
    const stemColors = data.stems.map((s) => ink(g.canvas, `--stem-${s.id}`, '#888'));
    for (let x = 0; x < v.width; x++) {
      const start = Math.max(0, Math.floor((v.from + x / v.width * (v.to - v.from)) / data.step));
      const end = Math.min(data.peak.length, Math.max(start + 1, Math.ceil((v.from + (x + 1) / v.width * (v.to - v.from)) / data.step)));
      if (end <= start) continue;
      let peak = 0, rms = 0;
      const bands = [0, 0, 0], stems = data.stems.map(() => 0);
      for (let n = start; n < end; n++) {
        peak = Math.max(peak, data.peak[n]); rms += data.rms[n];
        bands.forEach((_, b) => { bands[b] += data.bands[b][n]; });
        stems.forEach((_, s) => { stems[s] += data.stems[s].rms[n]; });
      }
      const h = peak / scale * amplitude;
      if (kind === 2 || (kind === 0 && mode === 0)) {
        g.fillStyle = kind === 2 ? '#849098' : colors[0]; g.fillRect(x, center - h, 1, h * 2);
      } else if (kind === 0 && mode === 1) {
        const max = Math.max(...bands, 0.000001);
        g.fillStyle = `rgb(${Math.round(bands[0] / max * 235)},${Math.round(bands[1] / max * 235)},${Math.round(bands[2] / max * 235)})`;
        g.fillRect(x, center - h, 1, h * 2);
      } else {
        const values = kind === 1 ? stems : bands, palette = kind === 1 ? stemColors : colors;
        const total = values.reduce((a, b) => a + b, 0) || 1;
        let offset = 0;
        values.forEach((value, i) => {
          const size = value / total * h; g.fillStyle = palette[i];
          g.fillRect(x, center + offset, 1, size); g.fillRect(x, center - offset - size, 1, size); offset += size;
        });
      }
      if (kind === 2) { g.fillStyle = '#ecc17d'; g.fillRect(x, center - rms / (end - start) / scale * amplitude, 1, 2); }
    }
  }, [data, kind, mode, sections]);
  return <ScopeRow label={name} height={height} draw={draw} />;
}
function Activity({ id, values, data }: { id: string; values: Float32Array; data: Measurement }) {
  const draw = useCallback((g: CanvasRenderingContext2D, v: View) => {
    g.fillStyle = ink(g.canvas, `--stem-${id}`, '#888');
    for (let x = 0; x < v.width; x++) {
      const from = Math.max(0, Math.floor((v.from + x / v.width * (v.to - v.from)) / data.step));
      const to = Math.min(values.length, Math.max(from + 1, Math.ceil((v.from + (x + 1) / v.width * (v.to - v.from)) / data.step)));
      let value = 0; for (let i = from; i < to; i++) value = Math.max(value, values[i]);
      g.globalAlpha = Math.max(0.04, Math.min(1, (20 * Math.log10(Math.max(value, 0.001)) + 60) / 60));
      g.fillRect(x, 3, 1, v.height - 6);
    }
    g.globalAlpha = 1;
  }, [data, id, values]);
  return <ScopeRow label={`${id} · RMS`} height={22} draw={draw} />;
}

function DirectionRow({ label, height, options }: { label: string; height: number; options: DirectionOptions }) {
  const { kind, data, features, sections, grid, automatic, reading, collapsed } = options;
  const draw = useCallback((g: CanvasRenderingContext2D, view: View) => drawDirection(g, view, { kind, data, features, sections, grid, automatic, reading, collapsed }), [kind, data, features, sections, grid, automatic, reading, collapsed]);
  return <ScopeRow label={label} height={height} draw={draw} ruler={['aurora', 'lasagna', 'garden', 'delta'].includes(kind)} />;
}
