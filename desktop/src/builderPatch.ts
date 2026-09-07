/** Backport electron-builder #10101 until the pinned v26 package ships it.
 * https://github.com/electron-userland/electron-builder/commit/7abb30e393326676237862163a115c96e2f0e80d
 * Only the temporary keychain password unlocks its partition list. The P12
 * password remains exclusively the certificate import password.
 */
export function repairBuilder(source: string): string {
  const edits = [
    ['importCerts(keychainFile, certPaths, cscPasswords)',
      'importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)'],
    ['async function importCerts(keychainFile, paths, keyPasswords)',
      'async function importCerts(keychainFile, paths, keyPasswords, keychainPassword)'],
    ['["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]',
      '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile]'],
  ] as const;
  if (edits.every(([, fixed]) => source.split(fixed).length === 2)) return source;
  if (!edits.every(([broken]) => source.split(broken).length === 2)) {
    throw new Error('Unexpected electron-builder signing code; review the keychain backport before packing');
  }
  for (const [broken, fixed] of edits) source = source.replace(broken, fixed);
  return source;
}
