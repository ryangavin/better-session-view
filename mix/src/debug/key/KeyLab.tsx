import { useEffect, useRef, useState } from 'react';
import { Harness, Toolbar, Group } from '@openflow/widgets/debug/Harness.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import type { Mix } from '../../state.ts';
import { openflow, type Library } from '../../openflow.ts';
import { KEY_VERSION, keyLabel, savedKey } from '../../key.ts';
import { backfillKeys, keyBackfillPlan, type KeyBackfillProgress } from '../../keyBackfill.ts';
import './key.css';

export function KeyLab({ mix }: { mix: Mix }) {
  const [library, setLibrary] = useState<Library>(mix.library);
  const [selected, select] = useState(mix.song?.id ?? '');
  const [reanalyze, setReanalyze] = useState(false);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<KeyBackfillProgress | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [compatible, setCompatible] = useState<boolean | null>(null);
  const stop = useRef(false), active = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  useEffect(() => { if (!active.current) setLibrary(mix.library); }, [mix.library]);
  const track = library.tracks.find(t => t.id === selected) ?? library.tracks[0];
  const analysis = track?.keyAnalysis;
  const current = track && savedKey(track);
  const plan = keyBackfillPlan(library, reanalyze);
  const bridge = openflow();

  async function checkVersion() {
    let matches = false;
    try { matches = !!bridge?.keyVersion && await bridge.keyVersion() === KEY_VERSION; } catch { /* Older backends have no handler. Fail closed. */ }
    if (mounted.current) setCompatible(matches);
    return matches;
  }
  useEffect(() => { void checkVersion(); }, [bridge]);

  async function refresh() {
    try {
      if (!bridge) throw new Error('Desktop connection unavailable');
      await checkVersion();
      const held = await bridge.library.read();
      if (mounted.current) { setLibrary(held); setProblem(''); }
      await mix.refreshLibrary();
    } catch (error) { if (mounted.current) setProblem(String(error)); }
  }
  async function run(id?: string) {
    if (!bridge || !compatible || active.current) return;
    active.current = true; stop.current = false;
    setRunning(true); setStopping(false); setProblem(''); setMessages([]); setProgress(null);
    const root = library.root;
    try {
      await backfillKeys({
        read: async () => {
          const held = await bridge.library.read();
          if (held.root !== root) throw new Error('Library changed; refresh the preview before starting again');
          if (mounted.current) setLibrary(held);
          return id ? { ...held, tracks: held.tracks.filter(t => t.id === id) } : held;
        },
        busy: async () => !!(await bridge.separate.busy() || await bridge.transcribe.busy()),
        analyze: async trackId => {
          if (!await checkVersion()) { stop.current = true; throw new Error('Backend key version unavailable or incompatible; rebuild and restart the desktop app before analysis'); }
          const held = await bridge.analyzeKey(trackId);
          if (mounted.current) setLibrary(held);
          await mix.refreshLibrary();
          return held;
        },
      }, { run: true, reanalyze: id ? true : reanalyze, stopped: () => stop.current,
        report: message => { if (mounted.current) setMessages(previous => [...previous, message]); },
        progress: value => { if (mounted.current) setProgress(value); },
      });
    } catch (error) { if (mounted.current) setProblem(String(error)); }
    finally { active.current = false; if (mounted.current) { setRunning(false); setStopping(false); } }
  }
  return <Harness title="Key detection">
    <div className="mf-key-lab">
      <p>Saved bass evidence only. Opening this panel does not analyze audio. Estimates are provisional; alternatives and regions are not confirmed key changes.</p>
      {compatible !== true && <p role="status">{compatible === null ? 'Checking backend key version…' : 'Analysis unavailable: backend key version is missing or incompatible. Rebuild and restart the desktop app when its current job and playback are safely finished, then refresh saved evidence. Read-only diagnostics remain available.'}</p>}
      <Toolbar><Group caption="Track">
        <select aria-label="Key detection track" value={track?.id ?? ''} onChange={e => select(e.target.value)}>
          {!library.tracks.length && <option value="">No tracks</option>}
          {library.tracks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <Button disabled={running || !bridge} onPress={() => void refresh()}>Refresh saved evidence</Button>
        <Button disabled={running || !compatible || !bridge || !track?.stems || !track.model || !track.sources.includes('bass')} onPress={() => void run(track?.id)}>Analyze selected track</Button>
      </Group></Toolbar>
      {track && <section aria-label="Saved key evidence">
        <h3>{track.title}: {keyLabel(track)}{!track.key && current?.status === 'candidate' ? ' ?' : ''}</h3>
        {track.key && <p>Manual key: {track.key}. Analysis preserves this override.</p>}
        {!analysis ? <p>No saved analysis. {track.stems && track.sources.includes('bass') ? 'Ready to analyze.' : 'Bass stems required; this panel does not separate audio.'}</p> : <>
          <p>Stored primary: {analysis.label} · {current ? 'Current' : 'Stale — reanalysis required'} · {analysis.status} · {analysis.confidence} evidence (not calibrated confidence)</p>
          <p>Usable pitch coverage: {(analysis.coverage * 100).toFixed(1)}% · Summary version {analysis.version} (current {KEY_VERSION}) · {analysis.algorithm} · {analysis.analyzedAt}</p>
          <details><summary>Source identity</summary><dl><dt>Model / stems</dt><dd>{analysis.source.model} / {analysis.source.stems}</dd><dt>Bass hash</dt><dd>{analysis.source.hash}</dd><dt>Pitch map hash</dt><dd>{analysis.source.mapHash}</dd></dl></details>
          <h4>Competing scale hypotheses</h4>
          <ul>{analysis.alternatives.map(c => <li key={c.label}>{c.label}: {(c.support * 100).toFixed(1)}% scale support (usable pitch duration, not probability)</li>)}</ul>
          <h4>Timed regional evidence</h4>
          <p>{analysis.possibleChanges ? 'Regional hypotheses differ; this does not establish modulation.' : 'No differing regional hypotheses recorded.'}</p>
          <table><thead><tr><th>Seconds</th><th>Hypotheses</th><th>Coverage</th></tr></thead><tbody>{analysis.regions.map(r => <tr key={r.from}><td>{r.from.toFixed(1)}–{r.to.toFixed(1)}</td><td>{r.candidates.length ? r.candidates.join(' / ') : 'Unknown'}</td><td>{(r.coverage * 100).toFixed(1)}%</td></tr>)}</tbody></table>
        </>}
      </section>}
      <section aria-label="Bulk key analysis">
        <h3>Library analysis</h3>
        <label><input type="checkbox" checked={reanalyze} disabled={running} onChange={e => setReanalyze(e.target.checked)} /> Reanalyze already analyzed tracks (including Unknown)</label>
        <p>{plan.pending.length} to analyze · {plan.eligible} with bass stems · {plan.alreadyDone} already analyzed and skipped · {plan.missingStems} without bass stems</p>
        <details><summary>Preview tracks to analyze</summary><ul>{plan.pending.map(t => <li key={t.id}>{t.title}</li>)}</ul></details>
        <Toolbar><Button disabled={running || !compatible || !bridge || !library.root || !plan.pending.length} onPress={() => void run()}>{reanalyze ? 'Reanalyze library keys' : 'Analyze missing keys'}</Button>
          <Button disabled={!running || stopping} onPress={() => { stop.current = true; setStopping(true); }}>Stop after current track</Button></Toolbar>
        <p>Runs sequentially through the existing bass worker, reusing valid cached pitch maps. Missing stems are skipped. Closing this panel stops the batch after the current track; completed results stay saved.</p>
        {progress && <p role="status">{stopping ? 'Stopping after current track. ' : running ? 'Running. ' : problem ? 'Stopped with an error. ' : progress.stopped ? 'Stopped. ' : 'Finished. '}{progress.current ? `Current: ${progress.current}. ` : ''}{progress.completed} completed · {progress.failed} failed · {progress.skipped} skipped · {progress.total} planned</p>}
        {problem && <p role="alert">{problem}. Refresh the preview and retry when ready.</p>}
        <ol aria-label="Analysis log">{messages.map((message, i) => <li key={i}>{message}</li>)}</ol>
      </section>
    </div>
  </Harness>;
}
