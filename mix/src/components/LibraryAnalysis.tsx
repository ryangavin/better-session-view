import { ButtonFace } from '@openflow/widgets/controls/ButtonFace.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { openflow, type Track } from '../openflow.ts';
import { STEMS } from '../mock.ts';
import { waveformPainter } from '@openflow/widgets/theme/spectral.ts';
// Use the provider's entry: a separately optimized context.ts can become a second context in Vite.
import { useTheme } from '@openflow/widgets/theme/ThemeRoot.tsx';
import { libraryOverview, LIBRARY_ENVELOPE_HEIGHT, type LibraryColumn } from '../libraryOverview.ts';
import { onScanChange } from '../scanChanges.ts';

// Disk-cache reads only, limited to two at once. Rows never start audio analysis.
let reading = 0;
const waiting: (() => void)[] = [];
async function readOverview(song: Track, cancelled: () => boolean): Promise<LibraryColumn[] | null> {
  if (reading >= 2) await new Promise<void>(resolve => waiting.push(resolve));
  else reading++;
  try {
    if (cancelled()) return null;
    const api = openflow();
    return libraryOverview(await api?.analysis.scans(song.id, song.stems ?? '') ?? null);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else reading--;
  }
}

export function LibraryAnalysis({ song, root }: { song: Track; root: string | null }) {
  const element = useRef<HTMLSpanElement>(null);
  const [columns, setColumns] = useState<LibraryColumn[] | null>(null);
  const [status, setStatus] = useState<'empty' | 'pending' | 'failed'>('empty');
  const theme = useTheme();
  const treatment = theme.spectral.mode === 'spectral' ? theme.spectral.waveform : undefined;
  const paint = useMemo(() => waveformPainter(theme.spectral, theme.waveformBase, theme.waveformSilence),
    [theme.spectral, theme.waveformBase, theme.waveformSilence]);
  useEffect(() => {
    let cancelled = false, visible = false, dirty = true, inFlight = false, revision = 0;
    setColumns(null);
    setStatus('empty');
    const load = () => {
      if (cancelled || !visible || !dirty || inFlight) return;
      dirty = false; inFlight = true;
      const started = revision;
      setStatus('pending');
      void readOverview(song, () => cancelled).then(result => {
        if (!cancelled && started === revision) { setColumns(result); setStatus('empty'); }
      }, () => {
        if (!cancelled && started === revision) setStatus('failed');
      }).finally(() => { inFlight = false; load(); });
    };
    const node = element.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      load();
    });
    const unsubscribe = onScanChange(root, song.id, () => { revision++; dirty = true; load(); });
    observer.observe(node);
    return () => { cancelled = true; observer.disconnect(); unsubscribe(); };
  // Geometry producer identity also invalidates cached paths during a visual hot update.
  }, [song, root, libraryOverview]);

  // Cached paths carry their coordinate space; never paint a prior geometry in a new viewBox.
  const envelope = columns?.[0]?.height === LIBRARY_ENVELOPE_HEIGHT ? columns : null;
  const description = envelope ? 'Saved whole-song envelope' : status === 'pending' ? 'Loading saved waveform'
    : status === 'failed' ? 'Could not read saved waveform' : 'No saved original waveform';
  return <span ref={element} className="mf-library-analysis" role="img" aria-label={description} title={description}>
    {envelope ? <svg viewBox={`0 0 68 ${envelope[0].height}`} aria-hidden="true" style={{background:treatment?.background}}>{envelope.map((column, index) =>
      <path key={index} d={column.path} stroke={paint(column.energy)} strokeWidth="1" opacity={treatment?.fillOpacity} />)}</svg>
      : <span className="mf-library-analysis-empty" aria-hidden="true">—</span>}
  </span>;
}

/** Colored tiles represent existing sources; a neutral tile marks an unseparated mix. */
export function LibraryStems({ sources, title, onSeparate }: { sources: readonly string[]; title?: string; onSeparate?(): void }) {
  const available = STEMS.filter(stem => sources.includes(stem.id));
  const description = available.length ? `Available stems: ${available.map(stem => stem.name).join(', ')}` : 'No separated stems';
  if (!available.length && onSeparate) {
    const label = `Generate stems for ${title ?? 'this track'}`;
    return <span className="mf-library-stem-cell"><ButtonFace tone="quiet" className="mf-library-separate" aria-label={label} title={label}
      draggable onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); onSeparate(); }}>
      <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M1 7H6M6 3V11M6 3H14M6 7H14M6 11H14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ButtonFace></span>;
  }
  return <span className="mf-library-stem-cell" role="img" aria-label={description} title={description}>
    {available.length ? <span className="mf-library-stem-tiles" aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${available.length > 4 ? 3 : Math.min(2, available.length)}, 6px)` }}>
      {available.map(stem => <span key={stem.id} data-stem={stem.id} style={{ background: stem.ink }} />)}
    </span> : <span className="mf-library-stem-empty" aria-hidden="true" />}
  </span>;
}
