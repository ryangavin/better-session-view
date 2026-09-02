import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal.tsx';

describe('Modal anatomy', () => {
  it('is a dialog named by its title, so the top layer and the focus trap are the browser’s', () => {
    const html = renderToStaticMarkup(
      h(Modal, { title: 'delete take', onClose: () => {} }, 'gone for good'),
    );
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="delete take"');
    expect(html).toContain('gone for good');
  });

  it('carries a close button, because escape and the scrim are both invisible', () => {
    const html = renderToStaticMarkup(h(Modal, { title: 'ask', onClose: () => {} }));
    expect(html).toContain('wdg-modal-close');
    expect(html).toContain('aria-label="Close"');
  });

  it('prefers an explicit label over the printed title', () => {
    const html = renderToStaticMarkup(
      h(Modal, { title: 'export', label: 'Export stems', onClose: () => {} }),
    );
    expect(html).toContain('aria-label="Export stems"');
  });

  it('leaves out the actions row when the caller passes no buttons', () => {
    const bare = renderToStaticMarkup(h(Modal, { title: 'ask', onClose: () => {} }));
    const acted = renderToStaticMarkup(
      h(Modal, { title: 'ask', onClose: () => {}, actions: h('button', null, 'Do it') }),
    );
    expect(bare).not.toContain('wdg-modal-actions');
    expect(acted).toContain('wdg-modal-actions');
  });

  it('takes its width as a variable rather than a hard-coded box', () => {
    const html = renderToStaticMarkup(h(Modal, { title: 'ask', onClose: () => {}, width: 620 }));
    expect(html).toContain('--wdg-modal-width:620px');
  });
});
