import { createContext, useContext } from 'react';
import { DEFAULT_THEME } from './theme.ts';
import { resolveTheme } from './resolve.ts';

// Kept separate from ThemeRoot so a canvas subscription imports no global stylesheet.
export const ThemeContext = createContext(resolveTheme(DEFAULT_THEME));
export const useTheme = () => useContext(ThemeContext);
