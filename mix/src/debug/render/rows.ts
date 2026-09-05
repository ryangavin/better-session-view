import { laneOrder, STEMS } from '../../mock.ts';

/** Labels, colors and buffer lookup share one source ID, independent of decode order. */
export function renderRows(sources: readonly string[], stress = false) {
  const ids = laneOrder(sources);
  if (!ids.length) return [];
  return Array.from({ length: stress ? 6 : ids.length }, (_, i) => {
    const id = ids[i % ids.length];
    const stem = STEMS.find((s) => s.id === id);
    const copy = i >= ids.length;
    return { key: `${id}-${i}`, id, label: `${(stem?.name ?? id).toLowerCase()}${copy ? ' (copy)' : ''}`, ink: stem?.ink ?? 'var(--stem-other)' };
  });
}
