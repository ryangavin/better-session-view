import { expect, it } from 'vitest';
import { carriesImport, droppedYoutube } from './libraryDrop.ts';
import { TRACK_DRAG } from './play/decks.ts';
const data=(values:Record<string,string>)=>({getData:(type:string)=>values[type]??''});
it('accepts external files and browser links without intercepting library-to-deck drags',()=>{
  expect(carriesImport(['Files'])).toBe(true);
  expect(carriesImport(['text/uri-list','text/plain'])).toBe(true);
  expect(carriesImport([TRACK_DRAG,'text/plain'])).toBe(false);
});
it('imports a canonical video from URI lists and ignores comments and playlist decorations',()=>{
  expect(droppedYoutube(data({'text/uri-list':'# link\r\nhttps://www.youtube.com/watch?v=abc_123&list=playlist','text/plain':'A title'}))).toBe('https://www.youtube.com/watch?v=abc_123');
});
it('accepts Firefox URL/title pairs and plain short links',()=>{
  expect(droppedYoutube(data({'text/x-moz-url':'https://youtu.be/abc_123\nVideo title'}))).toBe('https://www.youtube.com/watch?v=abc_123');
  expect(droppedYoutube(data({'text/plain':'https://www.youtube.com/shorts/abc_123'}))).toBe('https://www.youtube.com/watch?v=abc_123');
});
it('ignores other sites, non-links, credential URLs and playlist-only URLs',()=>{
  for(const text of ['https://youtube.com.evil.test/watch?v=abc','hello','https://user:pass@youtube.com/watch?v=abc','https://youtube.com/playlist?list=abc']) expect(droppedYoutube(data({'text/plain':text}))).toBeNull();
});
