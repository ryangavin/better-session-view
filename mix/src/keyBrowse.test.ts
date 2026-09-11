import { KEY_DETECTION_VERSION, KEYFINDER_CONFIG, KEYFINDER_VERSION } from './keyDetection.ts';
import { expect, it } from 'vitest';
import { browseLibrary } from './listing.ts';
import { estimateKey } from './key.ts';
import type { PitchMap } from './pitchMap.ts';
import type { Track } from './openflow.ts';
it('combines artist, album, key and text without losing unknown tracks', () => {
  const tracks = [{id:'a',title:'One',artist:'Artist',album:'Album',key:'E minor'},
    {id:'b',title:'Two',artist:'Artist',album:'Album',key:null},
    {id:'c',title:'One other',artist:'Else',album:'Else',key:'E minor'}] as Track[];
  const result = browseLibrary(tracks,'One',{artist:'artist',album:'album',key:'E minor'});
  expect(result.songs.map(t=>t.id)).toEqual(['a']);
  expect(result.keys.map(c=>c.name)).toEqual(['E minor','Unknown']);
  expect(browseLibrary(tracks,'',{artist:null,album:null,key:'Unknown'}).songs.map(t=>t.id)).toEqual(['b']);
  expect(browseLibrary(tracks,'',{artist:null,album:null}).songs).toHaveLength(3);
});

it('offers and matches only the primary key for an ambiguous analyzed song', () => {
  const pitches = Array.from({length: 4}, () => [24,26,28,29,31,33,35]).flat();
  const map = {seconds:pitches.length,start:0,step:1,hz:pitches.map(p => 440 * 2 ** ((p - 69) / 12)),state:pitches.map(() => 'voiced')} as PitchMap;
  const source = {hash:'bass',mapHash:'map',stems:'stems/song',model:'model'};
  const keyAnalysis = estimateKey(map,source);
  const tracks = [{id:'song',title:'Song',artist:'Artist',album:'Album',key:null,file:'song.wav',keyDetection:{version:KEY_DETECTION_VERSION,algorithm:'libkeyfinder',detectorVersion:KEYFINDER_VERSION,source:{file:'song.wav',hash:'original'},config:{...KEYFINDER_CONFIG},status:'key',label:'C major',confidence:'provisional',analyzedAt:''},stems:source.stems,model:source.model,keyAnalysis}, {id:'manual',title:'Other song',artist:'Artist',album:'Album',key:'A minor'}] as Track[];
  expect(keyAnalysis.alternatives.map(c => c.label)).toContain('A minor');
  expect(browseLibrary(tracks,'',{artist:null,album:null}).keys.map(c => c.name)).toEqual(['A minor','C major']);
  expect(browseLibrary(tracks,'',{artist:null,album:null,key:'A minor'}).songs.map(t => t.id)).toEqual(['manual']);
  expect(browseLibrary(tracks,'',{artist:null,album:null,key:'C major'}).songs.map(t => t.id)).toEqual(['song']);
});
