import { useEffect } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import type { Mix } from '../state.ts';
import { bpmText } from '../warp.ts';
import './ExportModal.css';

/**
 * What is about to be written, and the last chance to change it.
 *
 * The slice list lives here rather than in a rail, which is where it moved when
 * the rail went. That turns out to be the better home: naming eight slices is
 * something you do once, immediately before writing the pack, and a list that
 * sat open all session was eight rows of chrome competing with the lanes for a
 * job nobody was doing yet. The ruler above the lanes is still where you *see*
 * a slice is in the wrong place; this is where you name it.
 *
 * It says the numbers rather than showing a spinner, because the whole cost of
 * getting this wrong is discovering it inside Live.
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

  if (!mix.song) return null;
  const song = mix.song;
  const stems = song.sources.length;
  const folder = song.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const facts: [string, string][] = [
    ['track', song.artist ? `${song.title} · ${song.artist}` : song.title],
    ['clips', `${mix.slices.length} slices × ${stems} stems = ${mix.slices.length * stems}`],
    ['tempo', `${bpmText(mix.targetBpm)} BPM${mix.bpmAuto ? ' · fitted' : ' · set by hand'}`],
    ['length', `${mix.bars} bars · ${Math.round(mix.seconds)}s`],
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
          tempo and looped to its own length. The audio is written beside the set, so the
          pack survives being moved.
        </p>

        <div className="mf-modal-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>

        <div className="mf-modal-slices">
          <div className="mf-modal-slice-head">
            <span>#</span>
            <span>slice</span>
            <span>bar</span>
            <span>len</span>
          </div>
          {mix.slices.map((slice, i) => {
            const next = mix.slices[i + 1]?.bar ?? mix.bars;
            return (
              <div
                key={i}
                className="mf-modal-slice"
                data-on={i === mix.activeSlice || undefined}
                onClick={() => mix.setActiveSlice(i)}
              >
                <span className="mf-modal-slice-num">{String(i + 1).padStart(2, '0')}</span>
                <input
                  type="text"
                  value={slice.name}
                  onChange={(e) => mix.rename(i, e.target.value)}
                  aria-label={`Name of slice ${i + 1}`}
                />
                <span className="mf-modal-slice-fact">{slice.bar + 1}</span>
                <span className="mf-modal-slice-fact">{next - slice.bar}</span>
              </div>
            );
          })}
        </div>

        {/* The tempo is not editable from here any more. It is the grid's
            number rather than the export's — the lanes are ruled with it and
            the warp lane is how you tell whether it is right — so it lives on
            the header beside Auto-warp, and this says what will be written. */}
        <div className="mf-modal-tempo">
          <span className="mf-cap">warp to</span>
          <span className="mf-modal-warp">{bpmText(mix.targetBpm)} BPM</span>
          <span className="mf-modal-path">~/Music/mixflow/{folder}/</span>
        </div>

        <div className="mf-modal-actions">
          <Button onPress={close} className="mf-primary">
            Write .als
          </Button>
          <Button onPress={close}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
