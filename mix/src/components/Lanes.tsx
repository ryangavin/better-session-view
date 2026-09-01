import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Slider } from '@openflow/widgets/controls/Slider.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { STEMS } from '../mock.ts';
import type { Mix } from '../state.ts';
import { Waveform } from './Waveform.tsx';
import { WarpLane } from './WarpLane.tsx';
import './Lanes.css';

/**
 * The separated track: the mix as a whole, where the grid sits, and one lane
 * per source.
 *
 * The head of every row is the same width, so the six waveforms share one
 * horizontal scale and a transient in the drums lines up with the one in the
 * bass. That is the only reason it is a fixed width rather than a fraction, and
 * it is why the band above the lanes carries a head of its own that draws
 * nothing but the mix summary.
 */

/**
 * A stem's level, as a parameter rather than a number, so the fader is a fader —
 * the drag, the fine modifier and double-click-to-unity all come with it.
 *
 * Deliberately unnamed: `Slider` captions itself from `shortName`, and the row
 * has no room for a caption that would say the same thing as the stem's name
 * two controls to the left.
 */
const LEVEL: Param = { kind: 'float', min: 0, max: 1, defaultValue: 0.8, unit: 'percent' };

/**
 * The fader's drawn length.
 *
 * A number rather than `layout="inside"`, and the difference is not cosmetic:
 * an inside row deliberately has no fill, because a parameter on a node row is
 * a *where* and a fill invents a left-hand side that means nothing. A fader is
 * the case that doc carves out — its own length is what it is saying.
 */
const FADER = 46;

/** Unity is 0.8, so a fader reads as trim either side of where it rests. */
const trim = (volume: number): string => {
  const db = Math.round((volume - 0.8) * 30);
  return db === 0 ? '0' : `${db > 0 ? '+' : ''}${db}`;
};

const again = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" />
  </svg>
);

export function Lanes({ mix }: { mix: Mix }) {
  const song = mix.song;
  const sources = song?.sources ?? [];
  const bars = mix.bars;

  if (!song) return null;

  return (
    <div className="mf-lanes">
      {mix.manual && <ManualBar mix={mix} />}

      <div className="mf-band">
        <div className="mf-head mf-band-head">
          <div className="mf-band-top">
            <span className="mf-cap">mix</span>
            <div className="mf-band-actions">
              <Button
                onPress={mix.resetMix}
                disabled={mix.touched === 0}
                title="Return every stem to unity, unmuted, unsoloed"
              >
                Reset
              </Button>
              <Button
                onPress={() => void mix.separate()}
                label="Separate again"
                title="Separate this song again, with a different model"
                width={26}
              >
                {again}
              </Button>
            </div>
          </div>
          <div className="mf-band-bottom">
            <span className="mf-band-audible">{mix.audibleLine}</span>
            <span className="mf-band-model">{mix.labelOf(song.model)}</span>
          </div>
        </div>

        <div className="mf-band-track">
          <div className="mf-ruler">
            {mix.slices.map((slice, i) => {
              const next = mix.slices[i + 1]?.bar ?? bars;
              return (
                <button
                  key={i}
                  type="button"
                  className="mf-slice"
                  data-on={i === mix.activeSlice || undefined}
                  style={{
                    left: `${(slice.bar / bars) * 100}%`,
                    width: `${((next - slice.bar) / bars) * 100}%`,
                  }}
                  onClick={() => mix.setActiveSlice(i)}
                  title={`${slice.name} — bar ${slice.bar + 1}, ${next - slice.bar} bars`}
                >
                  <span className="mf-slice-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="mf-slice-name">{slice.name}</span>
                </button>
              );
            })}
          </div>
          <WarpLane
            onsets={mix.onsets}
            bars={bars}
            height={24}
            anchors={mix.anchors}
            onPin={mix.pin}
            pinning={mix.manual !== null}
          />
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
              <div className="mf-head mf-lane-head">
                <span className="mf-dot" />
                <span className="mf-lane-label">{stem.name}</span>
                <Toggle
                  on={present && own.muted}
                  onChange={(next) => mix.adjust(stem.id, { muted: next })}
                  disabled={!present}
                  label={`Mute ${stem.name}`}
                  title="Mute"
                  width={18}
                >
                  M
                </Toggle>
                <Toggle
                  on={present && own.soloed}
                  onChange={(next) => mix.adjust(stem.id, { soloed: next })}
                  disabled={!present}
                  label={`Solo ${stem.name}`}
                  title="Solo"
                  width={18}
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
                <span className="mf-lane-db">{present ? trim(own.volume) : '—'}</span>
              </div>
              <div className="mf-lane-draw">
                {!present ? (
                  <span className="mf-lane-none">folded into Other by {mix.labelOf(song.model)}</span>
                ) : mix.peaks[stem.id] ? (
                  <Waveform
                    peaks={mix.peaks[stem.id]}
                    ink={`var(--stem-${stem.id})`}
                    quiet={!heard}
                    height={46}
                    bars={bars}
                    onSeek={(fraction) => mix.seek(fraction * mix.seconds)}
                  />
                ) : (
                  // An empty lane and a lane of zeroes look the same and only
                  // one of them is honest.
                  <span className="mf-lane-none">
                    {mix.audioProblem ?? (mix.decoding ? 'reading the stem' : 'no audio loaded')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div
          className="mf-playhead"
          style={{
            left: `calc(var(--lane-head) + (100% - var(--lane-head)) * ${
              mix.seconds > 0 ? mix.position / mix.seconds : 0
            })`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The bar that appears while the grid is being set by hand.
 *
 * It exists because in this mode a click in a lane means something else, and a
 * mode you cannot see is a mode that surprises you. Amber and pulsing at the
 * top of the thing whose behaviour changed, with the way out on the same line.
 */
function ManualBar({ mix }: { mix: Mix }) {
  const manual = mix.manual;
  if (!manual) return null;
  const step = manual.stage === 'first' ? 'step 1 / 2' : manual.stage === 'late' ? 'step 2 / 2' : 'tune';
  const hint =
    manual.stage === 'first'
      ? 'Click the downbeat that starts bar 1'
      : manual.stage === 'late'
        ? 'Click a strong beat near the end'
        : 'Nudge the reference, or click again where the song pushes';

  return (
    <div className="mf-manual">
      <span className="mf-manual-step">{step}</span>
      <span className="mf-manual-hint">{hint}</span>
      <div className="mf-manual-nudge">
        <Button onPress={() => mix.nudge(-1)} label="Earlier" title="Pull the reference 10 ms earlier" width={22}>
          ◀
        </Button>
        <Button onPress={() => mix.nudge(1)} label="Later" title="Push the reference 10 ms later" width={22}>
          ▶
        </Button>
      </div>
      <Button onPress={mix.endManual} className="mf-primary">
        Done
      </Button>
    </div>
  );
}
