import { hex } from '../../../core/src/color.js';

interface Props {
  palette: number[];
  /** The index shown as chosen, or null/-1 for none. */
  current: number | null;
  onPick: (index: number) => void;
  disabled?: boolean;
  /** Tooltip per swatch. Defaults to `index N`. */
  titleFor?: (index: number, rgb: number) => string;
  /** The modal's wider grid — `.swatches.wide`. */
  wide?: boolean;
}

/**
 * The palette as a grid of clickable swatches — clip color, song color and
 * role color all render the same Live palette the same way.
 */
export function SwatchGrid({ palette, current, onPick, disabled, titleFor, wide }: Props) {
  return (
    <div className={`swatches${wide ? ' wide' : ''}`}>
      {palette.map((rgb, i) => (
        <button
          key={i}
          type="button"
          className={`sw${current === i ? ' on' : ''}`}
          style={{ background: hex(rgb) }}
          title={titleFor ? titleFor(i, rgb) : `index ${i}`}
          disabled={disabled}
          onClick={() => onPick(i)}
        />
      ))}
    </div>
  );
}
