import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BridgeState } from '../../hooks/useBridge.js';
import { useMixerStrip, type MixerStore } from '../../hooks/useMixer.js';
import {
  compactParameterDisplay,
  mixerParameterFraction,
} from '../../lib/meterScale.js';

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

/** One track column in the naturally sized sends section above the resizable mixer. */
export function TrackSends({
  trackIndex,
  label,
  mixer,
  setMixer,
}: {
  trackIndex: number;
  label: string;
  mixer: MixerStore;
  setMixer: BridgeState['setMixer'];
}) {
  const strip = useMixerStrip(mixer, trackIndex);
  const track = strip?.kind === 'track' ? strip : null;
  const pending = useRef<{ index: number; value: number } | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const queueSend = (index: number, value: number) => {
    pending.current = { index, value };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const send = pending.current;
      pending.current = null;
      if (send) setMixer({ kind: 'track', t: trackIndex }, { send });
    });
  };

  return (
    <td className="sends-cell">
      <div className="mixer-sends">
        {Array.from({ length: track?.sends.length ?? 0 }, (_, index) => (
          <SendControl
            key={index}
            parameter={track?.sends[index] ?? null}
            index={index}
            trackLabel={label}
            onChange={queueSend}
          />
        ))}
      </div>
    </td>
  );
}
