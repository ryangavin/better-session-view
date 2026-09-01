import { afterEach, describe, expect, it } from 'vitest';
import { busyWork, cancelWork, claim, release, wasCancelled, type Lease } from './work.ts';

let held: Lease | null = null;
afterEach(() => {
  if (held) release(held);
  held = null;
});

describe('the shared local-engine lease', () => {
  it('allows only one kind of GPU work at a time', () => {
    held = claim('separate', 'track-a');
    expect(held).not.toBeNull();
    expect(claim('transcribe', 'track-b')).toBeNull();
    expect(busyWork()).toBe('track-a');
    expect(busyWork('separate')).toBe('track-a');
    expect(busyWork('transcribe')).toBeNull();
  });

  it('releases only the lease that actually owns the slot', () => {
    held = claim('transcribe', 'track-a');
    const stranger = { kind: 'transcribe', trackId: 'track-a', child: null, cancelled: false } as Lease;
    release(stranger);
    expect(busyWork()).toBe('track-a');
    release(held!);
    held = null;
    expect(busyWork()).toBeNull();
  });

  it('scopes late cancellation by track and kind', () => {
    held = claim('transcribe', 'track-a');
    cancelWork('track-b', 'transcribe');
    cancelWork('track-a', 'separate');
    expect(wasCancelled(held!)).toBe(false);
    cancelWork('track-a', 'transcribe');
    expect(wasCancelled(held!)).toBe(true);
  });
});
