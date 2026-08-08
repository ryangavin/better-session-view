import {
  useOutputMeter,
  type MeterKey,
  type MeterStore,
} from '../../hooks/useMeters.js';

interface Props {
  meterKey: MeterKey;
  label: string;
  meters: MeterStore;
}

const MIN_DB = -60;
const MAX_DB = 6;
const DB_TICKS = [6, 0, -12, -24, -36, -48] as const;

/** Treat Live's normalized peak as amplitude for a conventional logarithmic scale. */
function decibels(level: number): number {
  if (level <= 0) return MIN_DB;
  return Math.max(MIN_DB, Math.min(MAX_DB, 20 * Math.log10(level) + MAX_DB));
}

function meterFraction(db: number): number {
  const fraction = (db - MIN_DB) / (MAX_DB - MIN_DB);
  return Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
}

/** A column-owned meter cell, mounted only while that output column is visible. */
export function TrackMeter({ meterKey, label, meters }: Props) {
  const level = useOutputMeter(meters, meterKey);
  const db = decibels(level);
  const fraction = level <= 0 ? 0 : meterFraction(db);

  return (
    <td className="meter-cell">
      <div className="vertical-meter">
        <div
          className="meter-well"
          role="meter"
          aria-label={`${label} output level`}
          aria-valuemin={MIN_DB}
          aria-valuemax={MAX_DB}
          aria-valuenow={Math.round(db)}
          aria-valuetext={level <= 0 ? 'silence' : `${db.toFixed(1)} decibels`}
        >
          <span className="meter-level" style={{ transform: `scaleY(${fraction})` }} />
          <span className="meter-rules" aria-hidden="true">
            {DB_TICKS.slice(1).map((tick) => (
              <span
                key={tick}
                className="meter-rule"
                style={{ bottom: `${meterFraction(tick) * 100}%` }}
              />
            ))}
          </span>
        </div>
        <div className="meter-db-scale" aria-hidden="true">
          {DB_TICKS.map((tick) => (
            <span
              key={tick}
              className={`meter-db-tick${tick === 0 ? ' top' : ''}`}
              style={{ bottom: `${meterFraction(tick) * 100}%` }}
            >
              {tick > 0 ? `+${tick}` : tick}
            </span>
          ))}
        </div>
      </div>
    </td>
  );
}
