import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PianoRoll } from './PianoRoll.tsx';

describe('PianoRoll', () => {
  it('lays host-labelled notes onto host-labelled keys', () => {
    const html = renderToStaticMarkup(
      <PianoRoll
        keys={[
          { pitch: 29, label: 'F', black: false },
          { pitch: 28, label: 'E', black: false, emphasis: true },
        ]}
        notes={[
          { from: 0, to: 1, pitch: 28, label: 'E', color: '#f00', emphasis: true, marked: true },
        ]}
        from={0}
        to={4}
        beatsPerBar={4}
      />,
    );
    expect(html).toContain('wdg-piano-roll');
    expect(html).toContain('data-emphasis="true"');
    expect(html).toContain('data-marked="true"');
    expect(html).toContain('background-color:#f00');
  });

  it('draws no roll for an empty or backwards timeline', () => {
    expect(renderToStaticMarkup(
      <PianoRoll keys={[{ pitch: 28, label: 'E', black: false }]} notes={[]} from={1} to={1} beatsPerBar={4} />,
    )).toBe('');
  });
});
