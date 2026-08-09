import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  useOutputMeter,
  type MeterKey,
  type MeterStore,
} from '../../hooks/useMeters.js';
import { useMixerStrip, type MixerStore } from '../../hooks/useMixer.js';
import type { BridgeState } from '../../hooks/useBridge.js';
import { ControlButton, ControlGroup } from '../Control.js';

interface Props {
  meterKey: MeterKey;
  label: string;
  meters: MeterStore;
  mixer: MixerStore;
  setMixer: BridgeState['setMixer'];
  isGroup?: boolean;
}

const MIN_DB = -60;
const MAX_DB = 6;
const DB_TICKS = [0, -12, -24, -36, -48] as const;

/** Treat Live's normalized peak as amplitude for a conventional logarithmic scale. */
function decibels(level: number): number {
  if (level <= 0) return MIN_DB;
  return Math.max(MIN_DB, Math.min(MAX_DB, 20 * Math.log10(level) + MAX_DB));
}

function meterFraction(db: number): number {
  const fraction = (db - MIN_DB) / (MAX_DB - MIN_DB);
  return Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
}

/** A column-owned Live mixer strip, mounted only while that output is visible. */
export function TrackMeter({ meterKey, label, meters, mixer, setMixer, isGroup = false }: Props) {
  const level = useOutputMeter(meters, meterKey);
  const strip = useMixerStrip(mixer, meterKey);
  const volume = strip?.volume ?? null;
  const target: BSV.MixerTarget =
    meterKey === 'master' ? { kind: 'master' } : { kind: 'track', t: meterKey };
  const db = decibels(level);
  const fraction = level <= 0 ? 0 : meterFraction(db);

  // Keep the thumb under the pointer until Live's observed readback catches up.
  // Writes are limited to one per animation frame; a drag remains continuous
  // without flooding the bridge faster than the browser can paint it.
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const pendingVolume = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const fallback = useRef<number | null>(null);

  useEffect(() => {
    if (
      localVolume !== null &&
      volume &&
      Math.abs(volume.value - localVolume) <= Math.max(0.0001, (volume.max - volume.min) / 2000)
    ) {
      setLocalVolume(null);
    }
  }, [localVolume, volume]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (fallback.current !== null) window.clearTimeout(fallback.current);
    },
    [],
  );

  const changeVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    if (!Number.isFinite(next)) return;
    setLocalVolume(next);
    pendingVolume.current = next;
    if (fallback.current !== null) window.clearTimeout(fallback.current);
    fallback.current = window.setTimeout(() => setLocalVolume(null), 750);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const value = pendingVolume.current;
      pendingVolume.current = null;
      if (value !== null) setMixer(target, { volume: value });
    });
  };

  const shownVolume = localVolume ?? volume?.value ?? 0;
  const volumeStep = volume ? Math.max((volume.max - volume.min) / 1000, 0.0001) : 0.001;
  const volumeFraction = volume
    ? Math.max(
        0,
        Math.min(
          1,
          (shownVolume - volume.min) /
            Math.max(volume.max - volume.min, Number.EPSILON),
        ),
      )
    : 0;
  const volumePercent = Math.round(volumeFraction * 100);
  const track = strip?.kind === 'track' ? strip : null;
  const isMaster = meterKey === 'master';

  return (
    <td className="meter-cell">
      <div className={`mixer-strip${isMaster ? ' master' : ''}`}>
        <div className="mixer-meter-control">
          <input
            className="volume-fader"
            type="range"
            min={volume?.min ?? 0}
            max={volume?.max ?? 1}
            step={volumeStep}
            value={shownVolume}
            disabled={!volume?.enabled}
            aria-label={`${label} volume`}
            aria-orientation="vertical"
            title={`${label} volume · ${volumePercent}%`}
            onChange={changeVolume}
          />
          <span
            className={`volume-indicator${volume?.enabled ? '' : ' disabled'}`}
            style={{ bottom: `${volumeFraction * 100}%` }}
            aria-hidden="true"
          />
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
                {DB_TICKS.map((tick) => (
                  <span
                    key={tick}
                    className="meter-rule"
                    style={{ bottom: `${meterFraction(tick) * 100}%` }}
                  />
                ))}
              </span>
            </div>
          </div>
        </div>

        {!isMaster ? (
          <ControlGroup
            className="mixer-controls"
            label={`${label} mixer controls`}
            appearance="bare"
          >
            <ControlButton
              pressed={track?.active ?? false}
              className="mixer-button mixer-activator"
              title={`${track?.active ? 'Disable' : 'Enable'} ${label}`}
              disabled={!track}
              onClick={() => track && setMixer(target, { active: !track.active })}
            >
              {meterKey + 1}
            </ControlButton>
            <ControlButton
              pressed={track?.solo ?? false}
              className="mixer-button mixer-solo"
              title={`${track?.solo ? 'Unsolo' : 'Solo'} ${label}`}
              disabled={!track}
              onClick={() => track && setMixer(target, { solo: !track.solo })}
            >
              S
            </ControlButton>
            <ControlButton
              pressed={track?.armed ?? false}
              className={`mixer-button mixer-arm${isGroup ? ' group-hidden' : ''}`}
              aria-label={`${track?.armed ? 'Disarm' : 'Arm'} ${label}`}
              title={
                track?.canArm
                  ? `${track.armed ? 'Disarm' : 'Arm'} ${label}`
                  : `${label} cannot be armed`
              }
              disabled={!track?.canArm}
              onClick={() => track && setMixer(target, { armed: !track.armed })}
            >
              <span aria-hidden="true" />
            </ControlButton>
          </ControlGroup>
        ) : (
          <div className="mixer-master-label">Master</div>
        )}
      </div>
    </td>
  );
}
