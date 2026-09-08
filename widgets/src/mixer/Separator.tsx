import type { CSSProperties, ReactNode } from 'react';

/** A rule owns its clearance; neither the stroke nor the clearance may shrink. */
export function Separator({ orientation = 'horizontal', className = '', style }: {
  orientation?: 'horizontal' | 'vertical'; className?: string; style?: CSSProperties;
}) {
  return <div role="separator" aria-orientation={orientation} className={`play-separator play-separator-${orientation} ${className}`} style={style}/>;
}

export function MixerSection({ className, children }: { className:string; children:ReactNode }) {
  return <div className="play-section-stack"><Separator/><div className={className}>{children}</div></div>;
}
