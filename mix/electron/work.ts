import type { ChildProcess } from 'node:child_process';

/** One torch-backed worker owns the GPU at a time, whatever kind of work it is. */
export type WorkKind = 'separate' | 'transcribe';

export interface Lease {
  readonly kind: WorkKind;
  readonly trackId: string;
  child: ChildProcess | null;
  cancelled: boolean;
}

let current: Lease | null = null;
const GRACE_MS = 4000;

export const busyWork = (kind?: WorkKind): string | null =>
  current && (!kind || current.kind === kind) ? current.trackId : null;

/** Atomically take the one worker slot. */
export function claim(kind: WorkKind, trackId: string): Lease | null {
  if (current) return null;
  current = { kind, trackId, child: null, cancelled: false };
  return current;
}

export function hold(lease: Lease, child: ChildProcess): void {
  if (current === lease) lease.child = child;
}

export const wasCancelled = (lease: Lease): boolean => lease.cancelled;

export function release(lease: Lease): void {
  if (current === lease) current = null;
}

/** A late cancel may name both its track and kind, so it cannot kill later work. */
export function cancelWork(trackId?: string, kind?: WorkKind): void {
  if (!current) return;
  if (trackId && current.trackId !== trackId) return;
  if (kind && current.kind !== kind) return;
  current.cancelled = true;
  const child = current.child;
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, GRACE_MS);
}

export const stopAllWork = (): void => cancelWork();
