/**
 * Show what you just did until the authority agrees.
 *
 * Anywhere the engine owns the value, a control has two of them: the one being
 * dragged and the one that has come back. Rendering only the second makes the
 * thumb lag the pointer by a round trip; rendering only the first makes the
 * control deaf to everything else that can move it. So the local value is held
 * over the reported one, and dropped the moment the two agree.
 *
 * The timeout is the part that isn't optional. A write can be refused, clamped
 * or simply never land, and without a deadline the control would sit forever
 * showing a value nothing in the system holds — the one failure mode where a
 * mixer lies about what the set is doing.
 */
export interface PendingValue {
    /** What to draw: the local value while one is held, otherwise the reported one. */
    value: number | null;
    /** Record a local value, restarting its deadline. */
    push(next: number): void;
    /** Give up the local value now — the drag ended and the readback is authoritative. */
    release(): void;
}
export declare function usePendingValue(reported: number | null, options?: {
    tolerance?: number;
    timeout?: number;
}): PendingValue;
/**
 * The tolerance a parameter's readback should be compared at: fine enough that
 * a real change is never mistaken for the echo, coarse enough that float noise
 * doesn't hold the local value until its deadline.
 */
export declare function readbackTolerance(min: number, max: number): number;
