import { useEffect, useRef } from 'react';
import type { Measurement } from './measure.ts';
import type { Features } from './features.ts';
import { drawCollapsedLasagna } from './excursions.ts';

const SOURCES = [
  ['vocals', 'V', '#ff65af'], ['drums', 'D', '#ffbe45'], ['bass', 'B', '#7975ff'],
  ['guitar', 'G', '#9de25a'], ['piano', 'P', '#ca94ff'], ['other', 'O', '#53decc'],
] as const;

export function PocketStudies({ data, features, title }: { data: Measurement; features: Features; title: string }) {
  return <section className="mf-pocket-studies" aria-label="Library waveform studies">
    <div className="mf-wave-direction-intro"><b>A whole song in a little space</b><span>Same track, actual sizes. The RGB shape describes the music; the six-letter shelf identifies available stems. These thumbnails always show the whole song.</span></div>
    <div className="mf-pocket-grid">
      {[160, 96, 64].map((width, i) => <article className="mf-pocket-card" key={width}>
        <header><b>{['Room to breathe', 'Pocket record', 'Postage stamp'][i]}</b><span>{width} × 32 px</span></header>
        <div className="mf-pocket-library"><span className="mf-pocket-title" title={title}>{title}</span><Thumbnail data={data} features={features} width={width} /></div>
        <p>{['Enough space to read the larger transitions.', 'A compact balance of song shape and stem identity.', 'The smallest trial: a fingerprint, with less structural detail.'][i]}</p>
      </article>)}
    </div>
    <p className="mf-wave-note">V vocals · D drums · B bass · G guitar · P piano · O other. Colored letters = decoded stem available; a dash = unavailable. Availability does not mean the instrument is audible throughout.</p>
  </section>;
}

function Thumbnail({ data, features, width }: { data: Measurement; features: Features; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const available = new Set(data.stems.map((s) => s.id));
  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext('2d');
    if (!el || !g) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.round(width * ratio);
    el.height = Math.round(20 * ratio);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawCollapsedLasagna(g, { from: 0, to: data.seconds, width, height: 20 }, { data, features, sections: [] });
  }, [data, features, width]);
  const description = `Whole-song RGB waveform. Available stems: ${data.stems.map((s) => s.id).join(', ')}.`;
  return <div className="mf-pocket-thumbnail" style={{ width }} role="img" aria-label={description} title={description}>
    <canvas ref={canvas} style={{ width, height: 20 }} aria-hidden="true" />
    <div className="mf-pocket-sources" aria-hidden="true">{SOURCES.map(([id, letter, color]) => <span key={id} style={{ color: available.has(id) ? color : '#666575', borderTopColor: available.has(id) ? color : '#292833' }}>{available.has(id) ? letter : '–'}</span>)}</div>
  </div>;
}
