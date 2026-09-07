// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { hintAttribute, hintFor, HINT_ATTRIBUTE } from './hint.ts';

/** Markup from a string, so each case reads as the DOM it is about. */
function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

const at = (root: HTMLElement, selector: string) =>
  hintFor(root.querySelector(selector) as Element);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('what the strip is told', () => {
  it('reads a hint off the element under the pointer', () => {
    const root = mount('<button data-hint="Play from the head">go</button>');
    expect(at(root, 'button')).toBe('Play from the head');
  });

  it('walks up to find one', () => {
    // Every control has parts inside it — a caption, an arc, a caret — and the
    // pointer is nearly always on one of those rather than on the root.
    const root = mount(
      '<div data-hint="How loud this stem is"><span class="wdg-caption">Bass</span></div>',
    );
    expect(at(root, '.wdg-caption')).toBe('How loud this stem is');
  });

  it('falls back to a title, which is what makes opting in free', () => {
    const root = mount('<button title="Export the mix">go</button>');
    expect(at(root, 'button')).toBe('Export the mix');
  });

  it('walks up for a title too', () => {
    const root = mount('<div title="Export the mix"><span>go</span></div>');
    expect(at(root, 'span')).toBe('Export the mix');
  });

  it('says nothing about something that explains nothing', () => {
    const root = mount('<div><span>go</span></div>');
    expect(at(root, 'span')).toBeNull();
  });

  it('is null for a target that is not an element', () => {
    expect(hintFor(null)).toBeNull();
    expect(hintFor(document.createTextNode('go'))).toBeNull();
  });
});

describe('which one wins', () => {
  it('prefers a hint to the title on the very same element', () => {
    const root = mount('<button data-hint="Longer words" title="Short">go</button>');
    expect(at(root, 'button')).toBe('Longer words');
  });

  it('prefers a hint on the root to the title on the body inside it', () => {
    // This is the shape every control has: `hint` lands on the root and
    // `title` on the interactive body, so the title is always the *closer* of
    // the two. A rule that took the nearest of either would never show a hint.
    const root = mount(
      '<div data-hint="Longer words"><div class="wdg-body" title="Short"><span>x</span></div></div>',
    );
    expect(at(root, 'span')).toBe('Longer words');
  });

  it('takes the nearest hint when hints are nested', () => {
    const root = mount('<div data-hint="The rail"><button data-hint="Import">+</button></div>');
    expect(at(root, 'button')).toBe('Import');
  });

  it('takes the nearest title when titles are nested', () => {
    const root = mount('<div title="The rail"><button title="Import">+</button></div>');
    expect(at(root, 'button')).toBe('Import');
  });

  it('treats a blank hint as absent so the title still answers', () => {
    const root = mount('<button data-hint="  " title="Export the mix">go</button>');
    expect(at(root, 'button')).toBe('Export the mix');
  });

  it('trims what it hands back', () => {
    const root = mount('<button data-hint="  Play from the head ">go</button>');
    expect(at(root, 'button')).toBe('Play from the head');
  });
});

describe('the attribute a control spreads', () => {
  it('is nothing at all when there is no hint', () => {
    // Absent rather than empty, so an unhinted control is transparent to
    // `closest()` and whatever encloses it can answer for it.
    expect(hintAttribute(undefined)).toEqual({});
  });

  it('is the hint when there is one', () => {
    expect(hintAttribute('Play from the head')).toEqual({
      [HINT_ATTRIBUTE]: 'Play from the head',
    });
  });
});
