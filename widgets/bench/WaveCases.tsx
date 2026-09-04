import { useMemo, useState } from 'react';
import { Waveform } from '../src/wave/Waveform.tsx';
import { packedOf, type Peak } from '../src/wave/levels.ts';
import { Button } from '../src/controls/Button.tsx';
import { Select } from '../src/controls/Select.tsx';

/**
 * A stand-in for a separated stem, because the bench has no library.
 *
 * Shaped rather than random: bars with an attack and a decay, a quiet middle
 * eight and a silent run, so the cases show the things a waveform has to get
 * right — a transient that survives being summarised, and a silence that draws
 * as a line rather than as a hole.
 */
const invent = (columns: number, seed: number): Peak[] => {
  let n = seed;
  const random = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: Peak[] = [];
  for (let i = 0; i < columns; i++) {
    const at = i / columns;
    // A silent run, so the least a shape may be is visible on the page.
    const quiet = at > 0.42 && at < 0.5 ? 0 : at > 0.6 && at < 0.72 ? 0.18 : 1;
    const beat = (i % Math.round(columns / 96)) / Math.round(columns / 96);
    const hit = Math.pow(1 - beat, 3);
    const body = (0.35 + 0.4 * Math.sin(at * Math.PI * 2)) * quiet;
    const value = Math.min(1, (body + hit * 0.8 * quiet) * (0.7 + random() * 0.3));
    out.push({ min: -value * (0.8 + random() * 0.2), max: value });
  }
  return out;
};

const STEMS = [
  { id: 'drums', ink: 'var(--stem-drums)', seed: 7 },
  { id: 'bass', ink: 'var(--stem-bass)', seed: 41 },
  { id: 'vocals', ink: 'var(--stem-vocals)', seed: 93 },
];

const WINDOWS: { name: string; from: number; to: number }[] = [
  { name: 'whole', from: 0, to: 1 },
  { name: 'a section', from: 0.3, to: 0.55 },
  { name: 'a few bars', from: 0.34, to: 0.37 },
  { name: 'one hit', from: 0.352, to: 0.3535 },
];

export function WaveCases() {
  const [window_, setWindow] = useState(0);
  const [density, setDensity] = useState(0);
  const packed = useMemo(() => STEMS.map((s) => packedOf(invent(48000, s.seed))), []);
  const view = WINDOWS[window_];
  const densities = [undefined, 0.25, 0.5, 1, 2];

  return (
    <>
      <div className="case wide">
        <div className="case-stage case-stack">
          <div className="case-bar">
            <Select
              label="Window"
              items={WINDOWS.map((w) => w.name)}
              index={window_}
              onChange={setWindow}
              width={110}
            />
            <Select
              label="Points per pixel"
              items={['auto', '0.25/px', '0.5/px', '1/px', '2/px']}
              index={density}
              onChange={setDensity}
              width={90}
            />
            <Button onPress={() => setWindow(0)}>Whole</Button>
          </div>
          {STEMS.map((stem, i) => (
            <Waveform
              key={stem.id}
              peaks={packed[i]}
              from={view.from}
              to={view.to}
              ink={stem.ink}
              height={78}
              density={densities[density]}
              label={`${stem.id}, ${view.name}`}
            />
          ))}
        </div>
        <p className="case-note">
          One shape a lane, off a ladder of halvings. Detail rides the window unless it is
          pinned: across the whole thing a quarter of a point per pixel reads as the shape of
          an arrangement, and a bar reads as a bar. The silent run draws as a line, because a
          silhouette whose edges meet encloses nothing and would otherwise vanish.
        </p>
      </div>

      <div className="case">
        <div className="case-stage">
          <Waveform peaks={packed[0]} ink="var(--stem-drums)" height={44} label="a short lane" />
        </div>
        <p className="case-note">Short, and with no window given: the whole thing at 44px.</p>
      </div>

      <div className="case">
        <div className="case-stage">
          <Waveform
            peaks={packed[1]}
            from={0.42}
            to={0.5}
            ink="var(--stem-bass)"
            height={44}
            label="a silent run"
          />
        </div>
        <p className="case-note">
          Silence on its own. A pixel of line, on the middle, where it happened.
        </p>
      </div>
    </>
  );
}
