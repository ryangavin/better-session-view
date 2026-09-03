import { Knob } from '@openflow/widgets/controls/Knob.tsx';
import { format } from '@openflow/widgets/param/format.ts';
import { BAND, HIGH_BEGINS, LOW_ENDS, type Bands } from '../eq.ts';

/**
 * One stem's three bands, stacked beside its fader: high at the top, low at
 * the bottom, with the two cuts between the bands they divide.
 *
 * The order is the spectrum's, read the way a channel strip is. A cut sits
 * between the two bands it divides, smaller than either, because it is a
 * *where* and not a *how much* — and it is captioned with where it is, since
 * a divider at 250 Hz is a different control from the same divider at 800
 * and the arc alone cannot say which. The bands are captioned by name and
 * their reading is left off: the column is half a lane head wide and a
 * knob's fill, growing from its centre, already says boost or cut. The exact
 * figure is on the tooltip and read to a screen reader, which is where an
 * exact figure on a mixer is wanted.
 */

/** A frequency short enough to caption a knob a dozen pixels wide. */
const hz = (value: number): string =>
  value < 1000 ? `${Math.round(value)}` : `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;

export function Tone({
  stem,
  ink,
  bands,
  onShape,
}: {
  stem: string;
  /** The stem's colour, or the idle grey while it cannot be heard. */
  ink: string;
  bands: Bands;
  onShape(change: Partial<Bands>): void;
}) {
  const band = (key: 'low' | 'mid' | 'high', name: string) => (
    <Knob
      param={BAND}
      value={bands[key]}
      onChange={(next) => onShape({ [key]: next })}
      name={name}
      showValue={false}
      layout="inline"
      ink={ink}
      label={`${stem} ${name.toLowerCase()} band`}
      title={`${name} band: ${format(BAND, bands[key])}`}
      className="mf-tone-band"
    />
  );
  const cut = (key: 'lowEnds' | 'highBegins') => {
    const param = key === 'lowEnds' ? LOW_ENDS : HIGH_BEGINS;
    return (
      <Knob
        param={param}
        value={bands[key]}
        onChange={(next) => onShape({ [key]: next })}
        name={hz(bands[key])}
        showValue={false}
        layout="inline"
        ink={ink}
        label={`${stem}: ${param.name}`}
        title={`${param.name}: ${format(param, bands[key])}`}
        className="mf-tone-cut"
      />
    );
  };

  return (
    <div className="mf-lane-tone">
      {band('high', 'High')}
      {cut('highBegins')}
      {band('mid', 'Mid')}
      {cut('lowEnds')}
      {band('low', 'Low')}
    </div>
  );
}
