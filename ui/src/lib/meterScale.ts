export const METER_MIN_DB = -60;
export const METER_MAX_DB = 6;
export const METER_DB_TICKS = [
  0, -6, -12, -18, -24, -30, -36, -42, -48, -54,
] as const;

/** Live reports the normalized position of its own logarithmic meter scale. */
export function meterDecibels(level: number): number {
  const fraction = Math.max(0, Math.min(1, level));
  return METER_MIN_DB + fraction * (METER_MAX_DB - METER_MIN_DB);
}

export function meterFraction(db: number): number {
  const fraction = (db - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB);
  return Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
}

export function mixerParameterFraction(
  parameter: BSV.MixerParameterState | null,
  value: number,
): number {
  if (!parameter) return 0;
  return Math.max(
    0,
    Math.min(
      1,
      (value - parameter.min) /
        Math.max(parameter.max - parameter.min, Number.EPSILON),
    ),
  );
}

export function compactParameterDisplay(display: string | undefined): string {
  if (!display) return '—';
  return display
    .replace(/\s*dB$/i, '')
    .replace(/^-inf(?:inity)?$/i, '−∞')
    .replace(/(-?\d+\.\d*?[1-9])0+$/, '$1')
    .replace(/(-?\d+)\.0+$/, '$1');
}

export function peakDisplay(level: number): string {
  if (level <= 0) return '−∞';
  return meterDecibels(level).toFixed(1);
}
