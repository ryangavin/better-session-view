import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Harness, Toolbar, Group, Status } from '@openflow/widgets/debug/Harness.tsx';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { xOf, type View } from '@openflow/widgets/debug/axis.ts';
import { ink } from '@openflow/widgets/debug/ink.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Mix } from '../../state.ts';
import { openflow } from '../../openflow.ts';
import { STANDARD_BASS } from '../../tab.ts';
import { midiPitch, pitchName, type PitchEvidence } from '../../pitchMap.ts';
import { PitchPlayer, BrowserMidiPort, type MidiPort } from './player.ts';
import { decode, fileUrl } from '../../audio.ts';
import { drawRuler, inksOf } from '../draw.ts';
import { keyRegions, parseReference, scorePitch, type PitchReference } from './evidence.ts';
import './pitch.css';

export function PitchLab({ mix }: { mix: Mix }) {
  const songs = mix.songs.filter(s => s.sources.includes('bass'));
  return <Harness title="Bass pitch" subject={<Select label="Pitch analysis track" items={songs.map(s => s.title)} index={Math.max(0, songs.findIndex(s => s.id === mix.song?.id))} onChange={i => mix.select(songs[i].id)} width={240} />}>
    {mix.song && !mix.decoding && mix.audioOf('bass') ? <TrackPitch key={`${mix.song.id}:${mix.song.stems}`} mix={mix} /> :
      <p>Choose a separated track with a bass stem. {mix.decoding ? 'Decoding audio…' : mix.audioProblem}</p>}
  </Harness>;
}

