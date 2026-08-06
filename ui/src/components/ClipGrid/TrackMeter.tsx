import { useTrackMeter, type MeterStore } from '../../hooks/useMeters.js';

interface Props {
  track: BSV.Track;
  meters: MeterStore;
}

const MIN_DB = -60;
const DB_TICKS = [0, -12, -24, -36, -48] as const;

/** Treat Live's normalized peak as amplitude for a conventional logarithmic scale. */
function decibels(level: number): number {
  if (level <= 0) return MIN_DB;
  return Math.max(MIN_DB, Math.min(0, 20 * Math.log10(level)));
}

function meterFraction(db: number): number {
  return (db - MIN_DB) / -MIN_DB;
}

/** A track-owned meter cell, mounted only while that track has a visible column. */
export function TrackMeter({ track, meters }: Props) {
  const level = useTrackMeter(meters, track.i);
  const db = decibels(level);
  const fraction = level <= 0 ? 0 : meterFraction(db);

  return (
    <td className="meter-cell">
      <div className="vertical-meter">
        <div
          className="meter-well"
          role="meter"
          aria-label={`${track.name} output level`}
          aria-valuemin={MIN_DB}
          aria-valuemax={0}
          aria-valuenow={Math.round(db)}
          aria-valuetext={level <= 0 ? 'silence' : `${db.toFixed(1)} decibels`}
        >
          <span className="meter-level" style={{ transform: `scaleY(${fraction})` }} />
        </div>
        <div className="meter-db-scale" aria-hidden="true">
          {DB_TICKS.map((tick) => (
            <span
              key={tick}
              className={`meter-db-tick${tick === 0 ? ' top' : ''}`}
              style={{ bottom: `${meterFraction(tick) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
      </div>
    </td>
  );
}
