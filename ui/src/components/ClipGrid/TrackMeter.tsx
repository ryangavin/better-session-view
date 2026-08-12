import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import {
  useOutputMeter,
  type MeterKey,
  type MeterStore,
} from '../../hooks/useMeters.js';
import { useMixerStrip, type MixerStore } from '../../hooks/useMixer.js';
import type { BridgeState } from '../../hooks/useBridge.js';
import {
  METER_DB_TICKS,
  METER_MAX_DB,
  METER_MIN_DB,
  METER_UNITY_FRACTION,
  compactParameterDisplay,
  meterDecibels,
  meterFraction,
  mixerParameterFraction,
  peakDisplay,
} from '../../lib/meterScale.js';
import { ControlButton, ControlGroup } from '../Control.js';

interface Props {
  meterKey: MeterKey;
  label: string;
  meters: MeterStore;
  mixer: MixerStore;
  setMixer: BridgeState['setMixer'];
  hideTrackControls?: boolean;
  isGroup?: boolean;
}

/** A column-owned Live mixer strip, mounted only while that output is visible. */
export function TrackMeter({
  meterKey,
  label,
  meters,
  mixer,
  setMixer,
  hideTrackControls = false,
  isGroup = false,
}: Props) {
  const level = useOutputMeter(meters, meterKey);
  const strip = useMixerStrip(mixer, meterKey);
  const volume = strip?.volume ?? null;
  const pan = strip?.pan ?? null;
  const target: BSV.MixerTarget =
    meterKey === 'master' ? { kind: 'master' } : { kind: 'track', t: meterKey };
  // Where 0 dB sits on this strip's rail. Live reports unity as the volume
  // parameter's default, and the indicator is positioned by that same
  // parameter's fraction, so taking the rail's hinge from here is what puts the
  // pointer on the 0 dB rule instead of a few percent under it.
  const unity = volume
    ? mixerParameterFraction(volume, volume.defaultValue)
    : METER_UNITY_FRACTION;
  const db = meterDecibels(level, unity);
  // `level` already is the meter's displayed 0–1 position. Treating it as
  // amplitude and applying log10 again made ordinary signals look full-scale.
  const fraction = Math.max(0, Math.min(1, level));
  const [peak, setPeak] = useState(0);

  useEffect(() => {
    if (level > peak) setPeak(level);
  }, [level, peak]);

  // Keep the thumb under the pointer until Live's observed readback catches up.
  // Writes are limited to one per animation frame; a drag remains continuous
  // without flooding the bridge faster than the browser can paint it.
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const [localPan, setLocalPan] = useState<number | null>(null);
  const pendingPatch = useRef<BSV.MixerPatch>({});
  const frame = useRef<number | null>(null);
  const volumeFallback = useRef<number | null>(null);
  const panFallback = useRef<number | null>(null);

  useEffect(() => {
    if (
      localVolume !== null &&
      volume &&
      Math.abs(volume.value - localVolume) <= Math.max(0.0001, (volume.max - volume.min) / 2000)
    ) {
      setLocalVolume(null);
    }
  }, [localVolume, volume]);

  useEffect(() => {
    if (
      localPan !== null &&
      pan &&
      Math.abs(pan.value - localPan) <= Math.max(0.0001, (pan.max - pan.min) / 2000)
    ) {
      setLocalPan(null);
    }
  }, [localPan, pan]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (volumeFallback.current !== null) window.clearTimeout(volumeFallback.current);
      if (panFallback.current !== null) window.clearTimeout(panFallback.current);
    },
    [],
  );

  const queueParameter = (field: 'volume' | 'pan', next: number) => {
    pendingPatch.current[field] = next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const patch = pendingPatch.current;
      pendingPatch.current = {};
      setMixer(target, patch);
    });
  };

  const changeVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    if (!Number.isFinite(next)) return;
    setLocalVolume(next);
    queueParameter('volume', next);
    if (volumeFallback.current !== null) window.clearTimeout(volumeFallback.current);
    volumeFallback.current = window.setTimeout(() => setLocalVolume(null), 750);
  };

  const changePan = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    if (!Number.isFinite(next)) return;
    setLocalPan(next);
    queueParameter('pan', next);
    if (panFallback.current !== null) window.clearTimeout(panFallback.current);
    panFallback.current = window.setTimeout(() => setLocalPan(null), 750);
  };

  const shownVolume = localVolume ?? volume?.value ?? 0;
  const volumeStep = volume ? Math.max((volume.max - volume.min) / 1000, 0.0001) : 0.001;
  const volumeFraction = mixerParameterFraction(volume, shownVolume);
  const shownPan = localPan ?? pan?.value ?? 0;
  const panStep = pan ? Math.max((pan.max - pan.min) / 200, 0.0001) : 0.01;
  const panFraction = mixerParameterFraction(pan, shownPan);
  const track = strip?.kind === 'track' ? strip : null;
  const isMaster = meterKey === 'master';
  return (
    <td className="meter-cell">
      <div className={`mixer-strip${isMaster ? ' master' : ''}`}>
        {/* Tracks and Master share this entire fader subtree. The outer strip
            owns only Master-specific presentation. */}
        <div className="mixer-fader">
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
              title={`${label} volume · ${volume?.display || 'unavailable'}`}
              onChange={changeVolume}
              onDoubleClick={() => {
                if (volume?.enabled) {
                  setLocalVolume(volume.defaultValue);
                  queueParameter('volume', volume.defaultValue);
                }
              }}
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
                aria-valuemin={METER_MIN_DB}
                aria-valuemax={METER_MAX_DB}
                aria-valuenow={Math.round(db)}
                aria-valuetext={level <= 0 ? 'silence' : `${db.toFixed(1)} decibels`}
                // The fill's warning zones are the rail's own scale, not a
                // second copy of it: green up to unity, red from +3 dB.
                style={
                  {
                    '--meter-unity': `${unity * 100}%`,
                    '--meter-hot': `${meterFraction(3, unity) * 100}%`,
                  } as CSSProperties
                }
              >
                <span className="meter-level" style={{ transform: `scaleY(${fraction})` }} />
                <span
                  className={`meter-peak${peak > 0 ? ' visible' : ''}`}
                  style={{ bottom: `${peak * 100}%` }}
                  aria-hidden="true"
                />
                <span className="meter-rules" aria-hidden="true">
                  {METER_DB_TICKS.map((tick) => (
                    <span
                      key={tick}
                      className={`meter-rule${tick === 0 ? ' zero' : ''}`}
                      style={{ bottom: `${meterFraction(tick, unity) * 100}%` }}
                    />
                  ))}
                </span>
              </div>
            </div>
            <div className="mixer-readouts">
              <button
                type="button"
                className="meter-peak-readout"
                title={`Reset ${label} peak level`}
                aria-label={`Peak ${peakDisplay(peak, unity)} decibels. Reset ${label} peak level`}
                onClick={() => setPeak(level)}
              >
                {peakDisplay(peak, unity)}
              </button>
              <output className="mixer-volume-readout" aria-label={`${label} volume value`}>
                {compactParameterDisplay(volume?.display)}
              </output>
            </div>
          </div>

          <label
            className={`mixer-pan${pan?.enabled ? '' : ' disabled'}`}
            title={`${label} pan · ${pan?.display || 'unavailable'} · double-click to center`}
          >
            <input
              className="pan-fader"
              type="range"
              min={pan?.min ?? -1}
              max={pan?.max ?? 1}
              step={panStep}
              value={shownPan}
              disabled={!pan?.enabled}
              aria-label={`${label} pan`}
              onChange={changePan}
              onDoubleClick={() => {
                if (pan?.enabled) {
                  setLocalPan(pan.defaultValue);
                  queueParameter('pan', pan.defaultValue);
                }
              }}
            />
            <span
              aria-hidden="true"
              style={{ '--pan-position': `${panFraction * 100}%` } as CSSProperties}
            >
              {compactParameterDisplay(pan?.display)}
            </span>
          </label>

          <ControlGroup
            className={`mixer-controls${hideTrackControls ? ' mixer-controls-hidden' : ''}`}
            label={`${label} mixer controls`}
            appearance="bare"
            aria-hidden={hideTrackControls || undefined}
          >
            <ControlButton
              pressed={track?.active ?? false}
              className="mixer-button mixer-activator"
              title={`${track?.active ? 'Disable' : 'Enable'} ${label}`}
              disabled={!track}
              onClick={() => track && setMixer(target, { active: !track.active })}
            >
              {typeof meterKey === 'number' ? meterKey + 1 : ''}
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
        </div>
      </div>
    </td>
  );
}
