import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { within } from './within.ts';

/**
 * This is the check standing between a page and the disk, so the tests are the
 * ways out of a directory rather than the ways into one.
 *
 * **The two callers hand it different shapes, and only one of them is
 * dangerous.** A request for the build arrives as a URL pathname and always
 * begins with a slash, which `normalize` treats as the root — so its `..`
 * segments are collapsed away before they can climb anywhere, and such a path
 * is confined no matter what it says. A request for a *mount* has its prefix
 * stripped first, so what arrives is relative, `..` is meaningful, and the
 * prefix check is the only thing between a crafted URL and the filesystem.
 */

const root = path.resolve('/srv/library');

describe('staying inside', () => {
  it('allows a file in the root', () => {
    expect(within(root, 'track.wav')).toBe(path.join(root, 'track.wav'));
  });

  it('allows a file below the root', () => {
    expect(within(root, 'stems/abc/htdemucs/vocals.wav')).toBe(
      path.join(root, 'stems/abc/htdemucs/vocals.wav'),
    );
  });

  it('allows the root itself', () => {
    expect(within(root, '')).toBe(root);
  });

  it('allows a walk that comes back inside', () => {
    // A path a browser really does compose out of a relative URL, and it names
    // a file that is genuinely in the root.
    expect(within(root, 'stems/../track.wav')).toBe(path.join(root, 'track.wav'));
  });
});

describe('a mount, where the path arrives relative', () => {
  it('refuses a walk up', () => {
    expect(within(root, '../secrets.txt')).toBeNull();
  });

  it('refuses a walk up buried in the middle', () => {
    expect(within(root, 'stems/../../secrets.txt')).toBeNull();
  });

  it('refuses a long climb', () => {
    expect(within(root, '../../../../../../etc/passwd')).toBeNull();
  });

  it('refuses a sibling that merely starts with the same letters', () => {
    // Without the separator on the prefix, `/srv/library` claims
    // `/srv/library-backup`, and the traversal is one `..` away.
    expect(within(root, '../library-backup/x.wav')).toBeNull();
  });
});

describe('a build, where the path arrives from a URL', () => {
  it('confines a climb rather than following it, because the slash is the root', () => {
    // `normalize` resolves a leading slash as the top and drops the `..` that
    // would go above it, so this lands inside and 404s rather than escaping.
    expect(within(root, '/../../../etc/passwd')).toBe(path.join(root, 'etc/passwd'));
  });

  it('keeps an absolute-looking path inside the root instead of honouring it', () => {
    expect(within(root, '/etc/passwd')).toBe(path.join(root, 'etc/passwd'));
  });
});
