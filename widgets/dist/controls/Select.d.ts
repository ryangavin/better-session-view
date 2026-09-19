import './controls.css';
/** A compact enum: one member on screen, with the rest in a menu. */
export interface SelectProps {
    items: readonly string[];
    index: number;
    onChange(next: number): void;
    disabled?: boolean;
    label?: string;
    name?: string;
    /** In px. Settle caller-owned labels so changing the selection cannot resize a panel. */
    width?: number;
    className?: string;
    title?: string;
}
export declare function Select({ items, index, onChange, disabled, label, name, width, className, title, }: SelectProps): import("react").JSX.Element;
