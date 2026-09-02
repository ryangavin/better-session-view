import type { CSSProperties, Ref } from 'react';
import './notation.css';

export interface PianoRollKey {
  pitch: number;
  label: string;
  black: boolean;
  emphasis?: boolean;
}

export interface PianoRollNote {
  id?: string;
  from: number;
  to: number;
  pitch: number;
  label?: string;
  color?: string;
  title?: string;
  /** Draw the stronger outline used for a musically important note. */
  emphasis?: boolean;
  /** Draw the small corner mark used for an exceptional note. */
  marked?: boolean;
}

export interface PianoRollProps {
  /** Keyboard rows, highest pitch first. */
  keys: readonly PianoRollKey[];
  notes: readonly PianoRollNote[];
  from: number;
  to: number;
  beatsPerBar: number;
  playheadRef?: Ref<HTMLDivElement>;
  className?: string;
  labelAt?: number;
}

/**
 * A compact keyboard and note timeline.
 *
 * The host names and colours the keys and notes. The widget owns the reusable
 * piano-roll geometry: aligned rows, bar/beat ruling, note blocks, labels and a
 * transformable playhead. It knows nothing about Live, clips, keys or tracks.
 */
export function PianoRoll({
  keys,
  notes,
  from,
  to,
  beatsPerBar,
  playheadRef,
  className,
  labelAt = 4.5,
}: PianoRollProps) {
  const span = to - from;
  if (!(span > 0) || keys.length === 0) return null;

  const rows = keys.length;
  const rowOf = new Map(keys.map((key, at) => [key.pitch, at]));
  const bars = Math.max(1, Math.round(span / beatsPerBar));
  const beats = bars <= 8 && Number.isInteger(beatsPerBar) ? beatsPerBar : 0;

  return (
    <div
      className={`wdg wdg-piano-roll${className ? ` ${className}` : ''}`}
      style={{ '--wdg-roll-rows': rows } as CSSProperties}
    >
      <div className="wdg-roll-keys">
        {keys.map((key) => (
          <span key={key.pitch} className="wdg-roll-key" data-black={key.black || undefined}>
            {key.label}
          </span>
        ))}
      </div>

      <div className="wdg-roll-grid">
        {keys.map((key) => (
          <div
            key={key.pitch}
            className="wdg-roll-lane"
            data-black={key.black || undefined}
            data-emphasis={key.emphasis || undefined}
          />
        ))}

        {Array.from({ length: bars - 1 }, (_, i) => (
          <div key={`bar${i}`} className="wdg-roll-barline" style={{ left: `${((i + 1) / bars) * 100}%` }} />
        ))}

        {Array.from({ length: bars * beats }, (_, i) => i).map((i) =>
          i === 0 || i % beats === 0 ? null : (
            <div
              key={`beat${i}`}
              className="wdg-roll-beatline"
              style={{ left: `${(i / (bars * beats)) * 100}%` }}
            />
          ),
        )}

        {notes.map((note, at) => {
          const row = rowOf.get(note.pitch);
          if (row === undefined) return null;
          const width = ((note.to - note.from) / span) * 100;
          return (
            <div
              key={note.id ?? `${note.from}:${note.pitch}:${at}`}
              className="wdg-roll-note"
              data-emphasis={note.emphasis || undefined}
              data-marked={note.marked || undefined}
              style={{
                left: `${((note.from - from) / span) * 100}%`,
                width: `${width}%`,
                top: `${(row / rows) * 100}%`,
                height: `${100 / rows}%`,
                backgroundColor: note.color,
              }}
              title={note.title}
            >
              {width >= labelAt ? note.label : ''}
            </div>
          );
        })}

        <div className="wdg-roll-playhead" ref={playheadRef} />
      </div>

      <ol className="wdg-roll-bars">
        {Array.from({ length: bars }, (_, i) => (
          <li key={i}>{i + 1}</li>
        ))}
      </ol>
    </div>
  );
}
