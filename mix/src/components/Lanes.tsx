import { useMemo } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Slider } from '@openflow/widgets/controls/Slider.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { BARS, STEMS } from '../mock.ts';
import { peaksFor } from '../peaks.ts';
import type { Mix } from '../state.ts';
import { Waveform } from './Waveform.tsx';
import './Lanes.css';

/**
 * The separated track: what the grid thinks the tempo is, where the slices
 * fall, and one lane per source.
 *
 * The head of every lane is 168px of controls and the rest is the drawing, so
 * the six waveforms share one horizontal scale and a transient in the drums
 * lines up with the one in the bass. That is the only reason the head is a
 * fixed width rather than a fraction.
 */

/**
 * A stem's level, as a parameter rather than a number, so the fader is a fader —
 * the drag, the fine modifier and double-click-to-unity all come with it.
 *
 * Deliberately unnamed: `Slider` captions itself from `shortName`, and the head
 * is 168px with the reading already in the row above.
 */
const LEVEL: Param = {
  kind: 'float',
  min: 0,
  max: 1,
  defaultValue: 0.8,
  unit: 'percent',
};

const SNAP = ['1/1', '1/2', '1/4'];

/** Columns of peaks per lane. Enough to read a sixteenth at this width. */
const COLUMNS = 900;

/**
 * The fader's drawn length, which is the head minus its padding and the two
 * buttons.
 *
 * A number rather than `layout="inside"`, and the difference is not cosmetic:
 * an inside row deliberately has no fill, because a parameter on a node row is
 * a *where* and a fill invents a left-hand side that means nothing. A fader is
 * the case that doc carves out — its own length is what it is saying — so it
 * wants the fill and the gearing that comes with a known length.
 */
const FADER = 96;

/** Unity is 0.8, so a fader reads as trim either side of where it rests. */
const trim = (volume: number): string => {
  const db = (volume - 0.8) * 30;
  return `${db > 0.05 ? '+' : ''}${db.toFixed(1)} dB`;
};

export function Lanes({ mix }: { mix: Mix }) {
  const sources = mix.song.separated;

  const peaks = useMemo(
    () =>
      Object.fromEntries(
        sources.map((id) => [id, peaksFor(id, mix.song.id, BARS, COLUMNS)]),
      ),
    [sources, mix.song.id],
  );

  const confident = mix.song.bpm % 2 === 0;

  return (
    <div className="mf-lanes">
      <div className="mf-gridbar">
        <span className="mf-cap">grid</span>
        <span className="mf-gridbar-bpm">{mix.song.bpm.toFixed(2)} BPM</span>
        <span className="mf-gridbar-conf" data-sure={confident || undefined}>
          {confident ? 'confident' : 'check the downbeat'}
        </span>
        <span className="mf-rule" />
        <span className="mf-gridbar-note">{mix.song.key} · {BARS} bars · {mix.song.format}</span>
        <div className="mf-gridbar-gap" />
        <Segmented
          items={SNAP}
          index={SNAP.indexOf(mix.snap)}
          onChange={(next) => mix.setSnap(SNAP[next])}
          label="Snap"
          name="snap"
          title="Where a slice point lands when you drag it"
        />
        <Button onPress={() => undefined} tone="quiet" title="Re-run detection and re-anchor the downbeats">
          auto-warp
        </Button>
      </div>

      <div className="mf-ruler">
        <div className="mf-lane-head mf-ruler-head">
          <span className="mf-cap">slices</span>
          <span className="mf-hint">drag an edge</span>
        </div>
        <div className="mf-ruler-track">
          {mix.slices.map((slice, i) => {
            const next = mix.slices[i + 1]?.bar ?? BARS;
            return (
              <button
                key={i}
                type="button"
                className="mf-slice"
                data-on={i === mix.activeSlice || undefined}
                style={{
                  left: `${(slice.bar / BARS) * 100}%`,
                  width: `${((next - slice.bar) / BARS) * 100}%`,
                }}
                onClick={() => mix.setActiveSlice(i)}
              >
                <span className="mf-slice-num">{i + 1}</span>
                <span className="mf-slice-name">{slice.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mf-lane-list">
        {STEMS.map((stem) => {
          const present = sources.includes(stem.id);
          const own = mix.level[stem.id];
          const heard = present && mix.audible(stem.id);
          return (
            <div
              key={stem.id}
              className="mf-lane"
              data-absent={!present || undefined}
              style={{ '--stem': stem.ink } as never}
            >
              <div className="mf-lane-head">
                <div className="mf-lane-name">
                  <span className="mf-dot" />
                  <span className="mf-lane-label">{stem.name}</span>
                  <span className="mf-lane-db">
                    {present ? trim(own.volume) : '—'}
                  </span>
                </div>
                <div className="mf-lane-controls">
                  <Toggle
                    on={present && own.muted}
                    onChange={(next) => mix.adjust(stem.id, { muted: next })}
                    disabled={!present}
                    label={`Mute ${stem.name}`}
                    title="Mute"
                    width={20}
                  >
                    M
                  </Toggle>
                  <Toggle
                    on={present && own.soloed}
                    onChange={(next) => mix.adjust(stem.id, { soloed: next })}
                    disabled={!present}
                    label={`Solo ${stem.name}`}
                    title="Solo"
                    width={20}
                    className="mf-solo"
                  >
                    S
                  </Toggle>
                  <Slider
                    param={LEVEL}
                    value={own.volume}
                    onChange={(next) => mix.adjust(stem.id, { volume: next })}
                    disabled={!present}
                    orientation="horizontal"
                    length={FADER}
                    showValue={false}
                    label={`${stem.name} level`}
                    className="mf-fader"
                  />
                </div>
              </div>
              <div className="mf-lane-draw">
                {present ? (
                  <Waveform
                    peaks={peaks[stem.id] ?? []}
                    ink={`var(--stem-${stem.id})`}
                    quiet={!heard}
                    height={46}
                    bars={BARS}
                  />
                ) : (
                  <span className="mf-lane-none">folded into Other by {mix.song.model}</span>
                )}
              </div>
            </div>
          );
        })}
        <div
          className="mf-playhead"
          style={{ left: `calc(var(--lane-head) + (100% - var(--lane-head)) * ${mix.bar / BARS})` }}
        />
      </div>
    </div>
  );
}
