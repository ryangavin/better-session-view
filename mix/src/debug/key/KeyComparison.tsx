import { keyName } from '../../keyNames.ts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { openflow, type Library, type Track } from '../../openflow.ts';
import { KEY_EXPERIMENT_VERSION, EXPERIMENT_BACKENDS, experimentAgreement, experimentAccuracy, referenceMatch, type KeyBackend, type KeyBackendStatus, type KeyExperimentData } from '../../keyExperiments.ts';
import { runKeyQueue, type KeyQueueProgress } from '../../keyQueue.ts';

export function KeyComparison({track,library,onSelect}:{track:Track|undefined;library:Library;onSelect?:(id:string)=>void}) {
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
  useEffect(()=>{if(ready)void loadInventory();},[ready,library.root,library.tracks,api]);
  async function run(ids:string[]) {
    if(!api||!ready||!library.root||active.current)return;
    active.current=true;stop.current=false;setRunning(true);setStopping(false);setLog([]);setProblem('');setProgress({completed:0,failed:0,skipped:library.tracks.length-ids.length,stopped:false,total:ids.length,current:null});
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
  const latest=(id:string,backend:KeyBackend)=>{
    const runs=data[id]?.runs??[];
    for(let i=runs.length-1;i>=0;i--){const result=runs[i].results.find(r=>r.backend===backend);if(result)return {run:runs[i],result};}
    return null;
  };
  const eligible=(reference:KeyExperimentData['reference'])=>!!reference && !['disputed','missing','version-unverified'].includes(reference.verification??'') && reference.labels.length>0;
  const referenceCount=Object.values(data).filter(d=>eligible(d.reference)).length;
  const analyzedCount=library.tracks.filter(t=>data[t.id]?.runs.some(r=>r.results.some(v=>['key','unknown','ambiguous'].includes(v.status)))).length;
  const columns=EXPERIMENT_BACKENDS.filter(b=>b!=='bass'||selected.includes('bass')||allRuns.some(r=>r.results.some(v=>v.backend==='bass')));
  const displayName=(id:KeyBackend)=>id==='libkeyfinder'?'libkeyfinder':id==='essentia'?'Essentia':'Bass baseline';
  const referenceState=(reference:KeyExperimentData['reference'])=>!reference||reference.verification==='missing'?'No reference':reference.verification==='disputed'?'Disputed':reference.verification==='version-unverified'?'Version unconfirmed':reference.verification==='verified'?'Verified':'Published';
  function resultCell(id:string,backend:KeyBackend){
    const held=latest(id,backend),available=backends.find(b=>b.id===backend)?.available;
    if(!held)return <div className="mf-key-result is-empty"><span className="mf-key-value">—</span><span className="mf-key-badge">{available===false?'! Unavailable':'○ Not run'}</span></div>;
    const {run,result}=held,outcome=referenceMatch(run,result,data[id]?.reference??null);
    const badge=result.status==='error'?'! Failed':result.status==='unavailable'?'! Unavailable':result.status==='unknown'?'? Unknown':result.status==='ambiguous'?'? Uncertain':outcome==='match'?'✓ Match':outcome==='mismatch'?'≠ Different':'◇ Unscored';
    return <div className={`mf-key-result is-${outcome}`} title={result.message}><span className="mf-key-value" title={result.labels.join(' / ')}>{result.labels.map(keyName).join(' / ')||'—'}</span><span className="mf-key-badge">{badge}</span><small>{(result.runtimeMs/1000).toFixed(1)}s</small></div>;
  }
  return <section className="mf-key-dashboard" aria-label="Original audio key experiments">
    <header className="mf-key-heading"><div><h2>Key comparison</h2><p>Whole recording · {library.tracks.length} songs · Library keys stay unchanged</p></div>
      <Button className="mf-key-primary" disabled={!canRun||!library.tracks.length} onPress={()=>void run(library.tracks.map(t=>t.id))}>{running?'Analyzing…':'Analyze library'}</Button>
    </header>
    {problem&&<p className="mf-key-alert" role="alert">{problem}</p>}
    {!ready&&!problem&&<p role="status">Connecting to detectors…</p>}
    <div className="mf-key-overview">
      <div className="mf-key-stat"><span>Analyzed</span><strong>{analyzedCount}<small> / {library.tracks.length}</small></strong><progress aria-label="Songs analyzed" max={Math.max(1,library.tracks.length)} value={analyzedCount}/><small>{library.tracks.length-analyzedCount} not analyzed</small></div>
      <div className="mf-key-stat"><span>Usable references</span><strong>{referenceCount}<small> / {library.tracks.length}</small></strong><progress aria-label="Reference coverage" max={Math.max(1,library.tracks.length)} value={referenceCount}/><small>{Object.keys(data).length<library.tracks.length?'Loading references…':`${library.tracks.length-referenceCount} missing, disputed or unconfirmed`}</small></div>
      {scores.filter(s=>columns.includes(s.backend)).map(s=><div className="mf-key-stat" key={s.backend}><span>{displayName(s.backend)} matches</span><strong>{s.total?<>{s.match}<small> / {s.total} scored</small></>:<>—<small> Not evaluated</small></>}</strong><div className="mf-key-scorebar" role="img" aria-label={`${displayName(s.backend)}: ${s.match} matches, ${s.mismatch} different, ${s.abstained} abstentions; ${s.total} scored`}><i className="is-match" style={{width:`${100*s.match/Math.max(1,s.total)}%`}}/><i className="is-mismatch" style={{width:`${100*s.mismatch/Math.max(1,s.total)}%`}}/><i className="is-abstained" style={{width:`${100*s.abstained/Math.max(1,s.total)}%`}}/></div><small>{s.total?`${s.total}/${referenceCount} refs evaluated · ${s.mismatch} different · ${s.abstained} uncertain`:`0/${referenceCount} refs evaluated`}</small></div>)}
    </div>
    {running&&progress&&<div className="mf-key-progress" role="status"><div><strong>{stopping?'Stopping after this song':progress.current??'Preparing…'}</strong><span>{progress.completed+progress.failed} / {progress.total} · {progress.failed} failed</span><progress aria-label="Batch progress" max={Math.max(1,progress.total)} value={progress.completed+progress.failed}/></div><Button disabled={stopping} onPress={()=>{stop.current=true;setStopping(true);}}>Stop after current</Button></div>}
    {!running&&progress&&<p role="status" className="mf-key-complete">{problem?'Stopped with error':progress.stopped?'Stopped':'Finished'} · {progress.completed} completed · {progress.failed} failed</p>}
    <div className="mf-key-matrix-wrap"><table className="mf-key-matrix" aria-label="Song key comparison"><thead><tr><th>Song</th><th>Reference</th>{columns.map(id=><th key={id}>{displayName(id)}<small>{backends.find(b=>b.id===id)?.available?'Ready':'Unavailable'}</small></th>)}</tr></thead><tbody>
      {library.tracks.map(song=>{const reference=data[song.id]?.reference??null;return <tr key={song.id} className={track?.id===song.id?'is-selected':''}><th scope="row"><Button tone="quiet" onPress={()=>onSelect?.(song.id)} className="mf-key-song"><span>{song.title}</span><small>{song.artist||'Unknown artist'}</small></Button></th><td><div className="mf-key-result"><span className="mf-key-value">{eligible(reference)?reference!.labels.map(keyName).join(' / '):'—'}</span><span className="mf-key-badge">{data[song.id]?referenceState(reference):'Loading…'}</span></div></td>{columns.map(id=><td key={id}>{resultCell(song.id,id)}</td>)}</tr>;})}
    </tbody></table></div>
    {!analyzedCount&&<p className="mf-key-empty">○ No analysis yet. Analyze the library or choose a song.</p>}
    {track&&<div className="mf-key-selected"><div><small>SELECTED SONG</small><h3>{track.title}</h3><span>{track.key?`Library key: ${track.key}`:'No manual key'} · {held?.runs.length?experimentAgreement(held.runs.at(-1)!.results):'Not run'}</span></div><Button disabled={!canRun} onPress={()=>void run([track.id])}>Analyze selected song</Button></div>}
    <div className="mf-key-disclosures">
      <details><summary>Sources & selected-song details</summary>
        {held?.reference?<div><h4>{referenceState(held.reference)} reference · {held.reference.labels.join(' / ')||'Unset'}</h4><p>{held.reference.provenance}</p><ul>{held.reference.sources?.map((s,i)=><li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.value||'No published key'} — {s.recording}</a></li>)}</ul></div>:<p>No reference saved for this song.</p>}
        <details><summary>Correct the experimental reference</summary><label>Verified reference keys<input aria-label="Verified reference keys" value={labels} onChange={e=>setLabels(e.target.value)} placeholder="C major; A minor"/></label><label>Verification notes<input aria-label="Reference provenance" value={provenance} onChange={e=>setProvenance(e.target.value)}/></label><Button disabled={!ready||running||!track||!labels.trim()||!provenance.trim()} onPress={()=>void saveReference()}>Save verified reference</Button></details>
        {held?.runs.slice().reverse().map(run=><details key={run.id}><summary>{run.at} · {experimentAgreement(run.results)}</summary><p>Original SHA-256: {run.sourceHash}</p><pre>{JSON.stringify(run.results,null,2)}</pre></details>)}
      </details>
      <details><summary>Settings & diagnostics</summary>
        <h4>Detectors</h4>{EXPERIMENT_BACKENDS.map(id=>{const state=backends.find(b=>b.id===id);return <div key={id} className="mf-key-backend"><label><input type="checkbox" checked={selected.includes(id)} disabled={running} onChange={e=>setSelected(previous=>e.target.checked?[...previous,id]:previous.filter(b=>b!==id))}/>{displayName(id)}</label><span>{state?`${state.available?'Available':'Unavailable'} · ${state.version}`:'Checking…'}</span><small>{state?.message} · {state?.license}</small></div>;})}
        <div className="mf-key-actions"><Button disabled={running} onPress={()=>{void status();void loadInventory();}}>Refresh detectors & results</Button><Button disabled={!Object.keys(data).length} onPress={download}>Download evidence</Button></div>
        <p>Original audio by default. Bass uses an existing pitch map only. Scores are not comparable across detectors. Runtime includes process startup, excluding shared decode. Published references are fallible; disputed, missing, unmatched-version and stale references are unscored. Unknown and ambiguous results abstain; errors are excluded. Agreement is not accuracy.</p>
        <details><summary>Custom batch · {checked.length} selected</summary><div className="mf-key-checklist">{library.tracks.map(song=><label key={song.id}><input type="checkbox" disabled={running} checked={checked.includes(song.id)} onChange={e=>setChecked(previous=>e.target.checked?[...previous,song.id]:previous.filter(id=>id!==song.id))}/>{song.title}</label>)}</div><Button disabled={!canRun||!checked.length} onPress={()=>void run(checked)}>Analyze checked songs</Button></details>
        <details><summary>Run log · {log.length} entries</summary><ol aria-label="Comparison log">{log.map((line,i)=><li key={i}>{line}</li>)}</ol></details>
      </details>
    </div>
  </section>;
}
