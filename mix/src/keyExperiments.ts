export const KEY_EXPERIMENT_VERSION = 1;
export const EXPERIMENT_BACKENDS = ['libkeyfinder','essentia','bass'] as const;
export type KeyBackend = typeof EXPERIMENT_BACKENDS[number];
export interface KeyBackendStatus { id: KeyBackend; available: boolean; version: string; message: string; license: string }
export interface KeyExperimentResult {
  backend: KeyBackend; version: string; input: 'original' | 'bass';
  status: 'key' | 'unknown' | 'ambiguous' | 'unavailable' | 'error';
  labels: string[]; score: number | null; scoreMeaning: string; runtimeMs: number;
  config: Record<string, string | number | boolean>; message?: string;
}
export interface KeyExperimentRun {
  id: string; trackId: string; title: string; at: string; sourceHash: string;
  file: string; results: KeyExperimentResult[];
}
export interface KeyReference {
  sourceHash: string; labels: string[]; provenance: string;
  verification?: 'verified' | 'published' | 'disputed' | 'missing' | 'version-unverified';
  sources?: {url:string;value:string;recording:string}[];
}
export interface KeyExperimentData { runs: KeyExperimentRun[]; reference: KeyReference | null }
export interface KeyExperimentAPI {
  status(): Promise<{version:number;backends:KeyBackendStatus[]}>;
  busy(): Promise<boolean>;
  read(trackId:string): Promise<KeyExperimentData>;
  run(ask:{trackId:string;backends:KeyBackend[]}): Promise<KeyExperimentRun>;
  reference(ask:{trackId:string;labels:string[];provenance:string}): Promise<KeyReference>;
}
export { normalizedKey } from './keyNames.ts';
import { normalizedKey } from './keyNames.ts';
/** Exact pitch-class/mode agreement only; neither scores nor ambiguity are votes. */
export function experimentAgreement(results:KeyExperimentResult[]):string {
  const usable = results.filter(r=>r.status === 'key' && r.labels.length === 1 && normalizedKey(r.labels[0]) !== null);
  if (usable.length < 2) return 'Not enough unambiguous results to compare';
  return new Set(usable.map(r=>normalizedKey(r.labels[0]))).size === 1 ? 'Unambiguous backends agree' : 'Unambiguous backends disagree';
}
export function referenceMatch(run:KeyExperimentRun,result:KeyExperimentResult,reference:KeyReference|null):'match'|'mismatch'|'abstained'|'unscored' {
  if (!reference || ['disputed','missing','version-unverified'].includes(reference.verification ?? '') || reference.sourceHash !== run.sourceHash || !reference.provenance.trim()) return 'unscored';
  if (!reference.labels.length || reference.labels.some(label=>normalizedKey(label)===null)) return 'unscored';
  if (result.status === 'unavailable' || result.status === 'error') return 'unscored';
  if (result.status === 'ambiguous') return 'abstained';
  const label = result.status === 'unknown' ? 'Unknown' : result.labels[0];
  if (typeof label !== 'string' || normalizedKey(label)===null) return 'unscored';
  return reference.labels.some(r=>normalizedKey(r) === normalizedKey(label)) ? 'match' : result.status === 'unknown' ? 'abstained' : 'mismatch';
}
export function experimentAccuracy(runs:KeyExperimentRun[], references:Record<string,KeyReference|null>) {
  return EXPERIMENT_BACKENDS.map(backend => {
    let match=0,mismatch=0,abstained=0;
    // Latest run per track/backend only: repeated attempts never inflate accuracy.
    const seen=new Set<string>();
    for (const run of [...runs].sort((a,b)=>b.at.localeCompare(a.at))) {
      const result=run.results.find(r=>r.backend===backend);
      if (!result || seen.has(run.trackId)) continue; seen.add(run.trackId);
      const outcome=referenceMatch(run,result,references[run.trackId]);
      if(outcome==='match')match++; if(outcome==='mismatch')mismatch++; if(outcome==='abstained')abstained++;
    }
    return {backend,match,mismatch,abstained,total:match+mismatch+abstained};
  });
}
