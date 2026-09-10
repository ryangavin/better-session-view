import { expect, it } from 'vitest';
import { browseLibrary } from './listing.ts';
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
