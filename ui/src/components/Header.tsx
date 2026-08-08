import { useEffect, useRef, useState } from 'react';
import { COLUMN_WIDTHS, type ColumnWidth } from '../lib/columnWidth.js';
import type { BridgeState } from '../hooks/useBridge.js';
import './Header.css';
import {
  IconIndex,
  IconMeter,
  IconMetronome,
  IconPlay,
  IconStop,
  IconStopClips,
  IconSync,
  IconScale,
} from './Icon.js';

interface Props {
  lomReady: boolean;
  busy: boolean;
  isPlaying: boolean;
  songPosition: BridgeState['songPosition'];
  transport: BSV.TransportState | null;
  onTransport: (patch: BSV.TransportPatch) => void;
  showIndex: boolean;
  onToggleIndex: () => void;
  launch: BridgeState['launch'];
  stop: BridgeState['stop'];
  columnWidth: ColumnWidth;
  onColumnWidth: (w: ColumnWidth) => void;
  showMeters: boolean;
  onToggleMeters: () => void;
  onSnapshot: () => void;
}

const columnWidthText = (width: ColumnWidth): string => {
  if (width === 's') return 'Small';
  if (width === 'm') return 'Medium';
  if (width === 'l') return 'Large';
  if (width === 'auto') return 'Auto';
  return `${width} tracks`;
};

const columnWidthLabel = (width: ColumnWidth): string => {
  if (width === 'auto') return 'Auto-fit all track columns';
  if (width === '8') return 'Fit 8 track columns';
  if (width === '16') return 'Fit 16 track columns';
  return `${width.toUpperCase()} track columns`;
};

const columnWidthTitle = (width: ColumnWidth): string | undefined => {
  if (width === 'auto') return 'Fit all visible track columns to the grid width';
  if (width === '8') return 'Preview one 8-track clip-launcher bank';
  if (width === '16') return 'Preview two 8-track clip-launcher banks';
  return undefined;
};

const QUANTIZATION = [
  'None',
  '8 Bars',
  '4 Bars',
  '2 Bars',
  '1 Bar',
  '1/2',
  '1/2T',
  '1/4',
  '1/4T',
  '1/8',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
] as const;

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/* Live 12.4.3's own Song.scale_name docstring list. Keep the observed value as
   an extra option below: a newer Live can add a scale without making the
   current setting disappear from this control. */
const SCALE_NAMES = [
  'Major',
  'Minor',
  'Dorian',
  'Mixolydian',
  'Lydian',
  'Phrygian',
  'Locrian',
  'Whole Tone',
  'Half-whole Dim.',
  'Whole-half Dim.',
  'Minor Blues',
  'Minor Pentatonic',
  'Major Pentatonic',
  'Harmonic Minor',
  'Harmonic Major',
  'Dorian #4',
  'Phrygian Dominant',
  'Melodic Minor',
  'Lydian Augmented',
  'Lydian Dominant',
  'Super Locrian',
  'Bhairav',
  'Hungarian Minor',
  '8-Tone Spanish',
  'Hirajoshi',
  'In-Sen',
  'Iwato',
  'Kumoi',
  'Pelog Selisir',
  'Pelog Tembung',
  'Messiaen 3',
  'Messiaen 4',
  'Messiaen 5',
  'Messiaen 6',
  'Messiaen 7',
] as const;

function tempoText(tempo: number | undefined): string {
  if (tempo === undefined) return '';
  return String(Number(tempo.toFixed(2)));
}

function TempoControl({
  tempo,
  disabled,
  onCommit,
}: {
  tempo: number | undefined;
  disabled: boolean;
  onCommit: (tempo: number) => void;
}) {
  const editing = useRef(false);
  const [draft, setDraft] = useState(() => tempoText(tempo));

  useEffect(() => {
    if (!editing.current) setDraft(tempoText(tempo));
  }, [tempo]);

  const reset = () => setDraft(tempoText(tempo));
  const commit = () => {
    editing.current = false;
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 20 || value > 999) {
      reset();
      return;
    }
    setDraft(tempoText(value));
    if (value !== tempo) onCommit(value);
  };

  return (
    <label className="tempo-control" title="Live Set tempo — 20–999 BPM">
      <input
        type="number"
        min="20"
        max="999"
        step="0.01"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        aria-label="Live Set tempo in BPM"
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.preventDefault();
            reset();
          }
        }}
      />
      <span>BPM</span>
    </label>
  );
}

/**
 * The header bar: playback, view controls, meters and Snapshot.
 *
 * Every icon button here carries an `aria-label` as well as a `title`. An
 * icon-only control with no accessible name is a button that exists for
 * sighted mouse users and nobody else — and the `title` is also the only place
 * the longer ones (what "stop clips" spares, what Snapshot re-reads) can still
 * be said in words. Column width is the exception: a native single-select is
 * both more compact and already has the right keyboard semantics.
 */
