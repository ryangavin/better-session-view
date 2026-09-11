import { useEffect, useRef, useState } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { openflow, type Library, type Track } from '../../openflow.ts';
import { KEY_EXPERIMENT_VERSION, EXPERIMENT_BACKENDS, experimentAgreement, experimentAccuracy, referenceMatch, type KeyBackend, type KeyBackendStatus, type KeyExperimentData } from '../../keyExperiments.ts';
import { runKeyQueue, type KeyQueueProgress } from '../../keyQueue.ts';

export function KeyComparison({track,library}:{track:Track|undefined;library:Library}) {
  const api=openflow()?.keyExperiments;
  const [backends,setBackends]=useState<KeyBackendStatus[]>([]), [ready,setReady]=useState(false);
  const [selected,setSelected]=useState<KeyBackend[]>(['libkeyfinder','essentia']);
  const [checked,setChecked]=useState<string[]>(library.tracks.map(t=>t.id));
  const [data,setData]=useState<Record<string,KeyExperimentData>>({});
  const [problem,setProblem]=useState(''),[running,setRunning]=useState(false),[stopping,setStopping]=useState(false);
  const [progress,setProgress]=useState<KeyQueueProgress|null>(null),[log,setLog]=useState<string[]>([]);
  const [labels,setLabels]=useState(''),[provenance,setProvenance]=useState('');
  const stop=useRef(false),active=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop.current=true;};},[]);
  async function status() {
    setReady(false);
    try {if(!api)throw new Error('Backend comparison API missing: rebuild and restart the desktop app when safe');
      const value=await api.status();if(value.version!==KEY_EXPERIMENT_VERSION)throw new Error('Comparison protocol mismatch: rebuild and restart desktop');
      if(mounted.current){setBackends(value.backends);setReady(true);setProblem('');}
    } catch(error){if(mounted.current)setProblem(String(error));}
  }
  useEffect(()=>{void status();},[api]);
  useEffect(()=>{
    let live=true;setLabels('');setProvenance('');
    if(track&&api)void api.read(track.id).then(value=>{if(live){setData(previous=>({...previous,[track.id]:value}));setLabels(value.reference?.labels.join('; ')??'');setProvenance(value.reference?.provenance??'');}}).catch(error=>{if(live)setProblem(String(error));});
    return()=>{live=false;};
  },[track?.id,library.root,api]);
  const held=track?data[track.id]:undefined;
  const allRuns=Object.values(data).flatMap(d=>d.runs).sort((a,b)=>a.at.localeCompare(b.at));
  const scores=experimentAccuracy(allRuns,Object.fromEntries(Object.entries(data).map(([id,d])=>[id,d.reference])));
  async function loadInventory() {
    if(!api)return;
    try {for(const song of library.tracks){const value=await api.read(song.id);if(mounted.current)setData(previous=>({...previous,[song.id]:value}));}}
    catch(error){if(mounted.current)setProblem(String(error));}
  }
  async function run(ids:string[]) {
    if(!api||!ready||!library.root||active.current)return;
    active.current=true;stop.current=false;setRunning(true);setStopping(false);setLog([]);setProblem('');
    try {
      const initial=await api.status();if(initial.version!==KEY_EXPERIMENT_VERSION)throw new Error('Backend comparison protocol changed; refresh backends');
      const tracks=library.tracks.filter(t=>ids.includes(t.id));
      await runKeyQueue(tracks,{root:library.root,skipped:library.tracks.length-tracks.length,
        readRoot:async()=> (await openflow()!.library.read()).root,busy:()=>api.busy(),
        stopped:()=>stop.current,progress:value=>{if(mounted.current)setProgress(value);},report:message=>{if(mounted.current)setLog(previous=>[...previous,message]);},
        execute:async song=>{const run=await api.run({trackId:song.id,backends:selected});const value=await api.read(song.id);if(mounted.current)setData(previous=>({...previous,[song.id]:value}));
          if(run.results.some(r=>r.status==='error'))throw new Error(run.results.filter(r=>r.status==='error').map(r=>`${r.backend}: ${r.message}`).join('; '));
          return run.results.map(r=>`${r.backend}: ${r.labels.join(' / ')||r.status}`).join('; ');
        }});
    }catch(error){if(mounted.current)setProblem(String(error));}
    finally{active.current=false;if(mounted.current){setRunning(false);setStopping(false);}}
  }
  async function saveReference() {
    if(!track||!api)return;
    try{const reference=await api.reference({trackId:track.id,labels:labels.split(';').map(s=>s.trim()).filter(Boolean),provenance});
      setData(previous=>({...previous,[track.id]:{runs:previous[track.id]?.runs??[],reference}}));setProblem('');}
    catch(error){setProblem(String(error));}
  }
  function download() {
    const blob=new Blob([JSON.stringify({version:1,libraryRoot:library.root,data},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='key-experiment-comparison.json';link.click();URL.revokeObjectURL(url);
  }
  const canRun=ready&&!running&&selected.some(id=>backends.some(b=>b.id===id&&b.available));
  return <section aria-label="Original audio key experiments">
    <h3>Whole-mix detector comparison</h3>
    <p>Default input: the complete original recording. No stems required. Experiments never replace library keys or manual overrides. Bass is an optional cached baseline only.</p>
    <Button disabled={running} onPress={()=>void status()}>Refresh experiment backends</Button>
    {!ready&&<p>Comparison unavailable until a compatible desktop backend answers. Read saved canonical evidence below; no experiment starts automatically.</p>}
    {EXPERIMENT_BACKENDS.map(id=>{const state=backends.find(b=>b.id===id);return <div key={id}><label><input type="checkbox" checked={selected.includes(id)} disabled={running} onChange={e=>setSelected(previous=>e.target.checked?[...previous,id]:previous.filter(b=>b!==id))}/>{id}</label> · {state?`${state.available?'Available':'Unavailable'} · ${state.version} · ${state.license} · ${state.message}`:'Checking availability'}</div>;})}
    <p>Backend scores have different meanings and are never averaged. Runtime excludes the shared audio decode and includes backend process startup. Agreement is not accuracy.</p>
    <Button disabled={!canRun||!track} onPress={()=>track&&void run([track.id])}>Compare selected track</Button>
    <details><summary>Batch preview: {checked.filter(id=>library.tracks.some(t=>t.id===id)).length} original recordings checked</summary>
      {library.tracks.map(song=><div key={song.id}><label><input type="checkbox" disabled={running} checked={checked.includes(song.id)} onChange={e=>setChecked(previous=>e.target.checked?[...previous,song.id]:previous.filter(id=>id!==song.id))}/>{song.title}</label></div>)}
    </details>
    <Button disabled={!canRun||!checked.length} onPress={()=>void run(checked)}>Compare checked tracks</Button>
    <Button disabled={!running||stopping} onPress={()=>{stop.current=true;setStopping(true);}}>Stop comparison after current track</Button>
    <p>Sequential shared job lease. Stop/closing this tab keeps the current track’s results and stops scheduling further tracks. Other clients’ jobs are never canceled.</p>
    {progress&&<p role="status">{running?(stopping?'Stopping after current track':'Comparing'):problem?'Stopped with error':progress.stopped?'Stopped':'Finished'} · {progress.current??'No current track'} · {progress.completed} completed · {progress.failed} failed · {progress.skipped} skipped</p>}
    {problem&&<p role="alert">{problem}</p>}
    <ol aria-label="Comparison log">{log.map((line,i)=><li key={i}>{line}</li>)}</ol>
    <h4>Separate evaluation reference</h4>
    <p>Published references are fallible. Disputed, missing, unmatched-version and stale-audio references are excluded. “Verified” means a person checked the recording, not a detector vote.</p>
    {held?.reference&&<div><p>{held.reference.verification??'verified'}: {held.reference.labels.join(' / ')||'No reference key'} · {held.reference.provenance}</p><ul>{held.reference.sources?.map((s,i)=><li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.value||'No published key'} — {s.recording}</a></li>)}</ul></div>}
    <label>Verified reference keys (semicolon separated)<input aria-label="Verified reference keys" value={labels} onChange={e=>setLabels(e.target.value)} placeholder="C major; A minor"/></label>
    <label>How you verified this recording<input aria-label="Reference provenance" value={provenance} onChange={e=>setProvenance(e.target.value)}/></label>
    <Button disabled={!ready||running||!track||!labels.trim()||!provenance.trim()} onPress={()=>void saveReference()}>Save verified experimental reference</Button>
    <Button disabled={!ready||running} onPress={()=>void loadInventory()}>Load library results and references</Button>
    <Button disabled={!Object.keys(data).length} onPress={download}>Download comparison and references</Button>
    <h4>Accuracy on loaded references</h4>
    <p>Latest run per track/backend, exact pitch class and mode (enharmonic equivalents accepted). Multiple accepted reference keys allow documented ambiguity. Abstentions stay in the denominator; unavailable/error results are unscored. No reference means no accuracy claim.</p>
    <ul>{scores.map(s=><li key={s.backend}>{s.backend}: {s.total?`${s.match}/${s.total} exact (${(100*s.match/s.total).toFixed(1)}%)`:'No scored tracks'} · {s.mismatch} mismatches · {s.abstained} abstentions</li>)}</ul>
    <details><summary>Loaded reference inventory ({Object.keys(data).length} tracks)</summary><ul>{library.tracks.filter(t=>data[t.id]).map(t=><li key={t.id}>{t.title}: {data[t.id].reference?.verification??'missing'} · {data[t.id].reference?.labels.join(' / ')||'unset'} · {data[t.id].reference?.provenance}</li>)}</ul></details>
    {held?.runs.slice().reverse().map(run=><details key={run.id} open={run===held.runs.at(-1)}><summary>{run.at} · {experimentAgreement(run.results)}</summary><p>Original audio SHA-256: {run.sourceHash}</p><table><thead><tr><th>Backend / version / input</th><th>Result</th><th>Score semantics</th><th>Runtime</th><th>Reference</th></tr></thead><tbody>{run.results.map(r=><tr key={r.backend}><td>{r.backend} {r.version} / {r.input}</td><td>{r.status}: {r.labels.join(' / ')||'—'} {r.message}</td><td>{r.score??'No score'} · {r.scoreMeaning}</td><td>{(r.runtimeMs/1000).toFixed(2)}s</td><td>{referenceMatch(run,r,held.reference)}</td></tr>)}</tbody></table><pre>{JSON.stringify(run.results.map(r=>({backend:r.backend,config:r.config})),null,2)}</pre></details>)}
  </section>;
}
