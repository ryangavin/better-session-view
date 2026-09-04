import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APPS, uiPort } from './apps.ts';
import { reach, reachOrigin, reachPort, reaching, type Reach } from './reach.ts';

// `reach.ts` names `electron` in a type and nowhere else, so unlike most of this
// package a test runner can reach it — and it is the file here most worth
// pinning, because it puts the window's entire API on a port. Each of the facts
// that keeps that narrow is a fact this file could lose without a symptom.

// Well clear of the 5xxx family the apps and the two benches share.
const BASE = { OPENFLOW_PORT_BASE: '18200' };
const ON = { ...BASE, OPENFLOW_DEV: '1' };

const ipc = () => {
  const registered = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    registered,
    ipcMain: {
      handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) {
        registered.set(channel, fn);
      },
    },
  };
};

let open: Reach | undefined;
afterEach(() => {
  open?.stop();
  open = undefined;
});

describe('whether it is there at all', () => {
  it('is shut for a build, and open for a dev run', () => {
    // The gate is the dev run itself: a packaged app sets neither variable.
    expect(reaching({})).toBe(false);
    expect(reaching({ OPENFLOW_DEV: '1' })).toBe(true);
    expect(reaching({ OPENFLOW_DEV_URL: 'http://elsewhere:1234' })).toBe(true);
    const { ipcMain, registered } = ipc();
    const off = reach(APPS.mix, { ipcMain, env: {} });
    ipcMain.handle('openflow:x', () => 1);
    // Registered with electron as always, and recorded nowhere.
    expect(registered.has('openflow:x')).toBe(true);
    expect(off.origin({}, 'mix://app')).toBe('mix://app');
    expect(() => off.push('openflow:x', 1)).not.toThrow();
  });

  it('trusts one origin rather than every origin', () => {
    // `*` would let any page in any browser on this machine call the whole API.
    const allowed = reachOrigin(APPS.mix, BASE);
    expect(allowed).toBe(`http://localhost:${uiPort(APPS.mix, BASE)}`);
    expect(allowed).not.toContain('*');
  });

  it('gives every app a port of its own, clear of the dev servers', () => {
    const ports = Object.values(APPS).map((one) => reachPort(one, BASE));
    expect(new Set(ports).size).toBe(ports.length);
    for (const one of Object.values(APPS)) {
      expect(reachPort(one, BASE)).toBeGreaterThan(uiPort(one, BASE) + 500);
    }
  });

  it('moves with the worktree, as the dev servers do', () => {
    const far = { OPENFLOW_PORT_BASE: '19000' };
    expect(reachPort(APPS.mix, far) - uiPort(APPS.mix, far)).toBe(
      reachPort(APPS.mix, BASE) - uiPort(APPS.mix, BASE),
    );
  });
});

describe('what a tab can call', () => {
  const start = (mounts = {}) => {
    const { ipcMain, registered } = ipc();
    open = reach(APPS.mix, { ipcMain, mounts, env: ON });
    return { ipcMain, registered, at: `http://127.0.0.1:${reachPort(APPS.mix, ON)}` };
  };

  it('forwards to the window’s own handler, and still registers it', async () => {
    // The wrap is what makes the two lists one list: a handler the window has
    // and a tab does not is a feature that works in one and not the other.
    const { ipcMain, registered, at } = start();
    ipcMain.handle('openflow:add', (_event, a: unknown, b: unknown) => Number(a) + Number(b));
    expect(registered.has('openflow:add')).toBe(true);

    const reply = await fetch(`${at}/reach/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'openflow:add', args: [2, 3] }),
    });
    expect(await reply.json()).toEqual({ value: 5 });
  });

  it('rejects rather than hangs when a handler throws', async () => {
    const { ipcMain, at } = start();
    ipcMain.handle('openflow:no', () => {
      throw new Error('nope');
    });
    const reply = await fetch(`${at}/reach/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'openflow:no', args: [] }),
    });
    expect(reply.ok).toBe(false);
    expect((await reply.json()).says).toContain('nope');
  });

  it('says so for a channel nobody registered', async () => {
    const { at } = start();
    const reply = await fetch(`${at}/reach/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'openflow:ghost', args: [] }),
    });
    expect(reply.status).toBe(404);
  });

  it('tells a tab an http origin and the window its own scheme', async () => {
    // The one answer that cannot be the same for both. The window reads audio
    // through a privileged scheme; a tab has no such scheme and would fetch a
    // URL its browser cannot resolve.
    const { ipcMain, at } = start();
    ipcMain.handle('openflow:base', (event) => open!.origin(event, 'mix://app'));

    const reply = await fetch(`${at}/reach/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'openflow:base', args: [] }),
    });
    expect((await reply.json()).value).toBe(at);
    // And an event that did not come from a tab is left alone.
    expect(open!.origin({}, 'mix://app')).toBe('mix://app');
  });
});

describe('the mounts a tab fetches', () => {
  it('serves a file inside the mount and refuses one above it', async () => {
    const where = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-'));
    fs.writeFileSync(path.join(where, 'song.wav'), 'not really audio');
    const secret = path.join(where, '..', 'secret.txt');
    fs.writeFileSync(secret, 'no');

    const { ipcMain } = ipc();
    open = reach(APPS.mix, { ipcMain, mounts: { '/library/': () => where }, env: ON });
    const at = `http://127.0.0.1:${reachPort(APPS.mix, ON)}`;

    const good = await fetch(`${at}/library/song.wav`);
    expect(good.status).toBe(200);
    expect(good.headers.get('content-type')).toBe('audio/wav');

    // The same confinement the scheme handler has, for the same reason: this is
    // a folder full of somebody's music, named in a URL the page composes.
    const bad = await fetch(`${at}/library/..%2Fsecret.txt`);
    expect(bad.status).toBe(403);

    fs.rmSync(where, { recursive: true, force: true });
    fs.rmSync(secret, { force: true });
  });
});