function TrackPitch({ mix }: { mix: Mix }) {
  const [evidence, setEvidence] = useState<PitchEvidence | null>(null);
  const [reference, setReference] = useState<PitchReference | null>(null);
  const [problem, setProblem] = useState('');
  const [stage, setStage] = useState('Reading cached evidence…');
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(true);
  const [notes, setNotes] = useState(true);
  const [loop, setLoop] = useState(false);
  const [sourceMode, setSourceMode] = useState(0);
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [sourceLevel, setSourceLevel] = useState(.7);
  const [midiLevel, setMidiLevel] = useState(.35);
  const [sourceMute, setSourceMute] = useState(false);
  const [midiMute, setMidiMute] = useState(false);
  const [internalSynth, setInternalSynth] = useState(true);
  const [midiStatus, setMidiStatus] = useState('External MIDI is off.');
  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  const [outputId, setOutputId] = useState('');
  const [virtualId, setVirtualId] = useState('');
  const [openingPort, setOpeningPort] = useState(false);
  const virtualHeld = useRef('');
  const [channel, setChannel] = useState(1);
  const [midiOffset, setMidiOffset] = useState(0);
  const midiAccess = useRef<MIDIAccess | null>(null);
  const [head, setHead] = useState<number | undefined>();
  const [at, setAt] = useState(0);
  const [windowIndex, setWindowIndex] = useState(1);
  const [tuning, setTuning] = useState(0);
  const [lower, setLower] = useState(20);
  const [upper, setUpper] = useState(60);
  const audition = useMemo(() => new PitchPlayer(says => setProblem(says)), []);
  const live = useRef(true);
  const ownJob = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const trackId = mix.song!.id;
  const buffer = mix.audioOf('bass')!;
  const axis = useAxis({ seconds: buffer.duration, narrowest: 0.1 });
  const map = evidence?.map;
  const virtualOutput = useMemo<MidiPort | null>(() => {
    const api = openflow()?.bassMidi;
    if (!virtualId || !api) return null;
    // The browser harness uses HTTP: serialize writes so Clear cannot overtake
    // a queued Note On. Native Electron uses the same ordering.
    let pending = Promise.resolve(), failed = false;
    const enqueue = (write: () => Promise<void>) => {
      pending = pending.then(() => { if (!failed) return write(); }).catch(e => {
        failed = true; if (virtualHeld.current !== virtualId) return;
        audition.stop(); if (live.current) setMidiStatus(String(e));
      });
    };
    return {
      send: (data, timestamp) => { const epoch = performance.timeOrigin + (timestamp ?? performance.now()); enqueue(() => api.send(virtualId, data, epoch)); },
      clear: () => enqueue(() => api.clear(virtualId)),
    };
  }, [virtualId, audition]);
  const port = outputs.find(p => p.id === outputId);
  const browserOutput = useMemo(() => port ? new BrowserMidiPort(port, e => { audition.stop(); setMidiStatus(String(e)); }) : null, [port, audition]);
  const selectedOutput = virtualOutput ?? browserOutput;
  const regions = useMemo(() => map ? keyRegions(map, [4, 8, 16, 32][windowIndex], tuning) : [], [map, windowIndex, tuning]);
  const score = useMemo(() => map && reference ? scorePitch(map, reference, axis.window.from, axis.window.to) : null, [map, reference, axis.window]);
  const peaks = useMemo(() => {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const n = Math.min(16384, buffer.length), low = new Float32Array(n), high = new Float32Array(n);
    for (let i = 0; i < buffer.length; i++) {
      let sample = 0;
      for (const c of channels) sample += c[i] / channels.length;
      const b = Math.min(n - 1, Math.floor(i / buffer.length * n));
      low[b] = Math.min(low[b], sample); high[b] = Math.max(high[b], sample);
    }
    return { low, high };
  }, [buffer]);

  useEffect(() => {
    live.current = true;
    const bridge = openflow();
    void bridge?.transcribe.pitchMap(trackId).then(value => {
      if (live.current) { setEvidence(value); setStage(value ? 'Cached model evidence · not verified ground truth' : 'No continuous map. Analyze bass upgrades legacy note-only results once.'); }
    }).catch(e => { if (live.current) { setProblem(String(e)); setStage('Could not read evidence'); } });
    const off = bridge?.transcribe.onProgress(e => { if (e.trackId === trackId && live.current) setStage(e.progress.stage); });
    return () => {
      live.current = false; off?.();
      if (ownJob.current) void bridge?.transcribe.cancel(trackId);
      audition.stop();
      if (virtualHeld.current) { void bridge?.bassMidi.close(virtualHeld.current); virtualHeld.current = ''; }
    };
  }, [trackId, buffer, audition]);
  useEffect(() => () => {
    // React's development effect replay reuses the instance; release audio
    // after the microtask only when this experiment remains unmounted.
    queueMicrotask(() => { if (!live.current) audition.dispose(); });
    if (midiAccess.current) midiAccess.current.onstatechange = null;
  }, [audition]);
  useEffect(() => { audition.levels(sourceMute ? 0 : sourceLevel, midiMute ? 0 : midiLevel, internalSynth); }, [audition, sourceMute, sourceLevel, midiMute, midiLevel, internalSynth]);
  useEffect(() => {
    audition.output(selectedOutput, channel, midiOffset);
  }, [audition, selectedOutput, channel, midiOffset]);
  useEffect(() => { audition.seek(axis.cursor); }, [audition, axis.cursor]);
  useEffect(() => { audition.stop(); }, [audition, axis.loop, sourceMode]);
  useEffect(() => {
    if (sourceMode !== 1 || original) return;
    const abort = new AbortController();
    void (async () => {
      const base = await openflow()?.library.base();
      if (!base) throw new Error('No library connection for original audio');
      const response = await fetch(fileUrl(base, mix.song!.file), { signal: abort.signal });
      if (!response.ok) throw new Error('Could not read original audio');
      const result = await decode(audition.context(), await response.arrayBuffer());
      if (!abort.signal.aborted) setOriginal(result);
    })().catch(e => { if (!abort.signal.aborted) setProblem(String(e)); });
    return () => abort.abort();
  }, [sourceMode, original, audition, mix.song!.file]);
  useEffect(() => {
    const timer = window.setInterval(() => setHead(audition.position() ?? undefined), 40);
    return () => window.clearInterval(timer);
  }, [audition]);

  const run = async () => {
    const bridge = openflow();
    if (!bridge) return;
    setBusy(true); ownJob.current = true; setProblem('');
    try {
      const outcome = await bridge.transcribe.run({ trackId, tuning: STANDARD_BASS, bars: mix.bpmAuto || mix.beats ? mix.grid : null,
        transpose: evidence?.transpose ?? mix.transcription?.sidecar.transpose ?? 0, requirePitchMap: true });
      if (!live.current) return;
      if (!outcome.ok) throw new Error(outcome.says);
      const value = await bridge.transcribe.pitchMap(trackId);
      if (!live.current) return;
      setEvidence(value); setReference(null);
      setStage(value ? `${outcome.reused ? 'Reused' : 'Saved'} continuous evidence · not verified ground truth` : 'No readable map returned');
    } catch (e) { if (live.current) setProblem(String(e)); }
    finally { ownJob.current = false; if (live.current) setBusy(false); }
  };
  const play = async () => {
    try {
      mix.stop();
      const source = sourceMode === 1 ? original : buffer;
      if (!source) throw new Error('Original audio is still loading');
      const span = axis.loop ?? axis.window;
      await audition.start({ source, notes: evidence?.notes ?? [], transpose: evidence?.transpose ?? 0, span, loop });
      if (!live.current) audition.stop();
    } catch (e) { if (live.current) setProblem(String(e)); }
  };
  useEffect(() => {
    if (!virtualId) return;
    const timer = window.setInterval(() => {
      void openflow()?.bassMidi.ping(virtualId).catch(e => {
        audition.stop(); setVirtualId(''); virtualHeld.current = ''; setMidiStatus(String(e));
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [virtualId, audition]);
  const toggleVirtual = async () => {
    const api = openflow()?.bassMidi;
    if (!api) { setMidiStatus('Virtual MIDI needs the updated desktop backend.'); return; }
    audition.stop();
    if (virtualId) {
      await api.close(virtualId); virtualHeld.current = ''; setVirtualId(''); setMidiStatus('External MIDI is off.'); return;
    }
    setOpeningPort(true);
    try {
      const id = await api.open();
      if (!live.current) { await api.close(id); return; }
      virtualHeld.current = id; setVirtualId(id); setOutputId('');
      setMidiStatus('mix[flow] Bass is available in Live. Enable Track for its MIDI input, select it on an instrument track, and set Monitor In.');
    } catch (e) { if (live.current) setMidiStatus(`Virtual MIDI unavailable: ${String(e)}`); }
    finally { if (live.current) setOpeningPort(false); }
  };
  const connectMidi = async () => {
    if (!navigator.requestMIDIAccess) { setMidiStatus('Web MIDI is unavailable in this app/browser.'); return; }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      if (!live.current) return;
      if (midiAccess.current) midiAccess.current.onstatechange = null;
      midiAccess.current = access;
      const refresh = () => {
        const connected = [...access.outputs.values()].filter(p => p.state === 'connected');
        const ports = connected;
        setOutputs(ports); setOutputId(id => ports.some(p => p.id === id) ? id : '');
        setMidiStatus(ports.length ? 'Select an output explicitly; notes send only during Play.' : 'No MIDI outputs connected.');
      };
      access.onstatechange = refresh; refresh();
    } catch (e) { if (live.current) setMidiStatus(`MIDI access unavailable: ${String(e)}`); }
  };
  const download = () => {
    if (!evidence) return;
    const blob = new Blob([JSON.stringify({ evidence, reference, keyHypotheses: { windowSeconds: [4, 8, 16, 32][windowIndex], tuningCents: tuning, regions }, visibleRange: axis.window, score }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `bass-pitch-${trackId}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const frame = map ? Math.max(0, Math.min(map.hz.length - 1, Math.round(at / map.step))) : 0;
  const hz = map?.hz[frame];
  const pitch = hz && hz > 0 ? midiPitch(hz) : null;
  const yOf = (pitch: number, v: View) => v.height - 12 - (pitch - lower) / Math.max(1, upper - lower) * (v.height - 24);
  const wave = useCallback((g: CanvasRenderingContext2D, v: View) => {
    g.strokeStyle = ink(g.canvas, '--fg-muted', '#aaa'); g.beginPath();
    for (let x = 0; x < v.width; x++) {
      const lo = Math.max(0, Math.floor((v.from + x / v.width * (v.to - v.from)) / buffer.duration * peaks.low.length));
      const hi = Math.min(peaks.low.length, Math.max(lo + 1, Math.ceil((v.from + (x + 1) / v.width * (v.to - v.from)) / buffer.duration * peaks.low.length)));
      let min = 0, max = 0;
      for (let i = lo; i < hi; i++) { min = Math.min(min, peaks.low[i]); max = Math.max(max, peaks.high[i]); }
      g.moveTo(x, v.height / 2 - max * v.height / 2); g.lineTo(x, v.height / 2 - min * v.height / 2);
    }
    g.stroke();
  }, [buffer.duration, peaks]);
  const pitchDraw = (g: CanvasRenderingContext2D, v: View) => {
    const fg = ink(g.canvas, '--fg', '#ddd'), faint = ink(g.canvas, '--fg-muted', '#888');
    g.font = '10px monospace';
    for (let p = Math.ceil(lower); p <= upper; p++) {
      const y = yOf(p, v); g.globalAlpha = 0.18; g.strokeStyle = faint; g.beginPath(); g.moveTo(0, y); g.lineTo(v.width, y); g.stroke();
      g.globalAlpha = 0.8; g.fillStyle = fg;
      if ((v.height - 24) / (upper - lower) >= 14 || p % 12 === 0) g.fillText(pitchName(p), 4, y - 2);
    }
    g.globalAlpha = 1;
    if (!map) return;
    if (notes) for (const n of evidence!.notes) {
      if (n.end < v.from || n.start > v.to || n.pitch === null) continue;
      g.strokeStyle = '#dfad64'; g.lineWidth = 3; g.beginPath();
      g.moveTo(xOf(v, n.start), yOf(n.pitch + evidence!.transpose, v));
      g.lineTo(xOf(v, n.end), yOf(n.pitch + evidence!.transpose, v)); g.stroke();
    }
    g.lineWidth = 1;
    for (let i = Math.max(0, Math.floor(v.from / map.step)); i < Math.min(map.hz.length, Math.ceil(v.to / map.step)); i++) {
      const h = map.hz[i]; if (!h || h <= 0) continue;
      const accepted = map.state[i] === 'voiced'; if (!raw && !accepted) continue;
      g.fillStyle = accepted ? '#7bcdc0' : '#c77b94'; g.globalAlpha = accepted ? 1 : 0.35;
      g.fillRect(xOf(v, i * map.step), yOf(midiPitch(h), v), Math.max(1, map.step / (v.to - v.from) * v.width), 2);
    }
    g.globalAlpha = 1; g.fillStyle = fg;
    if (reference) for (const f of reference.frames) if (f.time >= v.from && f.time < v.to && f.hz && f.hz > 0) {
      g.fillRect(xOf(v, f.time), yOf(midiPitch(f.hz), v) - 1, 2, 2);
    }
  };

  return <div className="mf-pitch-lab">
    <Toolbar>
      <Group caption="Evidence"><Button onPress={() => void run()} disabled={busy || mix.engineBusy}>Analyze bass</Button><Button disabled={!busy} onPress={() => void openflow()?.transcribe.cancel(trackId)}>Cancel</Button><Button disabled={!map} onPress={download}>Export evidence</Button></Group>
      <Group caption="Passage"><Button onPress={() => void play()} disabled={sourceMode === 1 && !original}>Play comparison</Button><Button onPress={() => audition.stop()}>Stop</Button><Toggle on={loop} onChange={v => { setLoop(v); audition.setLoop(v); }}>Loop</Toggle></Group>
      <Group caption="Seconds">
        <label>From <input aria-label="Pitch passage start seconds" type="number" min="0" max={buffer.duration} step="0.01" value={Number((axis.loop ?? axis.window).from.toFixed(3))} onChange={e => { const from = Number(e.target.value), to = (axis.loop ?? axis.window).to; if (Number.isFinite(from) && from >= 0 && from < to - .05) axis.setLoop({ from, to }); }} /></label>
        <label>To <input aria-label="Pitch passage end seconds" type="number" min="0" max={buffer.duration} step="0.01" value={Number((axis.loop ?? axis.window).to.toFixed(3))} onChange={e => { const to = Number(e.target.value), from = (axis.loop ?? axis.window).from; if (Number.isFinite(to) && to <= buffer.duration && to > from + .05) axis.setLoop({ from, to }); }} /></label>
      </Group>
      <Group caption="Time"><Button onPress={() => axis.zoom(0.5, 0.5)}>Zoom in</Button><Button onPress={() => axis.zoom(2, 0.5)}>Zoom out</Button><Button onPress={axis.whole}>Whole</Button><Button disabled={!axis.loop} onPress={() => axis.loop && axis.frame(axis.loop)}>Frame selection</Button><Button onPress={() => axis.setLoop(null)}>Clear selection</Button></Group>
    </Toolbar>
    <Status tone={problem ? 'bad' : 'normal'}>{problem || stage}</Status>
    <Toolbar>
      <Group caption="Recording"><Select label="Comparison recording" items={['Separated bass', 'Original full song']} index={sourceMode} onChange={setSourceMode} width={160} /><Toggle width={90} on={sourceMute} onChange={setSourceMute}>Mute audio</Toggle><input aria-label="Recording level" type="range" min="0" max="1" step="0.01" value={sourceLevel} onChange={e => setSourceLevel(Number(e.target.value))} /></Group>
      <Group caption="Derived MIDI"><Toggle width={104} on={internalSynth} onChange={setInternalSynth}>Triangle synth</Toggle><Toggle width={88} on={midiMute} onChange={setMidiMute}>Mute MIDI</Toggle><input aria-label="Derived MIDI level" type="range" min="0" max="1" step="0.01" value={midiLevel} onChange={e => setMidiLevel(Number(e.target.value))} /></Group>
    </Toolbar>
    <Toolbar>
      <Group caption="External MIDI"><Button disabled={openingPort} onPress={() => void toggleVirtual()}>{virtualId ? 'Close mix[flow] Bass port' : 'Create mix[flow] Bass port'}</Button><Button disabled={!!virtualId} onPress={() => void connectMidi()}>Find MIDI outputs</Button><Select disabled={!!virtualId} label="Hardware or IAC MIDI output" items={['Off', ...outputs.map(p => p.name || p.id)]} index={Math.max(0, outputs.findIndex(p => p.id === outputId) + 1)} onChange={i => { if (virtualId) { audition.stop(); void openflow()?.bassMidi.close(virtualId); virtualHeld.current = ''; setVirtualId(''); } setOutputId(i ? outputs[i - 1].id : ''); }} width={190} /><label>Channel <input aria-label="External MIDI channel" type="number" min="1" max="16" value={channel} onChange={e => setChannel(Math.max(1, Math.min(16, Math.round(Number(e.target.value)))))} /></label><label>Offset ms <input aria-label="External MIDI timing offset milliseconds" type="number" min="-100" max="100" value={midiOffset} onChange={e => setMidiOffset(Math.max(-100, Math.min(100, Number(e.target.value))))} /></label></Group>
    </Toolbar>
    <output aria-label="Pitch playback">{head === undefined ? 'Playback stopped' : `Playing · ${head.toFixed(2)} s`}</output>
    <p>{midiStatus} MIDI uses derived note segments, not continuous bends. Selecting a device/channel stops playback. The MIDI level scales new external note velocities; Mute MIDI releases held external notes. Use a dedicated synth channel.</p>
    <Toolbar>
      <Group caption="Layers"><Toggle width={132} on={raw} onChange={setRaw}>Rejected estimates</Toggle><Toggle width={106} on={notes} onChange={setNotes}>Derived notes</Toggle></Group>
      <Group caption="Pitch range"><label>Low MIDI <input aria-label="Lowest visible MIDI pitch" type="number" min="0" max={upper - 1} value={lower} onChange={e => setLower(Math.max(0, Math.min(upper - 1, Number(e.target.value))))} /></label><label>High MIDI <input aria-label="Highest visible MIDI pitch" type="number" min={lower + 1} max="127" value={upper} onChange={e => setUpper(Math.min(127, Math.max(lower + 1, Number(e.target.value))))} /></label></Group>
      <Group caption="Key hypotheses"><Select label="Key evidence window" items={['4 seconds', '8 seconds', '16 seconds', '32 seconds']} index={windowIndex} onChange={setWindowIndex} /><label>Tuning cents <input aria-label="Key analysis tuning offset in cents" type="number" min="-50" max="50" value={tuning} onChange={e => setTuning(Math.max(-50, Math.min(50, Number(e.target.value))))} /></label></Group>
    </Toolbar>
    <p>Green: voiced model estimates · pink: rejected estimates · amber: derived notes ({evidence?.transpose ?? 0} semitones correction) · white: imported reference. Pitch is unsnapped; gaps remain unknown. Click pitch to inspect. Shift-drag the ruler to select a passage; scroll to pan, Shift-scroll to zoom.</p>
    <Scope axis={axis} head={head} labels={90}>
      <ScopeRow label="Time" height={28} ruler draw={(g, v) => drawRuler(g, v, null, inksOf(g.canvas))} />
      <ScopeRow label="Bass mono" height={64} draw={wave} />
      <ScopeRow label="Pitch / MIDI" height={300} draw={pitchDraw} onPointer={p => { setAt(p.at); if (p.type === 'down') axis.seek(p.at); }} />
      <ScopeRow label="Periodicity" height={54} draw={(g, v) => {
        if (!map) return;
        const begin = Math.max(0, Math.floor(v.from / map.step)), end = Math.min(map.hz.length, Math.ceil(v.to / map.step));
        for (let i = begin; i < end; i++) {
          g.fillStyle = map.state[i] === 'voiced' ? '#7bcdc0' : '#c77b94';
          const confidence = Math.max(0, Math.min(1, map.smoothedPeriodicity[i] ?? 0));
          g.fillRect(xOf(v, i * map.step), v.height * (1 - confidence), Math.max(1, map.step / (v.to - v.from) * v.width), v.height * confidence);
        }
        g.strokeStyle = '#dfad64'; g.beginPath(); g.moveTo(0, v.height * (1 - map.policy.periodicityFloor)); g.lineTo(v.width, v.height * (1 - map.policy.periodicityFloor)); g.stroke();
      }} />
      <ScopeRow label="Key candidates" height={38} draw={(g, v) => {
        g.font = '11px monospace';
        for (const region of regions) {
          if (region.to < v.from || region.from > v.to) continue;
          const left = Math.max(0, xOf(v, region.from)), right = Math.min(v.width, xOf(v, region.to));
          g.fillStyle = ink(g.canvas, '--fg-muted', '#888'); g.globalAlpha = 0.13;
          g.fillRect(left, 1, right - left - 1, v.height - 2); g.globalAlpha = 1;
          g.fillStyle = ink(g.canvas, '--fg', '#ddd');
          g.save(); g.beginPath(); g.rect(left, 0, right - left, v.height); g.clip();
          g.fillText(region.label, left + 4, 22); g.restore();
        }
      }} onPointer={p => { if (p.type === 'down') { const r = regions.find(r => p.at >= r.from && p.at < r.to); if (r) axis.setLoop({ from: r.from, to: r.to }); } }} />
    </Scope>
    <output aria-label="Pitch frame evidence">{map ? `${(frame * map.step).toFixed(3)} s · ${map.state[frame]} · ${hz?.toFixed(2) ?? 'unknown'} Hz · ${pitch === null ? 'unknown' : `${pitchName(pitch)} ${((pitch - Math.round(pitch)) * 100).toFixed(1)} cents`} · periodicity ${map.periodicity[frame]?.toFixed(3) ?? 'invalid'} raw / ${map.smoothedPeriodicity[frame]?.toFixed(3) ?? 'invalid'} smoothed · ${map.rmsDb[frame]?.toFixed(1)} dBFS` : 'Analyze bass to inspect frame evidence.'}</output>
    <p>Key regions below show major/natural-minor scale compatibility, not confirmed keys or modulations. Bass alone can leave several tonic/mode choices. Window boundaries limit timing precision; changing the window is an inspection tool.</p>
    {map && <p>Model range: {map.engine.fmin.toFixed(1)}–{map.engine.fmax.toFixed(1)} Hz. Low B0 lies below this model’s floor. Periodicity measures model support, not pitch accuracy. Tuning offset changes key hypotheses only.</p>}
    <div className="mf-pitch-regions">{regions.map(r => <Button key={r.from} onPress={() => { axis.setLoop({ from: r.from, to: r.to }); axis.frame(r); }} title={`${Math.round(r.coverage * 100)}% usable pitch coverage`}>{r.from.toFixed(1)}–{r.to.toFixed(1)} s · {r.label}</Button>)}</div>
    <Toolbar><Group caption="Reference"><Button disabled={!map} onPress={() => input.current?.click()}>Import reference JSON</Button><Button disabled={!reference} onPress={() => setReference(null)}>Clear reference</Button><Button disabled={!score?.disagreements.length} onPress={() => { const t = score!.disagreements.find(t => t > axis.cursor + 0.05) ?? score!.disagreements[0]; axis.seek(t); setAt(t); axis.setLoop({ from: Math.max(0, t - 0.25), to: Math.min(buffer.duration, t + 0.75) }); }}>Next disagreement</Button></Group></Toolbar>
    <input ref={input} hidden type="file" accept=".json" aria-label="Pitch reference file" onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file || !map) return;
      void file.text().then(text => { const parsed = parseReference(text, map.source.hash); if (live.current) { setReference(parsed); setProblem(''); } }).catch(e => { if (live.current) setProblem(String(e)); });
    }} />
    <p>{reference ? `${reference.kind}: ${reference.provenance}` : 'No independent reference loaded. Listening and viewing expose errors; they do not establish ground truth.'}</p>
    {score && <output aria-label="Pitch reference score">Visible range: {score.correct}/{score.voiced} voiced-reference frames within 50 cents · {score.detected}/{score.voiced} voicing recall · {score.falseVoiced}/{score.unvoiced} false voicing · {score.octave} octave errors · median {score.medianCents?.toFixed(1) ?? '—'} cents on jointly voiced frames. Unknown reference frames are excluded.</output>}
  </div>;
}
