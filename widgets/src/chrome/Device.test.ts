import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Device, DevicePortRow } from './Device.js';
import { Port } from './Port.js';

describe('Device anatomy', () => {
  it('keeps the ordinary no-port body as the default', () => {
    const html = renderToStaticMarkup(h(Device, { name: 'Plain' }, 'face'));
    expect(html).toContain('<div class="wdg-device-body">face</div>');
    expect(html).not.toContain('wdg-device-main');
    expect(html).not.toContain('wdg-device-row-face');
  });

  it('keeps the legacy rails when ports are passed without rows', () => {
    const html = renderToStaticMarkup(
      h(
        Device,
        {
          name: 'Rail',
          inlets: h(Port, { id: 'in', side: 'in', label: 'In' }),
          outlets: h(Port, { id: 'out', side: 'out', label: 'Out' }),
        },
        'face',
      ),
    );
    expect(html).toContain('wdg-device-main');
    expect(html).toContain('wdg-device-ports');
    expect(html).not.toContain('wdg-device-row-face');
  });

  it('opts into fixed bands and aligned rows only when portRows is present', () => {
    const inlet = h(Port, {
      id: 'depth',
      side: 'in',
      label: 'Depth',
      showLabel: false,
    });
    const html = renderToStaticMarkup(
      h(Device, {
        name: 'Rows',
        overlay: h('canvas'),
        chooser: h('select', { 'aria-label': 'Choose' }),
        outlets: h(Port, { id: 'out', side: 'out', label: 'Out' }),
        portRows: h(DevicePortRow, { inlet }, 'depth'),
      }),
    );
    expect(html).toContain('data-port-layout="rows"');
    expect(html).toContain('wdg-device-overlay');
    expect(html).toContain('wdg-device-outlets');
    expect(html).toContain('wdg-device-chooser');
    expect(html).toContain('wdg-device-port-row');
    expect(html).toContain('aria-label="Depth"');
    expect(html).not.toContain('<span class="wdg-port-label">Depth</span>');
  });
});
