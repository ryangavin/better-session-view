import { describe, expect, it } from 'vitest';
import { credits } from './credits.ts';

/** A library the way a catalogue writes one: features in the title, collaborators in the credit. */
const SKRILLEX = [
  'Skrillex',
  'Skrillex',
  'Skrillex & Rick Ross',
  'Skrillex, Fred again.. & Flowdan',
  'Skrillex feat. Sirah',
  'Boys Noize & Skrillex',
  'Above & Beyond',
  'Tyler, The Creator',
  'Darude',
];
const read = credits(SKRILLEX);
const of = (credit: string) => read(credit)!;

describe('reading a credit against the library it is in', () => {
  it('collects an artist collaborations under the name they are billed first on', () => {
    expect(SKRILLEX.map((credit) => of(credit).lead)).toEqual([
      'Skrillex', 'Skrillex', 'Skrillex', 'Skrillex', 'Skrillex',
      'Boys Noize & Skrillex', 'Above & Beyond', 'Tyler, The Creator', 'Darude',
    ]);
  });

  it('never rewrites what the manifest stores', () => {
    for (const credit of SKRILLEX) expect(of(credit).full).toBe(credit);
  });

  it('keeps everyone else, in the words they were credited in', () => {
    expect(of('Skrillex & Rick Ross').others).toBe('& Rick Ross');
    expect(of('Skrillex feat. Sirah').others).toBe('feat. Sirah');
    expect(of('Skrillex').others).toBeNull();
  });

  it('drops a leading comma, because a row that starts with one reads as a typo', () => {
    expect(of('Skrillex, Fred again.. & Flowdan').others).toBe('Fred again.. & Flowdan');
  });

  it('leaves a name that merely contains a join alone', () => {
    expect(of('Above & Beyond').others).toBeNull();
    expect(of('Tyler, The Creator').others).toBeNull();
  });

  it('leaves a collaboration alone where the library does not hold its lead on its own', () => {
    // Skrillex is all over this folder and is still not the answer: he is not billed first,
    // and Boys Noize has no record here of his own to vouch for the ampersand.
    expect(of('Boys Noize & Skrillex').lead).toBe('Boys Noize & Skrillex');
  });

  it('files a collaboration under whoever is billed first, not under whoever is known best', () => {
    const read = credits(['Skrillex', 'Skrillex', 'Boys Noize', 'Boys Noize & Skrillex']);
    expect(read('Boys Noize & Skrillex')!.lead).toBe('Boys Noize');
  });
});

describe('what makes a join believable', () => {
  it('splits an ampersand only where the library holds that name on its own', () => {
    expect(credits(['Above & Beyond'])('Above & Beyond')!.lead).toBe('Above & Beyond');
    expect(credits(['Above', 'Above & Beyond'])('Above & Beyond')!.lead).toBe('Above');
  });

  it('believes a featuring join with no evidence at all, because nobody is called feat.', () => {
    for (const join of ['feat.', 'feat', 'ft.', 'ft', 'featuring', 'w/']) {
      const credit = `Nobody At All ${join} Sirah`;
      expect(credits([credit])(credit)!.lead).toBe('Nobody At All');
    }
  });

  it('lets a featuring credit vouch for the name it makes plain', () => {
    // Skrillex is never alone here — the `feat.` split is what puts him in evidence.
    const read = credits(['Skrillex feat. Sirah', 'Skrillex & Rick Ross']);
    expect(read('Skrillex & Rick Ross')!.lead).toBe('Skrillex');
  });

  it('reads a band whose name carries a join as a band, however well the library knows the first half', () => {
    const read = credits(['Nick Cave', 'Nick Cave and the Bad Seeds', 'Florence', 'Florence + The Machine']);
    expect(read('Nick Cave and the Bad Seeds')!.lead).toBe('Nick Cave and the Bad Seeds');
    expect(read('Florence + The Machine')!.lead).toBe('Florence + The Machine');
  });

  it('keeps the full stops in a name that ends in them', () => {
    const read = credits(['Fred again..', 'Fred again.. & Skrillex']);
    expect(read('Fred again.. & Skrillex')!.lead).toBe('Fred again..');
  });

  it('splits on no punctuation that is not a join, so a slash is part of the name', () => {
    expect(credits(['AC', 'AC/DC'])('AC/DC')!.lead).toBe('AC/DC');
  });

  it('takes the earliest join, so a list before a feature still files under the lead', () => {
    const read = credits(['Skrillex', 'Skrillex & Diplo feat. Kai']);
    expect(read('Skrillex & Diplo feat. Kai')!.lead).toBe('Skrillex');
    expect(read('Skrillex & Diplo feat. Kai')!.others).toBe('& Diplo feat. Kai');
  });

  it('falls back to the feature where the list in front of it is not vouched for', () => {
    const read = credits(['Unknown Duo & Partner feat. Kai']);
    expect(read('Unknown Duo & Partner feat. Kai')!.lead).toBe('Unknown Duo & Partner');
  });

  it('is one artist however the shift key went, and says nothing about an empty credit', () => {
    expect(credits(['skrillex', 'Skrillex & Rick Ross'])('Skrillex & Rick Ross')!.lead).toBe('Skrillex');
    expect(credits([])(null)).toBeNull();
    expect(credits([])('   ')).toBeNull();
  });
});
