import { Fragment, type CSSProperties } from 'react';
import { Waveform } from '../wave/Waveform.tsx';
import './mixer.css';
import { DeckStrip } from './DeckStrip.tsx';
import { MasterStrip } from './MasterStrip.tsx';
import type { MixerViewProps } from './model.ts';
import { WaveControls } from './WaveControls.tsx';
import { FramePlayhead, FrameWaveform } from './frames.tsx';

/** Controlled four-deck face. The host owns all musical state and playback policy. */
export function MixerView({ state, commands, readFrame, theme, params, deckProps, externalTransport }: MixerViewProps) {
  const { decks, beat, loop } = state;
  return <div className="wdg play-example" style={{ '--play-signal': theme.signal, '--primary': theme.primary, '--amber': theme.primary, '--play-deck-min': `${Math.max(200, ...decks.map(d => 56 + d.stems.length * 36))}px` } as CSSProperties}>
    <div className="play-timeline" aria-label="Four decks aligned to a shared 32-bar preview">
      {decks.map((d, index) => <div {...deckProps?.(d.id)} className={`play-wave-row ${deckProps?.(d.id)?.className ?? ''}`} style={{ '--deck-ink': theme.decks[d.id]?.ink ?? theme.primary } as CSSProperties} key={d.id}>
        <div className="play-wave-label"><b>{d.letter}</b><span>{d.track?.title ?? d.message ?? 'Empty deck'}</span></div>
        <div className="play-wave-lane"><WaveControls deck={d} index={index} commands={commands} readFrame={readFrame}>
          <>{d.waveform ? <FrameWaveform deck={d} index={index} ink={theme.decks[d.id]?.waveform ?? theme.primary} readFrame={readFrame} /> : <><Waveform peaks={d.peaks} ink={theme.decks[d.id]?.waveform ?? theme.primary} height={48} label={`Deck ${index + 1} waveform on the shared beat grid`} />
          {loop.start !== null && <div className="play-loop-region" data-enabled={loop.enabled} style={{ left: `${Math.max(0, loop.start - Math.floor(beat / 128) * 128) / 128 * 100}%`, width: `${Math.max(0, Math.min(128, (loop.end ?? loop.start) - Math.floor(beat / 128) * 128) - Math.max(0, loop.start - Math.floor(beat / 128) * 128)) / 128 * 100}%`, '--loop-ink': 'var(--amber)' } as CSSProperties}><span>{loop.end === null ? 'IN' : `↻ ${loop.end - loop.start} beats`}</span></div>}
          <span className="play-wave-grid" />
          <FramePlayhead readFrame={readFrame} deckId={d.id} /></>}</>
        </WaveControls></div>
      </div>)}
    </div>
    <div className="play-scroll"><div className="play-decks">
      {decks.map((deck, index) => <Fragment key={deck.id}>
        <DeckStrip deckProps={deckProps} deck={deck} index={index} commands={commands} readFrame={readFrame} theme={theme} params={params} />
        {index === 1 && <MasterStrip externalTransport={externalTransport} state={state} commands={commands} readFrame={readFrame} theme={theme} params={params} />}
      </Fragment>)}
    </div></div>

  </div>;
}
