/**
 * The geometry a dial is drawn from: a 270° sweep opening at the bottom, which
 * is the shape Ableton and `live.dial` both use.
 */
export declare const DIAL_CENTER = 20;
export declare const DIAL_RADIUS = 15;
export declare const DIAL_START = -135;
export declare const DIAL_END = 135;
/** Crop unused square-canvas space without changing the dial geometry's scale. */
export declare const DIAL_VIEWBOX_TOP = 2;
export declare const DIAL_VIEWBOX_HEIGHT = 32;
export declare function dialAngle(fraction: number): number;
export declare function dialPoint(degrees: number, radius?: number): [number, number];
/** Null rather than a zero-length path, which a round cap would draw as a dot. */
export declare function dialArc(fromDegrees: number, toDegrees: number): string | null;
