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
  showSends: boolean;
  hideTrackControls?: boolean;
  isGroup?: boolean;
}

function sendName(index: number): string {
  let name = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function SendControl({
  parameter,
  index,
  trackLabel,
  onChange,
}: {
  parameter: BSV.MixerParameterState | null;
  index: number;
  trackLabel: string;
  onChange: (index: number, value: number) => void;
}) {
  const name = sendName(index);
  const [localValue, setLocalValue] = useState<number | null>(null);
  const fallback = useRef<number | null>(null);

  useEffect(() => {
    if (
      localValue !== null && parameter &&
      Math.abs(parameter.value - localValue) <=
        Math.max(0.0001, (parameter.max - parameter.min) / 2000)
    ) {
      setLocalValue(null);
    }
  }, [localValue, parameter]);

  useEffect(
    () => () => {
      if (fallback.current !== null) window.clearTimeout(fallback.current);
    },
    [],
  );

  const shown = localValue ?? parameter?.value ?? 0;
  const step = parameter ? Math.max((parameter.max - parameter.min) / 1000, 0.0001) : 0.001;
  const fraction = mixerParameterFraction(parameter, shown);
  const change = (next: number) => {
    if (!Number.isFinite(next)) return;
    setLocalValue(next);
    onChange(index, next);
    if (fallback.current !== null) window.clearTimeout(fallback.current);
    fallback.current = window.setTimeout(() => setLocalValue(null), 750);
  };

  return (
    <label
      className={`mixer-send${parameter?.enabled ? '' : ' disabled'}`}
      title={`${trackLabel} send ${name} · ${parameter?.display || 'unavailable'} · double-click to reset`}
    >
      <span className="mixer-send-label" aria-hidden="true">{name}</span>
      <span
        className="mixer-send-value"
        style={{ '--send-position': `${fraction * 100}%` } as CSSProperties}
      >
        <input
          type="range"
          min={parameter?.min ?? 0}
          max={parameter?.max ?? 1}
          step={step}
          value={shown}
          disabled={!parameter?.enabled}
          aria-label={`${trackLabel} send ${name}`}
          onChange={(event) => change(Number(event.currentTarget.value))}
          onDoubleClick={() => {
            if (parameter?.enabled) change(parameter.defaultValue);
          }}
        />
        <output aria-label={`${trackLabel} send ${name} value`}>
          {compactParameterDisplay(parameter?.display)}
        </output>
      </span>
    </label>
  );
}

/** A column-owned Live mixer strip, mounted only while that output is visible. */
export function TrackMeter({
  meterKey,
  label,
  meters,
  mixer,
  setMixer,
  showSends,
  hideTrackControls = false,
  isGroup = false,
}: Props) {
  const level = useOutputMeter(meters, meterKey);
  const strip = useMixerStrip(mixer, meterKey);
  const volume = strip?.volume ?? null;
  const pan = strip?.pan ?? null;
  const target: BSV.MixerTarget =
    meterKey === 'master' ? { kind: 'master' } : { kind: 'track', t: meterKey };
  const db = meterDecibels(level);
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

  const queueSend = (index: number, next: number) => {
    pendingPatch.current.send = { index, value: next };
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
  const sendCount = track?.sends.length ?? 0;

  return (
    <td className="meter-cell">
      <div className={`mixer-strip${isMaster ? ' master' : ''}${showSends ? ' sends-open' : ''}`}>
        {showSends && sendCount > 0 && (
          <div className="mixer-sends">
            {Array.from({ length: sendCount }, (_, index) => (
              <SendControl
                key={index}
                parameter={track?.sends[index] ?? null}
                index={index}
                trackLabel={label}
                onChange={queueSend}
              />
            ))}
          </div>
        )}
        {/* Tracks and Master share this entire fader subtree. The outer strip
            owns only track-specific sends and the wider Master-cell centering. */}
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
              >
                <span className="meter-level" style={{ transform: `scaleY(${fraction})` }} />
                <span
                  className={`meter-peak${peak > 0 ? ' visible' : ''}`}
                  style={{ bottom: `${meterFraction(meterDecibels(peak)) * 100}%` }}
                  aria-hidden="true"
                />
                <span className="meter-rules" aria-hidden="true">
                  {METER_DB_TICKS.map((tick) => (
                    <span
                      key={tick}
                      className={`meter-rule${tick === 0 ? ' zero' : ''}`}
                      style={{ bottom: `${meterFraction(tick) * 100}%` }}
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
                aria-label={`Peak ${peakDisplay(peak)} decibels. Reset ${label} peak level`}
                onClick={() => setPeak(level)}
              >
                {peakDisplay(peak)}
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
          {isMaster && <div className="mixer-master-label">Master</div>}
        </div>
      </div>
    </td>
  );
}
