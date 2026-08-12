import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLUMN_WIDTHS,
  loadColumnWidth,
  viewportColumnLayout,
} from './columnWidth.js';

describe('column widths', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers only the usable fixed presets', () => {
    expect(COLUMN_WIDTHS).toEqual(['m', 'l', 'auto', '8', '16']);
  });

  it('uses Narrow as the Auto readability floor', () => {
    expect(viewportColumnLayout('auto', 40, 1100).col).toBe(74);
  });

  it('migrates the removed Small preference to Narrow', () => {
    vi.stubGlobal('localStorage', { getItem: () => 's' });
    expect(loadColumnWidth()).toBe('m');
  });
});
