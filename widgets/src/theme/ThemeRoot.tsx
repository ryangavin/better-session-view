import { useMemo, type CSSProperties, type HTMLAttributes } from 'react';
import { type Theme } from './theme.ts';
import { resolveTheme } from './resolve.ts';
import '../palette.css';
import './theme.css';

import { ThemeContext } from './context.ts';
export { useTheme } from './context.ts';
/** CSS inheritance for DOM; context for canvas and other resolved-color consumers. */
export function ThemeRoot({ theme, children, className = '', style, ...props }: HTMLAttributes<HTMLDivElement> & { theme: Theme }) {
  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  return <ThemeContext.Provider value={resolved}>
    <div {...props} className={`wdg-theme-root ${className}`} style={{ ...resolved.tokens, ...style } as CSSProperties}>{children}</div>
  </ThemeContext.Provider>;
}