export function Header({
  lomReady,
  busy,
  isPlaying,
  songPosition,
  transport,
  onTransport,
  showIndex,
  onToggleIndex,
  launch,
  stop,
  columnWidth,
  onColumnWidth,
  showMeters,
  onToggleMeters,
  onSnapshot,
}: Props) {
  const positionParts = songPosition
    ? [songPosition.bar, songPosition.beat, songPosition.sixteenth]
    : ['–', '–', '–'];
  const positionLabel = songPosition
    ? `Arrangement position: bar ${songPosition.bar}, beat ${songPosition.beat}, ` +
      `sixteenth ${songPosition.sixteenth}`
    : 'Arrangement position unavailable';

  return (
    <header>
      <div className="header-section header-left">
        <img className="brand-logo" src="/logo-white.png" alt="Better Session View" />
        <button
          type="button"
          className={`icon-btn toggle${showIndex ? ' on' : ''}`}
          aria-pressed={showIndex}
          aria-controls="song-index"
          aria-label="Song index"
          title={`${showIndex ? 'Hide' : 'Show'} song index`}
          onClick={onToggleIndex}
        >
          <IconIndex />
        </button>
        <div className="live-controls" role="group" aria-label="Live control bar">
          <div className="tempo-group" role="group" aria-label="Tempo and metronome">
            <TempoControl
              tempo={transport?.tempo}
              disabled={!lomReady || transport === null}
              onCommit={(tempo) => onTransport({ tempo })}
            />
            <button
              type="button"
              className={`icon-btn toggle${transport?.metronome ? ' on' : ''}`}
              aria-pressed={transport?.metronome ?? false}
              aria-label="Metronome"
              title={`${transport?.metronome ? 'Disable' : 'Enable'} Live's metronome`}
              disabled={!lomReady || transport === null}
              onClick={() => onTransport({ metronome: !transport?.metronome })}
            >
              <IconMetronome />
            </button>
          </div>
          <div className="header-select quantization-picker">
            <select
              value={transport?.clipTriggerQuantization ?? ''}
              disabled={!lomReady || transport === null}
              aria-label="Global clip launch quantization"
              title="Live's global clip launch quantization"
              onChange={(e) =>
                onTransport({ clipTriggerQuantization: Number(e.currentTarget.value) })
              }
            >
              {transport === null && <option value="">–</option>}
              {QUANTIZATION.map((label, value) => (
                <option key={label} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="select-caret" aria-hidden="true" />
          </div>
          <div className="scale-group" role="group" aria-label="Current scale">
            <button
              type="button"
              className={`icon-btn toggle${transport?.scaleMode ? ' on' : ''}`}
              aria-pressed={transport?.scaleMode ?? false}
              aria-label="Scale mode"
              title="Toggle Scale Mode for Live's current or selected clips"
              disabled={!lomReady || transport === null}
              onClick={() => onTransport({ scaleMode: !transport?.scaleMode })}
            >
              <IconScale />
            </button>
            <div className="header-select root-picker">
              <select
                value={transport?.rootNote ?? ''}
                disabled={!lomReady || transport === null}
                aria-label="Current scale root note"
                title="Root note for Live's current or selected clips"
                onChange={(e) => onTransport({ rootNote: Number(e.currentTarget.value) })}
              >
                {transport === null && <option value="">–</option>}
                {ROOT_NOTES.map((note, value) => (
                  <option key={note} value={value}>
                    {note}
                  </option>
                ))}
              </select>
              <span className="select-caret" aria-hidden="true" />
            </div>
            <div className="header-select scale-picker">
              <select
                value={transport?.scaleName ?? ''}
                disabled={!lomReady || transport === null}
                aria-label="Current scale name"
                title={
                  transport?.scaleName
                    ? `${transport.scaleName} — Live's current or selected clips`
                    : 'Scale name for Live\'s current or selected clips'
                }
                onChange={(e) => onTransport({ scaleName: e.currentTarget.value })}
              >
                {(transport === null || transport.scaleName === '') && (
                  <option value="">–</option>
                )}
                {transport?.scaleName &&
                  !SCALE_NAMES.includes(transport.scaleName as (typeof SCALE_NAMES)[number]) && (
                    <option value={transport.scaleName}>{transport.scaleName}</option>
                  )}
                {SCALE_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="select-caret" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      <div className="header-section header-center">
        <div className="transport">
          <div className="arrangement-position" role="timer" aria-label={positionLabel}>
            <span aria-hidden="true">
              {positionParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && <span className="position-separator">.</span>}
                  <span className="position-field">{part}</span>
                </span>
              ))}
            </span>
          </div>
          <div className="playback" role="group" aria-label="Playback">
            <button
              type="button"
              className={`icon-btn${isPlaying ? ' rolling' : ''}`}
              title="Start the song (Space)"
              aria-label="Start the song"
              disabled={!lomReady}
              onClick={() => launch({ kind: 'song' })}
            >
              <IconPlay />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Stop the song (Space)"
              aria-label="Stop the song"
              disabled={!lomReady}
              onClick={() => stop({ kind: 'song' })}
            >
              <IconStop />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Stop all clips, keep the song rolling (Esc)"
              aria-label="Stop all clips"
              disabled={!lomReady}
              onClick={() => stop({ kind: 'clips' })}
            >
              <IconStopClips />
            </button>
          </div>
        </div>
      </div>

      <div className="header-section header-right">
        <div className="header-select width-picker">
          <select
            value={columnWidth}
            aria-label="Track column display mode"
            title={columnWidthTitle(columnWidth) ?? columnWidthLabel(columnWidth)}
            onChange={(e) => onColumnWidth(e.currentTarget.value as ColumnWidth)}
          >
            {COLUMN_WIDTHS.map((w) => (
              <option key={w} value={w}>
                {columnWidthText(w)}
              </option>
            ))}
          </select>
          <span className="select-caret" aria-hidden="true" />
        </div>
        <button
          type="button"
          className={`icon-btn toggle${showMeters ? ' on' : ''}`}
          aria-pressed={showMeters}
          aria-label="Output meters"
          title={`${showMeters ? 'Hide' : 'Show'} track and master output meters`}
          onClick={onToggleMeters}
          disabled={!lomReady && !showMeters}
        >
          <IconMeter />
        </button>
        <button
          type="button"
          className="icon-btn primary"
          aria-label="Snapshot"
          title="Snapshot — re-walk the set"
          onClick={onSnapshot}
          disabled={!lomReady || busy}
        >
          <IconSync />
        </button>
      </div>
    </header>
  );
}
