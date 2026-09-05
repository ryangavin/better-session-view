import { describe, expect, it } from 'vitest';
import { renderRows } from './rows.ts';

describe('rendering lab stem identity', () => {
  it('keeps SOFI’s source order from putting drum audio under a vocal label', () => {
    expect(renderRows(['drums', 'bass', 'other', 'vocals']).map(({ id, label, ink }) => ({ id, label, ink }))).toEqual([
      { id: 'vocals', label: 'vocals', ink: 'var(--stem-vocals)' },
      { id: 'drums', label: 'drums', ink: 'var(--stem-drums)' },
      { id: 'bass', label: 'bass', ink: 'var(--stem-bass)' },
      { id: 'other', label: 'other', ink: 'var(--stem-other)' },
    ]);
    expect(renderRows(['other', 'vocals', 'bass', 'drums'])).toEqual(renderRows(['drums', 'bass', 'other', 'vocals']));
  });
  it('shows all six real sources in track mode and identifies stress-test copies', () => {
    expect(renderRows(['other', 'piano', 'guitar', 'bass', 'drums', 'vocals']).map((r) => r.id)).toEqual(['vocals', 'drums', 'bass', 'guitar', 'piano', 'other']);
    const rows = renderRows(['drums', 'bass', 'other', 'vocals'], true);
    expect(rows.slice(4).map((r) => [r.id, r.label])).toEqual([['vocals', 'vocals (copy)'], ['drums', 'drums (copy)']]);
    expect(renderRows([])).toEqual([]);
  });
});
