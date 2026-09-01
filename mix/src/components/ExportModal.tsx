import { useEffect } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { BARS } from '../mock.ts';
import type { Mix } from '../state.ts';
import './ExportModal.css';

/**
 * What is about to be written, before it is written.
 *
 * A clip pack is one `.als` and a directory of audio, and the numbers below are
 * the ones you can still change your mind about — how many clips, at what
 * tempo, where. It says them rather than showing a spinner, because the whole
 * cost of getting this wrong is discovering it inside Live.
 */
export function ExportModal({ mix }: { mix: Mix }) {
  const close = () => mix.setExporting(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const stems = mix.song.separated.length;
  const lines: [string, string][] = [
    ['track', mix.song.title],
    ['clips', `${mix.slices.length} slices × ${stems} stems = ${mix.slices.length * stems}`],
    ['tempo', `${mix.targetBpm} BPM${mix.bpmAuto ? ' · detected' : ' · set by hand'}`],
    ['length', `${BARS} bars`],
    ['into', `~/Music/mixflow/${mix.song.title.toLowerCase().replace(/\s+/g, '-')}/`],
  ];

  return (
    <div className="mf-scrim" onClick={close} role="presentation">
      <div
        className="mf-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Export clip pack"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mf-modal-title">export clip pack</p>
        <p className="mf-modal-blurb">
          One Session row per slice, one track per stem, every clip warped to the target
          tempo and looped to its own length. The audio is written beside the set so the
          pack survives being moved.
        </p>
        <div className="mf-modal-facts">
          {lines.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="mf-modal-actions">
          <Button onPress={close} className="mf-primary">
            Write .als
          </Button>
          <Button onPress={close} tone="quiet">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
