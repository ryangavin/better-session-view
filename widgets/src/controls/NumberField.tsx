import { useCallback, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useParamGesture } from '../gesture/useParamGesture.js';
import { clamp, quantize, type Param } from '../param/param.js';
import { defaultOrigin, fillFrom, type FillOrigin } from './fill.js';
import './controls.css';

/** `live.numbox`: drag it like a fader, or type into it. */
export interface NumberFieldProps {
  param: Param;
  value: number;
  onChange(next: number): void;
  onRelease?(): void;
  disabled?: boolean;
  display?: string;
  label?: string;
  name?: string;
  /** Typing a digit or pressing Enter opens the editor. Never for an enum. */
  editable?: boolean;
  /** The value drawn as a bar behind the text, as Live's own value boxes do. */
  showFill?: boolean;
  /** Where that bar grows from. Defaults to the middle when zero is the middle. */
  origin?: FillOrigin;
  width?: number;
  travel?: number;
  className?: string;
  title?: string;
}

const OPENS_EDITOR = /^[-+.0-9]$/;

export function NumberField({
  param,
  value,
  onChange,
  onRelease,
  disabled = false,
  display,
  label,
  name = param.shortName ?? param.name,
  editable = true,
  showFill = true,
  origin = defaultOrigin(param),
  width,
  travel,
  className,
  title,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const typeable = editable && param.kind !== 'enum' && param.kind !== 'blob' && !disabled;

  const gesture = useParamGesture({
    param,
    value,
    onChange,
    onRelease,
    disabled,
    axis: 'horizontal',
    travel,
    label: label ?? name,
    display,
  });

  const commit = useCallback(
    (text: string) => {
      setDraft(null);
      const parsed = Number.parseFloat(text);
      if (Number.isNaN(parsed)) return;
      onChange(quantize(param, clamp(param, parsed)));
      onRelease?.();
    },
    [onChange, onRelease, param],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (typeable && (e.key === 'Enter' || OPENS_EDITOR.test(e.key))) {
      e.preventDefault();
      e.stopPropagation();
      setDraft(e.key === 'Enter' ? '' : e.key);
      return;
    }
    gesture.props.onKeyDown(e);
  };

  return (
    <div
      className={`wdg wdg-number${className ? ` ${className}` : ''}`}
      style={
        {
          ...fillFrom(param, origin, gesture.fraction),
          ...(width === undefined ? {} : { '--wdg-number-width': `${width}px` }),
        } as CSSProperties
      }
    >
      {name && <span className="wdg-caption">{name}</span>}
      {draft === null ? (
        <div className="wdg-number-body" title={title} {...gesture.props} onKeyDown={onKeyDown}>
          {showFill && <span className="wdg-number-fill" aria-hidden="true" />}
          <span className="wdg-number-text">{gesture.text}</span>
        </div>
      ) : (
        <input
          className="wdg-number-body wdg-number-input"
          ref={(node) => {
            node?.focus();
          }}
          value={draft}
          aria-label={label ?? name}
          inputMode="decimal"
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            else if (e.key === 'Escape') setDraft(null);
            else return;
            e.preventDefault();
          }}
        />
      )}
    </div>
  );
}
