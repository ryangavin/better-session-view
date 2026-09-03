import type { ReactNode } from 'react';
import { Button } from '../controls/Button.tsx';
import { clock } from './axis.ts';
import './debug.css';

/**
 * Play, stop and where the head is.
 *
 * No audio in here: a harness owns whatever engine it has and hands this the
 * three facts a person needs — is it playing, where is it, and how late does
 * the output land. The button is the only control, because what plays and how
 * is the toolbar's business.
 */
export interface TransportProps {
  playing: boolean;
  onToggle(): void;
  /** The head, in seconds. */
  at: number;
  /** The output's latency in seconds, when the engine reports one. */
  latency?: number;
  disabled?: boolean;
  children?: ReactNode;
}

export function Transport({ playing, onToggle, at, latency, disabled, children }: TransportProps) {
  return (
    <span className="wdg wdg-transport">
      <Button onPress={onToggle} disabled={disabled} width={48} label={playing ? 'Stop' : 'Play'}>
        {playing ? 'stop' : 'play'}
      </Button>
      <span className="wdg-transport-clock">{clock(at)}</span>
      {latency !== undefined && (
        <span className="wdg-transport-latency" title="the output's latency, as the engine reports it">
          {Math.round(latency * 1000)} ms
        </span>
      )}
      {children}
    </span>
  );
}
