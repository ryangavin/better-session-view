import { Button } from '@openflow/widgets/controls/Button.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { BARS, modelOf } from '../mock.ts';
import type { Mix } from '../state.ts';
import { Badges } from './Library.tsx';
import './Detail.css';

/**
 * The open track: its facts, its slices as a list, and the one button that
 * turns all of it into something Live can open.
 *
 * The slice list and the ruler are the same eight rows twice, which is
 * deliberate — the ruler is where you see a slice is in the wrong place and the
 * list is where you type its name, and neither does the other's job well.
 */

/** Unnamed for the same reason the fader is: the row already says "warp to". */
const BPM: Param = {
  kind: 'float',
  min: 60,
  max: 200,
  defaultValue: 120,
  unit: 'custom',
  customUnit: '%0.0f BPM',
};

export function Detail({ mix }: { mix: Mix }) {
  const song = mix.song;
  const ready = song.separated.length > 0;
  const model = modelOf(song.model);

  const facts: [string, string][] = [
    ['bpm', String(song.bpm)],
    ['key', song.key],
    ['len', song.length],
    ['fmt', song.format],
  ];

  return (
    <aside className="mf-detail">
      <div className="mf-detail-head">
        <h1 className="mf-detail-title">{song.title}</h1>
        <p className="mf-detail-artist">{song.artist}</p>
        <div className="mf-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <span className="mf-fact-k">{k}</span>
              <span className="mf-fact-v">{v}</span>
            </div>
          ))}
        </div>
        {ready && (
          <div className="mf-detail-stems">
            <Badges sources={song.separated} />
            <span className="mf-detail-model">{model.label}</span>
          </div>
        )}
      </div>

      <div className="mf-slice-head">
        <span>#</span>
        <span>slice</span>
        <span>bar</span>
        <span>len</span>
      </div>

      <div className="mf-slice-list">
        {mix.slices.map((slice, i) => {
          const next = mix.slices[i + 1]?.bar ?? BARS;
          return (
            <div
              key={i}
              className="mf-slice-row"
              data-on={i === mix.activeSlice || undefined}
              onClick={() => mix.setActiveSlice(i)}
            >
              <span className="mf-slice-row-num">{i + 1}</span>
              <input
                type="text"
                value={slice.name}
                onChange={(e) => mix.rename(i, e.target.value)}
                aria-label={`Name of slice ${i + 1}`}
              />
              <span className="mf-slice-row-fact">{slice.bar + 1}</span>
              <span className="mf-slice-row-fact">{next - slice.bar}</span>
            </div>
          );
        })}
      </div>

      <div className="mf-export">
        <div className="mf-export-row">
          <span className="mf-cap">warp to</span>
          <div className="mf-export-bpm">
            <Toggle
              on={mix.bpmAuto}
              onChange={(next) => {
                mix.setBpmAuto(next);
                if (next) mix.setTargetBpm(song.bpm);
              }}
              label="Use the detected tempo"
              title="Use the detected tempo"
              width={34}
            >
              auto
            </Toggle>
            <NumberField
              param={BPM}
              value={mix.targetBpm}
              onChange={(next) => {
                mix.setTargetBpm(Math.round(next));
                mix.setBpmAuto(false);
              }}
              editable
              width={72}
              label="Target tempo"
            />
          </div>
        </div>

        <p className="mf-export-note">
          {mix.slices.length} slices × {song.separated.length || model.sources.length} stems ·{' '}
          {mix.slices.length * (song.separated.length || model.sources.length)} clips
          <br />
          <span className="mf-path">~/Music/mixflow/{song.title.toLowerCase().replace(/\s+/g, '-')}.als</span>
        </p>

        <Button
          onPress={() => mix.setExporting(true)}
          disabled={!ready}
          className="mf-primary"
          title={ready ? undefined : 'Separate the track first'}
        >
          Export to Ableton
        </Button>
      </div>
    </aside>
  );
}
