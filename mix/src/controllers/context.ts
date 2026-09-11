import { createContext } from 'react';
import type { LaunchkeyController } from './launchkey.ts';
/** Keep the context separate from the hot-reloaded debug panel. */
export const ControllerContext = createContext<LaunchkeyController | null>(null);
