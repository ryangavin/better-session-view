import { Fragment, type CSSProperties } from 'react';
import { Waveform } from '../wave/Waveform.tsx';
import './mixer.css';
import { DeckStrip } from './DeckStrip.tsx';
import { MasterStrip } from './MasterStrip.tsx';
import type { MixerViewProps } from './model.ts';
import { FramePlayhead } from './frames.tsx';

/** Controlled four-deck face. The host owns all musical state and playback policy. */
export function MixerView({ state, commands, readFrame, theme, params }: MixerViewProps) {
  const { decks, beat, loop } = state;
  return <div className="wdg play-example" style={{ '--play-signal': theme.signal, '--primary': theme.primary, '--amber': theme.primary } as CSSProperties}>
    <div className="play-timeline" aria-label="Four decks aligned to a shared 32-bar preview">
      <div className="play-wave-row play-ruler"><span title="Four aligned decks · 32 bars · global loop markers">DECKS · BARS</span><div className="play-bar-labels">{Array.from({ length: 8 }, (_, i) => <span key={i}>{Math.floor(beat / 128) * 32 + i * 4 + 1}</span>)}</div></div>
      {decks.map((d, index) => <div className="play-wave-row" style={{ '--deck-ink': theme.decks[d.id]?.ink ?? theme.primary } as CSSProperties} key={d.id}>
        <div className="play-wave-label"><b>{d.letter}</b><span>{d.track?.title ?? d.message ?? 'Empty deck'}</span></div>
        <div className="play-wave-lane">
          <Waveform peaks={d.peaks} ink={theme.decks[d.id]?.waveform ?? theme.primary} height={48} label={`Deck ${index + 1} waveform on the shared beat grid`} />
          {loop.start !== null && <div className="play-loop-region" data-enabled={loop.enabled} style={{ left: `${Math.max(0, loop.start - Math.floor(beat / 128) * 128) / 128 * 100}%`, width: `${Math.max(0, Math.min(128, (loop.end ?? loop.start) - Math.floor(beat / 128) * 128) - Math.max(0, loop.start - Math.floor(beat / 128) * 128)) / 128 * 100}%`, '--loop-ink': 'var(--amber)' } as CSSProperties}><span>{loop.end === null ? 'IN' : `↻ ${loop.end - loop.start} beats`}</span></div>}
          <span className="play-wave-grid" />
          <FramePlayhead readFrame={readFrame} deckId={d.id} />
        </div>
      </div>)}
    </div>
    <div className="play-scroll"><div className="play-decks">
      {decks.map((deck, index) => <Fragment key={deck.id}>
        <DeckStrip deck={deck} index={index} commands={commands} readFrame={readFrame} theme={theme} params={params} />
        {index === 1 && <MasterStrip state={state} commands={commands} readFrame={readFrame} theme={theme} params={params} />}
      </Fragment>)}
    </div></div>

  </div>;
}
