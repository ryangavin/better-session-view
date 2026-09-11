import { normalizedKey } from './keyNames.ts';
export const KEY_DETECTION_VERSION=1;
/** IPC generation: distinguishes whole-recording analysis from the old bass worker. */
export const KEY_LIBRARY_VERSION=4;
export const KEYFINDER_VERSION='2.2.8';
export const KEYFINDER_CONFIG={sampleRate:44100,channels:1,format:'f32le',profile:'libkeyfinder defaults',revision:'c78e8372e0188c0a11b7b55a653ea0cbbbf70fa5'} as const;
export interface KeyDetection {
  version:number; algorithm:'libkeyfinder'; detectorVersion:string;
  source:{file:string;hash:string};config:typeof KEYFINDER_CONFIG;
  status:'key'|'unknown';label:string;confidence:'provisional';analyzedAt:string;
  experimentId?:string;
}
export function keyConfigMatches(config:unknown):boolean {
  if(!config||typeof config!=='object')return false;
  return Object.entries(KEYFINDER_CONFIG).every(([key,value])=>(config as Record<string,unknown>)[key]===value)&&Object.keys(config).length===Object.keys(KEYFINDER_CONFIG).length;
}
export function detectedKey(track:{file?:string;keyDetection?:KeyDetection|null}):KeyDetection|null {
  const held=track.keyDetection;
  return held?.version===KEY_DETECTION_VERSION && held.algorithm==='libkeyfinder' && held.detectorVersion===KEYFINDER_VERSION && held.source?.file===track.file && !!held.source.hash && keyConfigMatches(held.config) && normalizedKey(held.label)!==null && (held.status==='key'||held.status==='unknown') && (held.status==='unknown')===(held.label==='Unknown') ? held:null;
}
