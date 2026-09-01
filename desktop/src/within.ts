import path from 'node:path';

/**
 * A file inside a directory, or nothing.
 *
 * Pulled out of `serve.ts` and given its own tests because of what it now
 * guards. Serving an app's own build out of a directory nobody can write to is
 * one thing; serving a **mount** — a folder full of somebody's music, named in
 * a URL the page composes — is the case where getting this wrong hands the
 * renderer the filesystem.
 *
 * Both halves are needed and neither is sufficient. `path.normalize` collapses
 * the `..` segments a crafted URL arrives with, and the prefix check is what
 * makes that collapse mean anything. Normalising without checking still walks
 * out of the root on an absolute path; checking without normalising compares a
 * string that has not been resolved yet.
 *
 * The separator on the end of the prefix is not decoration: without it,
 * `/library` would happily claim `/library-backup`.
 */
export function within(root: string, rel: string): string | null {
  const file = path.join(root, path.normalize(rel));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}
