import { useEffect, useRef, useState } from 'react';
import { Harness, Toolbar, Group } from '@openflow/widgets/debug/Harness.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import type { Mix } from '../../state.ts';
import { openflow, type Library } from '../../openflow.ts';
import { keyLabel } from '../../key.ts';
import { detectedKey, KEY_LIBRARY_VERSION } from '../../keyDetection.ts';
import { backfillKeys, keyBackfillPlan, type KeyBackfillProgress } from '../../keyBackfill.ts';
import './key.css';
import { KeyComparison } from './KeyComparison.tsx';

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
  const analysis = track?.keyDetection;
  const current = track && detectedKey(track);
  const plan = keyBackfillPlan(library, reanalyze);
  const bridge = openflow();

  async function checkVersion() {
    let matches = false;
    try { matches = !!bridge?.keyVersion && await bridge.keyVersion() === KEY_LIBRARY_VERSION; } catch { /* Older backends have no handler. Fail closed. */ }
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
  async function run(id?: string, all=false) {
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
        busy: async () => await bridge.keyExperiments.busy(),
        analyze: async trackId => {
          if (!await checkVersion()) { stop.current = true; throw new Error('Backend key version unavailable or incompatible; rebuild and restart the desktop app before analysis'); }
          const held = await bridge.analyzeKey(trackId);
          if (mounted.current) setLibrary(held);
          await mix.refreshLibrary();
          return held;
        },
      }, { run: true, reanalyze: id || all ? true : reanalyze, stopped: () => stop.current,
        report: message => { if (mounted.current) setMessages(previous => [...previous, message]); },
        progress: value => { if (mounted.current) setProgress(value); },
      });
    } catch (error) { if (mounted.current) setProblem(String(error)); }
    finally { active.current = false; if (mounted.current) { setRunning(false); setStopping(false); } }
  }
  return <Harness title="Key detection">
    <div className="mf-key-lab">
      <header className="mf-key-heading"><div><h2>Library keys</h2><p>libkeyfinder · original recordings · {library.tracks.filter(t=>detectedKey(t)).length}/{library.tracks.length} detected</p></div><Button className="mf-key-update" disabled={running||!compatible||!bridge||!library.tracks.length} onPress={()=>void run(undefined,true)}>{running?'Updating…':'Update library keys'}</Button></header>
      {compatible===false&&<p role="status">Restart the desktop app to enable original-song key detection.</p>}
      {running&&<div className="mf-key-progress"><span>{progress?.current??'Preparing…'} · {progress?.completed??0} completed</span><Button disabled={stopping} onPress={()=>{stop.current=true;setStopping(true);}}>Stop library update</Button></div>}
      {problem&&<p role="alert">{problem}</p>}
      <details><summary>Compare detectors · experiments</summary><KeyComparison key={library.root} track={track} library={library} onSelect={select} /></details>
      <details className="mf-key-canonical"><summary>Advanced · library key detection</summary>
      <Toolbar><Group caption="Track">
        <select aria-label="Key detection track" value={track?.id ?? ''} onChange={e => select(e.target.value)}>
          {!library.tracks.length && <option value="">No tracks</option>}
          {library.tracks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <Button disabled={running || !bridge} onPress={() => void refresh()}>Refresh saved evidence</Button>
        <Button disabled={running || !compatible || !bridge || !track?.file} onPress={() => void run(track?.id)}>Detect selected key</Button>
      </Group></Toolbar>
      {compatible !== true && <p>{compatible === null ? 'Checking backend key version…' : 'Analysis unavailable: backend key version is missing or incompatible. Rebuild and restart the desktop app, then refresh saved evidence.'}</p>}
      {track && <section aria-label="Saved key evidence">
        <h3>{track.title}: {keyLabel(track)}</h3>
        {track.key && <p>Manual key: {track.key}. Detection preserves this correction.</p>}
        {!analysis?<p>No original-song key detected yet.</p>:<>
          <p>Detected: {analysis.label} · {current?'Current':'Stale'} · {analysis.algorithm} {analysis.detectorVersion}</p>
          <details><summary>Detection provenance</summary><pre>{JSON.stringify(analysis,null,2)}</pre></details>
        </>}
        {track.keyAnalysis&&<details><summary>Legacy bass evidence</summary><pre>{JSON.stringify(track.keyAnalysis,null,2)}</pre></details>}
      </section>}
      <section aria-label="Bulk key analysis">
        <h3>Library analysis</h3>
        <label><input type="checkbox" checked={reanalyze} disabled={running} onChange={e => setReanalyze(e.target.checked)} /> Include current detected keys (including Unknown)</label>
        <p>{plan.pending.length} to analyze · {plan.eligible} with original audio · {plan.alreadyDone} already analyzed and skipped · {plan.missingOriginal} without original audio</p>
        <details><summary>Preview tracks to analyze</summary><ul>{plan.pending.map(t => <li key={t.id}>{t.title}</li>)}</ul></details>
        <Toolbar><Button disabled={running || !compatible || !bridge || !library.root || !plan.pending.length} onPress={() => void run()}>{reanalyze ? 'Reanalyze library keys' : 'Analyze missing keys'}</Button>
          <Button disabled={!running || stopping} onPress={() => { stop.current = true; setStopping(true); }}>Stop after current track</Button></Toolbar>
        <p>Uses libkeyfinder on the original recording. Exact current results are reused; bass stems are not required. Closing this panel stops the batch after the current track; completed results stay saved.</p>
        {progress && <p role="status">{stopping ? 'Stopping after current track. ' : running ? 'Running. ' : problem ? 'Stopped with an error. ' : progress.stopped ? 'Stopped. ' : 'Finished. '}{progress.current ? `Current: ${progress.current}. ` : ''}{progress.completed} completed · {progress.failed} failed · {progress.skipped} skipped · {progress.total} planned</p>}

        <ol aria-label="Analysis log">{messages.map((message, i) => <li key={i}>{message}</li>)}</ol>
      </section>
      </details>
    </div>
  </Harness>;
}
