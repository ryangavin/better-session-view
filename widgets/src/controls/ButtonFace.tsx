import type { ComponentPropsWithRef } from 'react';
import './controls.css';

/** Shared button surface for actions, switches and custom held-input gestures. */
export function ButtonFace({lit, size, tone='normal', className='', children, 'aria-pressed':pressed, ...props}: ComponentPropsWithRef<'button'> & {
  lit?:boolean; size?:'small'|'medium'; tone?:'normal'|'quiet'|'danger';
}) {
  const toggle=lit!==undefined || pressed!==undefined;
  return <button {...props} type={props.type ?? 'button'} aria-pressed={pressed}
    className={`wdg-body ${toggle?'wdg-toggle-body':'wdg-button-body'} ${className}`}
    data-tone={tone} data-size={size} data-on={(lit ?? (pressed===true || pressed==='true')) ? '' : undefined}>{children}</button>;
}
