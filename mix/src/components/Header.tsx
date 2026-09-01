import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import { BARS } from '../mock.ts';
import type { Mix } from '../state.ts';
import './Header.css';

/**
 * The one bar that is the same whatever the middle of the window is showing:
 * which model the next separation uses, where the preview is, and the settings
 * nobody opens twice.
 *
 * The position reads as bar.beat.sixteenth, which is Live's, because the number
 * this app produces is a bar number in a clip pack and the two want to agree.
 */

const play = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);

const pause = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const stopMark = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" />
  </svg>
);

const loopMark = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 9h13l-3-3M20 15H7l3 3" />
  </svg>
);

const gear = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </svg>
);

/** bar.beat.sixteenth, one-based, from a position measured in bars. */
function position(bar: number): string {
  const whole = Math.floor(bar);
  const beat = Math.floor((bar - whole) * 4);
  const sixteenth = Math.floor(((bar - whole) * 4 - beat) * 4);
  return `${Math.min(whole, BARS - 1) + 1}.${beat + 1}.${sixteenth + 1}`;
}

export function Header({ mix }: { mix: Mix }) {
  const labels = mix.models.map((m) => m.label);
  const chosen = mix.models.findIndex((m) => m.id === mix.model);

  return (
    <header className="mf-header">
      <div className="mf-mark">
        mix<span>[flow]</span>
      </div>

      <Select
        items={labels}
        index={chosen < 0 ? 0 : chosen}
        onChange={(next) => mix.setModel(mix.models[next].id)}
        label="Separation model"
        title="Which model the next separation uses"
        width={104}
      />

      <div className="mf-header-gap" />

      <span className="mf-clock">{position(mix.bar)}</span>

      <div className="mf-transport">
        <Button
          onPress={() => mix.setPlaying(!mix.playing)}
          label={mix.playing ? 'Pause' : 'Play'}
          title={mix.playing ? 'Pause (Space)' : 'Play (Space)'}
          tone="quiet"
          width={28}
          className={mix.playing ? 'mf-playing' : undefined}
        >
          {mix.playing ? pause : play}
        </Button>
        <Button onPress={mix.stop} label="Stop" title="Stop and return to the top" tone="quiet" width={28}>
          {stopMark}
        </Button>
        <Toggle
          on={mix.loop}
          onChange={mix.setLoop}
          label="Loop"
          title="Loop the preview"
          width={28}
        >
          {loopMark}
        </Toggle>
      </div>

      <div className="mf-header-gap" />

      <Button
        onPress={() => undefined}
        label="Settings"
        title="Separation defaults, stem naming, export paths"
        tone="quiet"
        width={26}
      >
        {gear}
      </Button>
    </header>
  );
}
