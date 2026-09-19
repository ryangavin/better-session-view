import type { Param } from '../param/param.ts';
import './controls.css';
/**
 * `live.tab`: an enum with every member on screen at once.
 *
 * This is the one place a Param is genuinely optional — the control needs the
 * members and the index, and an enum Param is just where those usually come
 * from. `itemsOf` adapts one; anything else can pass a list.
 */
export interface SegmentedProps {
    items: readonly string[];
    index: number;
    onChange(next: number): void;
    disabled?: boolean;
    label?: string;
    name?: string;
    orientation?: 'horizontal' | 'vertical';
    className?: string;
    title?: string;
}
/** The members of an enum Param, for handing straight to `items`. */
export declare function itemsOf(param: Param): readonly string[];
export declare function Segmented({ items, index, onChange, disabled, label, name, orientation, className, title, }: SegmentedProps): import("react").JSX.Element;
