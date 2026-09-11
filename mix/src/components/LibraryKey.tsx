import { useEffect, useState } from 'react';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { keyLabel, keyDescription } from '../key.ts';
import { KEY_CHOICES, keyName } from '../keyNames.ts';
import { detectedKey, KEY_LIBRARY_VERSION } from '../keyDetection.ts';
import { openflow, type Track, type Edits } from '../openflow.ts';
import './LibraryKey.css';
export function LibraryKey({song,edit,refresh}:{song:Track;edit(id:string,edits:Edits):Promise<void>;refresh():Promise<void>}){
  const [opened,setOpened]=useState(false);
  return <span className="mf-library-key" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onDragStart={e=>e.stopPropagation()}>
    <Button tone="quiet" className="mf-library-key-button" label={`Edit key for ${song.title}`} title={keyDescription(song)} onPress={()=>setOpened(true)}>{keyLabel(song)}</Button>
    {opened&&<KeyEditor song={song} edit={edit} refresh={refresh} close={()=>setOpened(false)}/>}
  </span>;
}
function KeyEditor({song,edit,refresh,close}:{song:Track;edit(id:string,edits:Edits):Promise<void>;refresh():Promise<void>;close():void}){
  const [value,setValue]=useState(keyName(keyLabel(song))),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let live=true;const api=openflow();if(!api){setError('Key editing needs a connected desktop app.');return;}void api.keyVersion().then(version=>{if(live){setReady(version===KEY_LIBRARY_VERSION);if(version!==KEY_LIBRARY_VERSION)setError('Restart the desktop app to enable the new key detector and editor.');}}).catch(()=>{if(live)setError('Key editing needs a connected, current desktop app.');});return()=>{live=false;};},[]);
  async function save(key:string|null){setBusy(true);try{await edit(song.id,{key});close();}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function detect(){setBusy(true);try{await openflow()!.analyzeKey(song.id);await refresh();close();}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <Modal title={`Key · ${song.title}`} width={360} onClose={close} actions={<><Button disabled={!ready||busy} onPress={()=>void save(value)}>Save key</Button><Button disabled={!ready||busy} onPress={()=>void save(null)}>Use detected</Button></>}>
    <label className="mf-key-edit-field">Key<select aria-label="Song key" value={value} disabled={busy} onChange={e=>setValue(e.target.value)}>{KEY_CHOICES.map(key=><option key={key}>{key}</option>)}</select></label>
    <p className="mf-key-edit-note">Detected: {detectedKey(song)?.label??'Not analyzed'}{song.key?' · Manual correction active':''}</p>
    <Button disabled={!ready||busy} onPress={()=>void detect()}>{busy?'Working…':'Detect from original'}</Button>
    {error&&<p role="alert">{error}</p>}
  </Modal>;
}
