import { Knob } from '@openflow/widgets/controls/Knob.tsx';
import { format } from '@openflow/widgets/param/format.ts';
import { BAND, HIGH_BEGINS, LOW_ENDS, type Bands } from '../eq.ts';

/**
 * One stem's three bands, on a row: low, mid and high, with the two cuts
 * between them drawn between them.
 *
 * The order is the spectrum's. A cut sits between the two bands it divides,
 * smaller than either, because it is a *where* and not a *how much* — and it
 * is captioned with where it is, since a divider at 250 Hz is a different
 * control from the same divider at 800 and the arc alone cannot say which.
 * The bands are captioned by name and their reading is left off: the row is
 * a lane head wide and a knob's fill, growing from its centre, already says
 * boost or cut. The exact figure is on the tooltip and read to a screen
 * reader, which is where an exact figure on a mixer is wanted.
 */
export function Tone({
  stem,
  bands,
  onShape,
}: {
  stem: string;
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
        name={format(param, bands[key])}
        showValue={false}
        label={`${stem}: ${param.name}`}
        title={param.name}
        className="mf-tone-cut"
      />
    );
  };

  return (
    <div className="mf-tone mf-lane-tone">
      {band('low', 'Low')}
      {cut('lowEnds')}
      {band('mid', 'Mid')}
      {cut('highBegins')}
      {band('high', 'High')}
    </div>
  );
}
