/**
 * What an arriving number does to a row: a trail behind it, and a warmth in
 * the reading.
 *
 * A control being *driven* is a different claim from a control holding a
 * number, and a row that only moved a mark could not make it: at the rate a
 * display samples a signal, a mark either sits still between samples or jumps,
 * and a jump between two positions looks the same as somebody dragging. So the
 * mark grows a tail, and the number lights up.
 *
 * Both are drawn straight onto the element as custom properties, never through
 * state. A row that re-rendered to move a mark two pixels would be the render
 * path a canvas of nodes is built to avoid — the same reason the graph keeps
 * its port geometry in a ref.
 */
/**
 * How many marks the trail is drawn with.
 *
 * They are **a cascade of lags**, each chasing the one in front, rather than
 * six delayed samples of the source. Delayed samples are the obvious way and
 * they fail on anything that holds a value — a sample-and-hold, or a number
 * arriving ten times a second — because the six then sit at six unrelated
 * readings, and a row that reads as six other numbers is worse than one that
 * reads as none. Chasing, a step stretches into a streak and collapses back to
 * a point, which is one number moving.
 */
export declare const WAKE_MARKS = 6;
/**
 * One frame of the cascade, in place: the head goes where the signal is, and
 * every mark behind it closes on the one in front.
 *
 * The whole trail is therefore always *between* where the number was and where
 * it is, in order, which is the property that makes it read as one number
 * moving. It also means a mark can never overtake another, so no amount of
 * jitter turns the trail inside out.
 */
export declare function chase(marks: number[], head: number, dt: number): number[];
export interface WakeOptions {
    /**
     * Where the thing driving the control has it now, 0 to 1, or nothing.
     *
     * Nothing means nothing to trail — a control with no driver, or one whose
     * range is zero, has no travel for a wake to describe.
     */
    live?: number;
    /**
     * The reading as it is printed.
     *
     * Every change warms it, whoever caused the change: a cord moving it and a
     * hand dragging it are the same event to a number, and one rule for both is
     * why an unwired row still answers when you touch it.
     */
    reading?: string;
}
/**
 * A ref for the control's root element, which is written to on a clock.
 *
 * `--wdg-wake-0` … `--wdg-wake-5` are the trail, head first, and `--wdg-heat`
 * is how lately the reading changed, 1 down to 0. The clock stops as soon as
 * the trail has caught up and the reading has cooled, so a still row costs
 * nothing.
 */
export declare function useWake({ live, reading }: WakeOptions): import("react").RefObject<HTMLDivElement | null>;
