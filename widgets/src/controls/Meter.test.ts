import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Meter } from './Meter.js';

describe('Meter frame', () => {
  it('preserves the caption-over-meter default without adding a reading', () => {
    const html = renderToStaticMarkup(h(Meter, { value: 0.62, name: 'Level' }));
    expect(html).toContain('data-layout="stacked"');
    expect(html).toContain('<span class="wdg-caption">Level</span>');
    expect(html).not.toContain('wdg-readout');
  });

  it('can put its caption and reading inside the bar', () => {
    const html = renderToStaticMarkup(
      h(Meter, { value: 0.62, name: 'Energy', layout: 'inside', showValue: true }),
    );
    expect(html).toContain('data-layout="inside"');
    expect(html).toContain('<span class="wdg-readout">62</span>');
    expect(html).toContain('role="meter"');
  });

  it('accepts an authoritative reading', () => {
    const html = renderToStaticMarkup(
      h(Meter, {
        value: 0.62,
        name: 'Energy',
        layout: 'inside',
        showValue: true,
        display: 'live',
      }),
    );
    expect(html).toContain('<span class="wdg-readout">live</span>');
  });
});
