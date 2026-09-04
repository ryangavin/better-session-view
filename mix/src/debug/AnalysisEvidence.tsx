import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import type { Axis } from '@openflow/widgets/debug/useAxis.ts';
import { xOf, type View } from '@openflow/widgets/debug/axis.ts';
import type { Mix } from '../state.ts';
import type { Beats } from '../warp.ts';
import type { Heard } from '../transients.ts';
import { BEATS_PER_BAR } from '../warp.ts';
import type { Truth } from '../../harness/types.ts';
import { readReference, scoreReference } from './truthReference.ts';
import { gridEvidence } from './gridEvidence.ts';
import { measure, type Measurement } from './waveforms/measure.ts';
import { featuresOf } from './waveforms/features.ts';
import { drawCollapsedLasagna } from './waveforms/excursions.ts';

const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const ms = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)} ms`;

/** Read-only diagnostics. Saved comparison grids live only for this mounted track. */
export function AnalysisEvidence({ mix, beats, heard, axis, head, runLabel }: {
  mix: Mix; beats: Beats | null; heard: Heard | null; axis: Axis; head?: number; runLabel: string;
}) {
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [problem, setProblem] = useState('');
  const [tolerance, setTolerance] = useState(1);
  const [baseline, setBaseline] = useState<{ label: string; beats: Beats } | null>(null);
  const [reference, setReference] = useState<Truth | null>(null);
  const [referenceError, setReferenceError] = useState('');
  const toleranceMs = [20, 40, 80][tolerance];
  const sources = mix.song!.sources, audioOf = mix.audioOf;
  useEffect(() => {
    setMeasurement(null); setProblem('');
    if (mix.decoding || !mix.playable) return;
    const controller = new AbortController();
    const inputs = sources.flatMap((id) => {
      const buffer = audioOf(id);
      return buffer ? [{ id, channels: Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)) }] : [];
    });
    void measure(inputs, mix.rate, controller.signal).then((result) => {
      if (!controller.signal.aborted) setMeasurement(result);
    }).catch((e: unknown) => { if (!controller.signal.aborted) setProblem(String(e)); });
    return () => controller.abort();
  }, [sources, audioOf, mix.decoding, mix.playable, mix.rate]);
  const features = useMemo(() => measurement && featuresOf(measurement), [measurement]);
  const seconds = measurement?.seconds ?? mix.seconds;
  const candidate = useMemo(() => beats && heard ? gridEvidence(beats, heard, seconds, toleranceMs) : null, [beats, heard, seconds, toleranceMs]);
  const kept = useMemo(() => heard ? gridEvidence(mix.grid, heard, seconds, toleranceMs) : null, [mix.grid, heard, seconds, toleranceMs]);
  const saved = useMemo(() => baseline && heard ? gridEvidence(baseline.beats, heard, seconds, toleranceMs) : null, [baseline, heard, seconds, toleranceMs]);
  const truthScores = useMemo(() => reference && heard ? [beats, mix.grid, baseline?.beats].map((grid) => grid ? scoreReference(grid, heard, reference) : null) : [], [reference, heard, beats, mix.grid, baseline]);
  const weak = useMemo(() => candidate ? [...candidate.windows].sort((a, b) => a.support - b.support || a.from - b.from).slice(0, 6) : [], [candidate]);
  const drawMix = useCallback((g: CanvasRenderingContext2D, view: View) => {
    if (measurement && features) drawCollapsedLasagna(g, view, { data: measurement, features, sections: [] });
    if (!beats) return;
    g.strokeStyle = '#ffffff75';
    for (let i = 0; i < beats.samples.length; i++) {
      if ((beats.first + i) % BEATS_PER_BAR !== 0) continue;
      const x = xOf(view, beats.samples[i] / beats.rate);
      if (x < 0 || x > view.width) continue;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 8); g.stroke();
    }
  }, [measurement, features, beats]);
  const drawResiduals = useCallback((g: CanvasRenderingContext2D, view: View) => {
    const limit = 100;
    const center = view.height / 2;
    g.strokeStyle = '#ffffff35'; g.beginPath(); g.moveTo(0, center); g.lineTo(view.width, center); g.stroke();
    g.fillStyle = '#65debb14';
    g.fillRect(0, center - toleranceMs / limit * (center - 3), view.width, toleranceMs / limit * (center - 3) * 2);
    for (const b of candidate?.beats ?? []) {
      const x = xOf(view, b.at); if (x < 0 || x > view.width) continue;
      const y = b.residualMs === null ? view.height - 2 : center - Math.max(-limit, Math.min(limit, b.residualMs)) / limit * (center - 3);
      g.fillStyle = b.supported ? '#62dfb8' : '#ff9877';
      g.fillRect(x - 1, y - 1, 2, 2);
    }
  }, [candidate, toleranceMs]);
  const drawEnergy = useCallback((g: CanvasRenderingContext2D, view: View) => {
    if (!measurement) return;
    const colors: Record<string, string> = { drums: '#ffba55', bass: '#877fff', other: '#56d9c8', vocals: '#ff75b0', guitar: '#a2e55e', piano: '#c193fc' };
    const lane = view.height / measurement.stems.length;
    measurement.stems.forEach((stem, s) => {
      for (let x = 0; x < view.width; x++) {
        const start = Math.max(0, Math.floor((view.from + x / view.width * (view.to - view.from)) / measurement.step));
        const end = Math.min(stem.rms.length, Math.max(start + 1, Math.ceil((view.from + (x + 1) / view.width * (view.to - view.from)) / measurement.step)));
        let energy = 0;
        for (let i = start; i < end; i++) energy += stem.rms[i] ** 2;
        const rms = end > start ? Math.sqrt(energy / (end - start)) : 0;
        g.globalAlpha = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(1e-9, rms)) + 60) / 60));
        g.fillStyle = colors[stem.id] ?? '#b9b9cf'; g.fillRect(x, s * lane, 1, lane - 2);
      }
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = '10px system-ui'; g.fillText(stem.id, 4, s * lane + 11);
    });
  }, [measurement]);
  const exportReport = () => {
    const report = { version: 1, generatedAt: new Date().toISOString(), track: { id: mix.song!.id, title: mix.song!.title, seconds, rate: mix.rate },
      run: runLabel, toleranceMs, evidence: 'Nearest low/mid detected onset per stored beat; not annotated accuracy. Saved grid rescored against current detections.',
      audio: measurement ? { step: measurement.step, bins: measurement.peak.length, sources: measurement.stems.map((s) => s.id), crossoverHz: [250, 2500] } : null,
      candidate: { grid: beats, metrics: candidate }, kept: { grid: mix.grid, metrics: kept }, saved: { ...baseline, metrics: saved }, heard, reference, truthScores };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `beat-evidence-${mix.song!.id}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="mf-analysis-evidence" aria-label="Grid evidence workbench">
    <header><div><b>Grid evidence workbench</b><p>Read the music, inspect timing, compare a revision. All scores below cover the whole track.</p></div>
      <Select label="Onset agreement tolerance" items={['±20 ms', '±40 ms', '±80 ms']} index={tolerance} onChange={setTolerance} width={95} />
      <Button disabled={!beats} onPress={() => beats && setBaseline({ label: runLabel, beats: { ...beats, samples: [...beats.samples] } })}>Save comparison</Button>
      <Button disabled={!baseline} onPress={() => setBaseline(null)}>Clear comparison</Button>
      <Button disabled={!candidate} onPress={exportReport}>Download evidence</Button>
    </header>
    <p className="mf-analysis-evidence-note">Detector agreement is not beat accuracy. Syncopation, missing drums and half/double tempo can fool these metrics. Saved grids are rescored against this run’s detections; independent annotated truth is still needed.</p>
    <table><thead><tr><th>Grid</th><th>Onset support</th><th>Median / p95 distance</th><th>Outside stored span</th><th>Invalid entries / gaps</th></tr></thead>
      <tbody>{[['Candidate', candidate], ['App kept', kept], ['Saved comparison', saved]].map(([label, value]) => {
        const e = value as typeof candidate;
        return <tr key={label as string}><th>{label as string}</th><td>{percent(e?.support ?? null)} {e ? `(${e.supported}/${e.beats.length})` : ''}</td><td>{ms(e?.medianMs ?? null)} / {ms(e?.p95Ms ?? null)}</td><td>{e ? `${e.leadSeconds.toFixed(2)}s before · ${e.tailSeconds.toFixed(2)}s after` : '—'}</td><td>{e?.invalidIntervals ?? '—'}</td></tr>;
      })}</tbody></table>
    {baseline && <p className="mf-analysis-evidence-note">Saved: {baseline.label}. Held for this track while the tab stays open.</p>}
    <details className="mf-analysis-reference"><summary>Reference accuracy · {reference ? `${reference.source} reference loaded` : 'load annotated beats'}</summary>
      <p>Load a truth JSON from the existing harness. Track ID and region are validated. Manual annotations and known-tempo references are labeled separately; a known tempo is not a human beat annotation.</p>
      <input type="file" accept=".json,application/json" aria-label="Load beat reference JSON" onChange={async (event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (!file) return;
        try {
          if (file.size > 5_000_000) throw new Error('Reference file must be smaller than 5 MB.');
          const got = readReference(await file.text(), mix.song!.id, seconds);
          setReference(got); setReferenceError('');
        } catch (e) { setReferenceError(String(e)); }
      }} />
      <Button disabled={!reference} onPress={() => { setReference(null); setReferenceError(''); }}>Clear reference</Button>
      {referenceError && <p role="alert">{referenceError}</p>}
      {reference && <><p>{reference.source} · {reference.region.from.toFixed(2)}–{reference.region.to.toFixed(2)}s · {reference.beats.samples.length} reference beats. Existing scorer: 70 ms matching, 10 ms tight timing. Onset tolerance above does not change this scoring.</p>
        <table><thead><tr><th>Grid</th><th>F1 / continuity</th><th>Missed / spurious</th><th>Mean offset</th><th>Tempo / phase</th></tr></thead><tbody>{truthScores.map((s, i) => <tr key={i}><th>{['Candidate', 'App kept', 'Saved comparison'][i]}</th><td>{s ? `${percent(s.fMeasure)} / ${percent(s.continuity)}` : '—'}</td><td>{s ? `${s.counts.missed} / ${s.counts.spurious}` : '—'}</td><td>{s ? ms(s.offsetMs.mean) : '—'}</td><td>{s ? `${s.octave ?? 'no octave flag'} · ${s.phase} beat phase${s.offBeat ? ' · offbeat' : ''}` : '—'}</td></tr>)}</tbody></table>
        <Button onPress={() => axis.frame(reference.region)}>Frame reference region</Button></>}
    </details>
    <div className="mf-analysis-review"><b>Inspect weakest 10-second stretches</b>{weak.map((w) => <Button key={w.from} onPress={() => axis.frame(w)}>{w.from.toFixed(0)}–{w.to.toFixed(0)}s · {w.count ? percent(w.support) : 'no stored beats'}</Button>)}</div>
    <p className="mf-analysis-evidence-note">{problem || (measurement ? `RGB: mix peak + RMS, ${ (measurement.step * 1000).toFixed(1)} ms bins. White ticks: candidate downbeats. Stem rows: fixed −60 to 0 dBFS light scale. These envelopes explain context; exact timing comes from the existing detector.` : 'Measuring decoded audio context…')}</p>
    <Scope axis={axis} head={head}>
      <ScopeRow label="Mix RGB" height={56} draw={drawMix} ruler />
      <ScopeRow label="Stem RMS" height={Math.max(48, (measurement?.stems.length ?? 4) * 16)} draw={drawEnergy} />
      <ScopeRow label="Hit offset" height={70} draw={drawResiduals} />
    </Scope>
    <p className="mf-analysis-evidence-note">Hit offset: onset minus beat; above zero = hit later than grid, below = earlier. Green is within tolerance. Values beyond ±100 ms are clipped at the edge; no onset is marked at the bottom. Table distances remain unclipped. No stored beats is a coverage question, not an automatic musical error.</p>
  </section>;
}
