import { useEffect, useMemo, useRef, useState } from 'react';
import { Harness } from '@openflow/widgets/debug/Harness.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import type { Mix } from '../../state.ts';
import { wavOf } from '../../audio.ts';
import { tempoOf } from '../../warp.ts';
import { alignmentOf, type Alignment, type Policy } from './model.ts';
import './alignment.css';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AlignmentLab({ mix }: { mix: Mix }) {
  const songs = mix.songs.filter((s) => s.stems && s.sources.length);
  return <Harness title="Musical alignment" subject={<Select label="Alignment track" items={songs.map((s) => s.title)}
    index={Math.max(0, songs.findIndex((s) => s.id === mix.song?.id))} onChange={(i) => mix.select(songs[i].id)} width={240} />}>
    {mix.song && !mix.decoding && mix.playable ? <Lab key={mix.song.id} mix={mix} /> : <p>Open a separated track and wait for decoding.</p>}
  </Harness>;
}

function Lab({ mix }: { mix: Mix }) {
  const song = mix.song!;
  const [kind, setKind] = useState<Policy['kind']>('recurring');
  const [interval, setInterval] = useState(4);
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(9);
  const [bpm, setBpm] = useState(() => Math.round(tempoOf(mix.grid) * 100) / 100);
  const [name, setName] = useState('Verse');
  const [bars, setBars] = useState(8);
  const [solo, setSolo] = useState('all');
  const [click, setClick] = useState(false);
  const [loop, setLoop] = useState(true);
  const [repeats, setRepeats] = useState(0);
  const lastPlayback = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ channels: Float32Array[]; original: Float32Array[]; counts: number[]; map: Alignment; ms: number } | null>(null);
  const worker = useRef<Worker | null>(null);
  const originalPlayer = useRef<HTMLAudioElement>(null), fittedPlayer = useRef<HTMLAudioElement>(null);
  useEffect(() => () => { originalPlayer.current?.pause(); fittedPlayer.current?.pause(); }, []);
  const plan = useMemo(() => {
    try {
      return { map: alignmentOf(mix.grid, { startBar: start - 1, endBar: end - 1, bpm,
        policy: kind === 'original' ? { kind } : kind === 'recurring' ? { kind, bars: interval } : { kind, name, bars } }), error: '' };
    } catch (e) { return { map: null, error: String(e instanceof Error ? e.message : e) }; }
  }, [mix.grid, start, end, bpm, kind, interval, name, bars]);
  useEffect(() => {
    worker.current?.terminate(); worker.current = null;
    setBusy(false); setResult(null); setError('');
    return () => { worker.current?.terminate(); worker.current = null; };
  }, [plan]);

  function render() {
    const map = plan.map;
    if (!map) return;
    mix.stop(); originalPlayer.current?.pause(); fittedPlayer.current?.pause();
    setError(''); setBusy(true); setResult(null);
    try {
      const buffers = song.sources.map((s) => mix.audioOf(s));
      if (buffers.some((b) => !b || b.sampleRate !== map.rate || b.length !== mix.grid.length))
        throw new Error('Stems must have the canonical sample rate and length; no independent latency correction is guessed.');
      const from = map.pins[0].source, to = map.pins.at(-1)!.source;
      const origin = Math.max(0, from - 64), limit = Math.min(mix.grid.length, to + 64);
      const counts = buffers.map((b) => b!.numberOfChannels);
      const original = buffers.flatMap((b) => Array.from({ length: b!.numberOfChannels }, (_, c) => b!.getChannelData(c).slice(from, to)));
      const channels = buffers.flatMap((b) => Array.from({ length: b!.numberOfChannels }, (_, c) => b!.getChannelData(c).slice(origin, limit)));
      const began = performance.now();
      const w = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      const fail = (message: string) => { if (worker.current !== w) return; setError(message); setBusy(false); w.terminate(); worker.current = null; };
      w.onerror = (e) => fail(e.message || 'Audio worker failed.');
      w.onmessage = (e: MessageEvent<{ channels?: Float32Array[]; error?: string }>) => {
        if (worker.current !== w) return;
        if (e.data.error || !e.data.channels) { fail(e.data.error ?? 'No rendered channels.'); return; }
        setResult({ channels: e.data.channels, original, counts, map, ms: performance.now() - began });
        setBusy(false); w.terminate(); worker.current = null;
      };
      w.postMessage({ channels, map, origin }, channels.map((c) => c.buffer));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  const [urls, setUrls] = useState<{ original: string; fitted: string } | null>(null);
  useEffect(() => {
    setRepeats(0); lastPlayback.current = 0;
    if (!result) { setUrls(null); return; }
    function mixture(channels: Float32Array[], metronome: boolean) {
      const out = [new Float32Array(channels[0].length), new Float32Array(channels[0].length)];
      let offset = 0;
      result!.counts.forEach((count, s) => {
        if (solo === 'all' || solo === song.sources[s]) for (let c = 0; c < 2; c++) {
          const source = channels[offset + Math.min(c, count - 1)];
          for (let i = 0; i < source.length; i++) out[c][i] += source[i];
        }
        offset += count;
      });
      if (metronome && result!.map.request.policy.kind !== 'original') {
        const spacing = result!.map.rate * 60 / result!.map.request.bpm;
        for (let beat = 0; beat * spacing < out[0].length; beat++) {
          const at = Math.round(beat * spacing);
          for (let i = 0; i < result!.map.rate * 0.025 && at + i < out[0].length; i++) {
            const pulse = 0.16 * Math.exp(-i / (result!.map.rate * 0.004)) * Math.sin(i * 2 * Math.PI * (beat % 4 ? 1000 : 1600) / result!.map.rate);
            out.forEach((c) => { c[at + i] += pulse; });
          }
        }
      }
      return URL.createObjectURL(new Blob([wavOf(out, result!.map.rate)], { type: 'audio/wav' }));
    }
    const next = { original: mixture(result.original, false), fitted: mixture(result.channels, click) };
    setUrls(next);
    return () => { URL.revokeObjectURL(next.original); URL.revokeObjectURL(next.fitted); };
  }, [result, solo, click, song.sources]);

  const map = plan.map;
  const spacing = map ? map.rate * 60 / bpm : 1;
  const maxError = map ? Math.max(...map.beats.map((b) => Math.abs(b.output - (kind === 'section' ? Math.round(b.output / spacing) * spacing : b.grid)))) / map.rate * 1000 : 0;
  return <div className="mf-alignment">
    <p>Use the app’s kept beat map as source structure. To try a revised analysis, use <b>Take</b> in Beat analysis first. Required boundaries come from your policy; interior beats stay free.</p>
    <div className="mf-alignment-controls">
      <label>Timing <select value={kind} onChange={(e) => setKind(e.target.value as Policy['kind'])}>
        <option value="original">Original timing</option><option value="recurring">Recurring alignment</option><option value="section">Named section</option>
      </select></label>
      <label>Source start bar <input type="number" min="1" step="0.25" value={start} onChange={(e) => setStart(e.target.valueAsNumber)} /></label>
      <label>Source end bar (exclusive) <input type="number" min="1" step="0.25" value={end} onChange={(e) => setEnd(e.target.valueAsNumber)} /></label>
      <label>Target BPM <input type="number" min="20" max="400" step="0.01" disabled={kind === 'original'} value={bpm} onChange={(e) => setBpm(e.target.valueAsNumber)} /></label>
      {kind === 'recurring' && <label>Align every (bars) <input type="number" min="1" max="64" value={interval} onChange={(e) => setInterval(e.target.valueAsNumber)} /></label>}
      {kind === 'section' && <><label>Use existing section <select defaultValue="" onChange={(e) => {
        if (e.target.value === '') return;
        const i = Number(e.target.value), section = mix.slices[i];
        setStart(section.bar + 1); setEnd((mix.slices[i + 1]?.bar ?? mix.bars) + 1); setName(section.name);
      }}><option value="">Choose source boundaries…</option>{mix.slices.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select></label>
        <label>Section name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Declared output bars <input type="number" min="1" max="64" value={bars} onChange={(e) => setBars(e.target.valueAsNumber)} /></label></>}
    </div>
    <p>4/4 · source start → destination bar 1 / sample 0. Recurrences count from source start; the final shorter span retains its musical length. Source audio outside the selected range is excluded. Section and recurring policies are separate. Choosing a section copies its boundaries and name; declare its output length yourself.</p>
    <p className="mf-alignment-limit">Audio proof of concept: the existing export resampler changes pitch with speed. No smoothing or pitch preservation; speed is limited to 0.95–1.05, range to 120 seconds. These limits also apply to named sections. Small high-frequency aliasing and rate-step artifacts remain possible.</p>
    {(plan.error || error) && <p role="alert">{plan.error || error}</p>}
    {map && <>
      <div className="mf-alignment-summary">{map.pins.length} {kind === 'original' ? 'region endpoints (no correction)' : 'hard boundaries'} · {(map.length / map.rate).toFixed(4)} s · {map.length} samples · speed {Math.min(...map.speeds).toFixed(5)}–{Math.max(...map.speeds).toFixed(5)}
        {kind !== 'original' && <> · largest {kind === 'section' ? 'nearest-grid' : 'descriptive'} beat offset {maxError.toFixed(2)} ms (allowed)</>}</div>
      <svg viewBox="0 0 1000 125" role="img" aria-label="Detected beats after fitting, required boundaries and rigid destination grid">
        <text x="0" y="14">Grid</text><text x="0" y="56">Performance</text><text x="0" y="104">{kind === 'original' ? 'Region ends' : 'Required'}</text>
        {kind !== 'original' && Array.from({ length: Math.floor(map.length / spacing + 0.0001) + 1 }, (_, i) =>
          <line key={`grid-${i}`} className="grid" x1={110 + i * spacing / map.length * 880} x2={110 + i * spacing / map.length * 880} y1="2" y2="24" />)}
        {map.beats.map((b) => <g key={b.beat}>
          <line className="beat" x1={110 + b.output / map.length * 880} x2={110 + b.output / map.length * 880} y1="37" y2="65" />
        </g>)}
        {map.pins.map((p, i) => <line key={i} className="pin" x1={110 + p.output / map.length * 880} x2={110 + p.output / map.length * 880} y1="78" y2="115" />)}
      </svg>
      <details><summary>Inspect exact boundaries and rate changes</summary><table><thead><tr><th>Boundary</th><th>Source sample</th><th>Output sample</th><th>Next speed</th><th>Speed change</th></tr></thead><tbody>
        {map.pins.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{p.source}</td><td>{p.output}</td><td>{map.speeds[i]?.toFixed(6) ?? '—'}</td><td>{i > 0 && i < map.speeds.length ? (map.speeds[i] - map.speeds[i - 1]).toFixed(6) : '—'}</td></tr>)}
      </tbody></table></details>
    </>}
    <div className="mf-alignment-actions">
      <button onClick={render} disabled={!map || busy}>{busy ? 'Rendering all stems…' : 'Render all stems'}</button>
      {busy && <button onClick={() => { worker.current?.terminate(); worker.current = null; setBusy(false); }}>Cancel render</button>}
      <button disabled={!map} onClick={() => map && download(new Blob([JSON.stringify({ version: 1, trackId: song.id, source: mix.grid, alignment: map, renderer: 'sinc-varispeed', latency: 'zero added; existing decoded stem alignment assumed' }, null, 2)], { type: 'application/json' }), 'musical-alignment.json')}>Download timing evidence</button>
    </div>
    {result && urls && <div className="mf-alignment-listen">
      <p role="status">Rendered {song.sources.length} stems together in {(result.ms / 1000).toFixed(2)} s. Every channel has {result.map.length} output samples. Shared integer boundaries, no added resampler delay. Existing separation alignment is assumed, not newly measured.</p>
      <div className="mf-alignment-controls"><label>Listen to <select value={solo} onChange={(e) => setSolo(e.target.value)}><option value="all">Recombined stems</option>{song.sources.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Repeat region</label>
        <label><input type="checkbox" checked={click} disabled={kind === 'original'} onChange={(e) => setClick(e.target.checked)} /> Destination click (fitted audition only)</label></div>
      <label>Original selected audio<audio ref={originalPlayer} aria-label="Original selected audio" controls loop={loop} src={urls.original} onPlay={() => { mix.stop(); fittedPlayer.current?.pause(); }} /></label>
      <label>{kind === 'original' ? 'Original timing copy' : 'Fitted audio · varispeed'}<audio ref={fittedPlayer} aria-label="Fitted audio" controls loop={loop} src={urls.fitted}
        onTimeUpdate={(e) => {
          const at = e.currentTarget.currentTime;
          if (loop && lastPlayback.current > e.currentTarget.duration - 1 && at < 1) setRepeats((n) => n + 1);
          lastPlayback.current = at;
        }} onPlay={() => { mix.stop(); originalPlayer.current?.pause(); }} /></label>
      <p>Observed fitted loop restarts: {repeats}. Sampled from the media playhead; seeking from the end to the start also counts. This does not measure output-device gaps.</p>
      <div className="mf-alignment-actions">{song.sources.map((s, i) => <button key={s} onClick={() => {
        const offset = result.counts.slice(0, i).reduce((a, b) => a + b, 0);
        download(new Blob([wavOf(result.channels.slice(offset, offset + result.counts[i]), result.map.rate)], { type: 'audio/wav' }), `alignment-${s}.wav`);
      }}>Download {s} WAV</button>)}</div>
      <p>WAVs exclude the click. Exact length does not prove a clean loop join; compare transients, pitch, groove and joins by ear. Rounded total duration is within half a sample of the declared length; repeating that rounding can accumulate sub-sample error.</p>
    </div>}
  </div>;
}
