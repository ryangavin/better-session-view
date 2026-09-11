const notes:Record<string,number> = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,Fb:4,'E#':5,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11,Cb:11};
export function normalizedKey(label:string):string|null {
  if (typeof label !== 'string') return null;
  if (label.trim().toLowerCase() === 'unknown') return 'Unknown';
  const camelot = /^(1[0-2]|[1-9])([AB])$/i.exec(label.trim());
  if (camelot) {
    const major = [11,6,1,8,3,10,5,0,7,2,9,4], minor = [8,3,10,5,0,7,2,9,4,11,6,1];
    return `${(camelot[2].toUpperCase()==='A'?minor:major)[Number(camelot[1])-1]}:${camelot[2].toUpperCase()==='A'?'minor':'major'}`;
  }
  const match = /^([A-G](?:#|b)?)\s+(major|minor)$/i.exec(label.trim().replaceAll('♯','#').replaceAll('♭','b'));
  if (!match) return null;
  const note = match[1][0].toUpperCase()+match[1].slice(1).toLowerCase();
  return notes[note] === undefined ? null : `${notes[note]}:${match[2].toLowerCase()}`;
}

const names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
/** One spelling for equivalent keys; preserve raw detector text in its evidence. */
export function keyName(label:string):string {
  const normalized=normalizedKey(label);
  if(!normalized||normalized==='Unknown')return 'Unknown';
  const [pitch,mode]=normalized.split(':');return `${names[Number(pitch)]} ${mode}`;
}
export const KEY_CHOICES=['Unknown',...['major','minor'].flatMap(mode=>names.map(name=>`${name} ${mode}`))];
