import { useEffect } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { BARS } from '../mock.ts';
import type { Mix } from '../state.ts';
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

/**
 * Unnamed for the same reason the fader is: the row already says "warp to".
 *
 * And unfilled. `NumberField` draws the value as a bar behind the text by
 * default, which is right for a parameter whose range is a *how much* — a
 * tempo's is not. 124 of a 60-to-200 range is 46% of nothing, and it is the
 * loudest thing in the row while carrying the least, which is the same
 * argument `widgets/docs/catalogue.md` makes about a fill on a node row.
 */
const BPM: Param = {
  kind: 'float',
  min: 60,
  max: 200,
  defaultValue: 120,
  unit: 'custom',
  customUnit: '%0.0f BPM',
};

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
  const folder = mix.song.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const facts: [string, string][] = [
    ['track', `${mix.song.title} · ${mix.song.artist}`],
    ['clips', `${mix.slices.length} slices × ${stems} stems = ${mix.slices.length * stems}`],
    ['tempo', `${mix.targetBpm} BPM${mix.bpmAuto ? ' · detected' : ' · set by hand'}`],
    ['length', `${BARS} bars`],
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
            const next = mix.slices[i + 1]?.bar ?? BARS;
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

        <div className="mf-modal-tempo">
          <span className="mf-cap">warp to</span>
          <NumberField
            param={BPM}
            value={mix.targetBpm}
            onChange={(next) => {
              mix.setTargetBpm(Math.round(next));
              mix.setBpmAuto(false);
            }}
            editable
            showFill={false}
            width={72}
            label="Target tempo"
          />
          <Toggle
            on={mix.bpmAuto}
            onChange={(next) => {
              mix.setBpmAuto(next);
              if (next) mix.setTargetBpm(mix.song.bpm);
            }}
            label="Use the detected tempo"
            title="Snap the target back to the detected tempo"
            width={34}
          >
            auto
          </Toggle>
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
