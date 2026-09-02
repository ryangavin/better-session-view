import { useEffect, useMemo, useRef } from 'react';
import { rankOf, ruleEvery, TICKS_PER_BAR } from '../grid.ts';
import {
  assignFrets,
  fretMark,
  type FrettedNote,
  type TranscribedNote,
  type Tuning,
} from '../tab.ts';
import type { Bars } from '../warp.ts';
import type { Span } from '../zoom.ts';

export interface TablatureProps {
  notes: readonly TranscribedNote[];
  tuning: Tuning;
  seconds: number;
  bars: Bars;
  span: Span;
  height: number;
  onSeek?(fraction: number): void;
}

/** A fretted event projected into the slice of the song currently on screen. */
export interface DrawnFret extends FrettedNote {
  at: number;
  until: number;
  label: string;
}

function projectFrets(
  fretted: readonly FrettedNote[],
  seconds: number,
  span: Span,
): DrawnFret[] {
  if (!(seconds > 0) || !(span.to > span.from)) return [];
  const wide = span.to - span.from;
  return fretted
    .filter((note) => note.end / seconds >= span.from && note.start / seconds <= span.to)
    .map((note) => ({
      ...note,
      at: (note.start / seconds - span.from) / wide,
      until: (note.end / seconds - span.from) / wide,
      label: fretMark(note),
    }));
}

/**
 * Place the complete fret path into one visible view.
 *
 * Fret assignment happens before filtering. Choosing positions only from the
 * notes on screen would make the first note jump strings as the view paged,
 * even though the transcription itself had not changed.
 */
export function fretsIn(
  notes: readonly TranscribedNote[],
  tuning: Tuning,
  seconds: number,
  span: Span,
): DrawnFret[] {
  return projectFrets(assignFrets(notes, tuning), seconds, span);
}

const ink = (el: HTMLElement, name: string, fallback: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/**
 * The detected MIDI performance, drawn as bass tablature on the shared song
 * timeline.
 *
 * Every note contributes its duration stroke. Fret labels are thinned only
 * when the whole song is too dense to print them without collisions; zooming
 * reveals them again. The data is never thinned, and the position remains the
 * MIDI onset rather than a visual quantisation.
 */
export function Tablature({ notes, tuning, seconds, bars, span, height, onSeek }: TablatureProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // The dynamic program sees the whole phrase once. Panning and zooming only
  // project that settled path; they must not make the instrument re-finger it.
  const assigned = useMemo(() => assignFrets(notes, tuning), [notes, tuning]);
  const frets = useMemo(
    () => projectFrets(assigned, seconds, span),
    [assigned, seconds, span],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    const paint = () => {
      const box = el.getBoundingClientRect();
      if (box.width < 1 || height < 1) return;
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(box.width * dpr);
      el.height = Math.round(height * dpr);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, height);

      const detail = ink(el, '--detail', '#8b8b93');
      const caption = ink(el, '--caption', '#5e5e66');
      const border = ink(el, '--bd', '#262629');
      const bar = ink(el, '--idle', '#3a3a41');
      const surface = ink(el, '--surface-lane-head', '#151518');
      const amber = ink(el, '--amber', '#e4a85d');
      const red = ink(el, '--red', '#d4544f');

      const view = span.to - span.from;
      const track = box.width / view;
      const xOf = (fraction: number) => (fraction - span.from) * track;

      // The same musical ruling as every waveform, behind the string lines.
      if (bars.across > 0) {
        const ticks = bars.across * TICKS_PER_BAR;
        const origin = bars.origin * TICKS_PER_BAR;
        const step = ruleEvery(track / ticks);
        const first = Math.floor((span.from * ticks + origin) / step) * step;
        const last = Math.ceil(span.to * ticks + origin);
        for (let tick = first; tick <= last; tick += step) {
          const x = Math.round(xOf((tick - origin) / ticks)) + 0.5;
          const rank = rankOf(tick);
          ctx.fillStyle = rank === 'phrase' || rank === 'bar' ? bar : border;
          ctx.fillRect(x, 0, 1, height);
        }
      }

      const top = 13;
      const bottom = height - 13;
      const gap = tuning.length > 1 ? (bottom - top) / (tuning.length - 1) : 0;
      const yOf = (string: number) => top + (tuning.length - 1 - string) * gap;

      ctx.font = '600 10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let string = 0; string < tuning.length; string += 1) {
        const y = Math.round(yOf(string)) + 0.5;
        ctx.fillStyle = border;
        ctx.fillRect(0, y, box.width, 1);
      }

      // All durations remain visible at whole-song width. Labels need enough
      // room to be read; where they collide, the duration tick stays and zoom
      // is what earns the number back.
      const labelledUntil = new Array<number>(tuning.length).fill(-Infinity);
      for (const note of frets) {
        const x = note.at * box.width;
        const until = note.until * box.width;
        if (until < 0 || x > box.width) continue;
        const y = yOf(note.string);
        const colour = note.unplayable ? red : note.muted ? caption : amber;
        ctx.globalAlpha = note.muted ? 0.65 : Math.max(0.5, note.confidence);
        ctx.fillStyle = colour;
        ctx.fillRect(Math.max(0, x), y - 2, Math.max(1, Math.min(box.width, until) - Math.max(0, x)), 4);
        ctx.globalAlpha = 1;

        const labelWidth = Math.max(10, ctx.measureText(note.label).width + 6);
        if (x - labelWidth / 2 <= labelledUntil[note.string]) continue;
        ctx.fillStyle = surface;
        ctx.fillRect(x - labelWidth / 2, y - 7, labelWidth, 14);
        ctx.strokeStyle = colour;
        ctx.strokeRect(x - labelWidth / 2 + 0.5, y - 6.5, labelWidth - 1, 13);
        ctx.fillStyle = colour;
        ctx.fillText(note.label, x, y + 0.5);
        labelledUntil[note.string] = x + labelWidth / 2 + 3;
      }

      // Fixed string names make it tablature at any pan position. The small
      // plate covers whatever is underneath instead of moving the time scale.
      ctx.fillStyle = surface;
      ctx.globalAlpha = 0.94;
      ctx.fillRect(0, 0, 30, height);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      for (let string = 0; string < tuning.length; string += 1) {
        ctx.fillStyle = detail;
        ctx.fillText(tuning[string]!.name, 5, yOf(string) + 0.5);
      }
    };

    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [frets, tuning, bars, span, height]);

  const seek = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const box = event.currentTarget.getBoundingClientRect();
    const across = (event.clientX - box.left) / box.width;
    onSeek(span.from + across * (span.to - span.from));
  };

  return <canvas ref={canvas} className="mf-tablature-canvas" style={{ height }} onClick={seek} />;
}
