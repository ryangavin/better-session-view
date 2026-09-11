import { expect, it } from 'vitest';
import { normalizedKey, referenceMatch, experimentAccuracy, experimentAgreement, type KeyExperimentRun, type KeyExperimentResult, type KeyReference } from './keyExperiments.ts';
const result:KeyExperimentResult={backend:'essentia',version:'v',input:'original',status:'key',labels:['C# minor'],score:0.8,scoreMeaning:'strength',runtimeMs:1,config:{}};
const run:KeyExperimentRun={id:'1',trackId:'song',title:'song',at:'2026-01-01',sourceHash:'hash',file:'audio/song',results:[result]};
const reference:KeyReference={sourceHash:'hash',labels:['Db minor'],provenance:'Person checked exact recording',verification:'verified'};
it('normalizes enharmonic notes and all Camelot positions without conflating relative modes',()=>{
  const major=['B','F#','Db','Ab','Eb','Bb','F','C','G','D','A','E'],minor=['Ab','Eb','Bb','F','C','G','D','A','E','B','F#','Db'];
  for(let i=0;i<12;i++){expect(normalizedKey(`${i+1}B`)).toBe(normalizedKey(`${major[i]} major`));expect(normalizedKey(`${i+1}A`)).toBe(normalizedKey(`${minor[i]} minor`));}
  expect(normalizedKey('D♭ minor')).toBe(normalizedKey('c# MINOR'));
  expect(normalizedKey('C major')).not.toBe(normalizedKey('A minor'));
  expect(normalizedKey('A Dorian')).toBeNull();expect(normalizedKey('13A')).toBeNull();
});
it('excludes disputed, unmatched, absent, stale and invalid references',()=>{
  expect(referenceMatch(run,result,reference)).toBe('match');
  for(const verification of ['disputed','missing','version-unverified'] as const)expect(referenceMatch(run,result,{...reference,verification})).toBe('unscored');
  for(const value of [null,{...reference,sourceHash:'old'},{...reference,labels:[]},{...reference,labels:['invalid']}])expect(referenceMatch(run,result,value)).toBe('unscored');
});
it('counts ambiguity and Unknown as abstentions, never as agreement or unavailable failures',()=>{
  expect(referenceMatch(run,{...result,status:'ambiguous',labels:['C# minor','E major']},reference)).toBe('abstained');
  expect(referenceMatch(run,{...result,status:'unknown',labels:[]},reference)).toBe('abstained');
  expect(referenceMatch(run,{...result,status:'error'},reference)).toBe('unscored');
  expect(experimentAgreement([result,{...result,backend:'bass',status:'ambiguous'}])).toContain('Not enough');
  expect(experimentAgreement([result,{...result,backend:'libkeyfinder',labels:['Db minor'],score:null}])).toContain('agree');
});
it('scores only newest attempt for each track and backend, independent of array order',()=>{
  const latest={...run,id:'2',at:'2026-02-01',results:[{...result,labels:['C major']}]};
  expect(experimentAccuracy([latest,run],{song:reference})[1]).toEqual({backend:'essentia',match:0,mismatch:1,abstained:0,total:1});
});
