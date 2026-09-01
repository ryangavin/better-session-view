import { app as electron } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import type { App } from './apps.ts';

/**
 * Every app here, kept current, from one place.
 *
 * This is the thing the shared main process exists for. An updater is the same
 * program in every app — check a feed, download in the background, install on
 * quit — and it is the kind of program you want to write once and fix once. The
 * third app gets it by calling this; the fourth gets it by existing.
 *
 * **It is off until a release has a feed to point at, and that is a deliberate
 * gap rather than an unfinished one.** Four things have to be true before an
 * app can update itself, and only the first two are code:
 *
 *   1. a `publish:` block in `desktop/electron-builder.base.yml`, naming the
 *      GitHub repo — that is what writes `app-update.yml` into the bundle, and
 *      its absence is what this checks for;
 *   2. `zip` alongside `dmg` in the mac targets, because Squirrel.Mac updates
 *      from a zip and cannot read a disk image;
 *   3. `latest-mac.yml` attached to the release, which electron-builder emits
 *      beside the artifacts once (1) is set;
 *   4. a **published** release. `release.yml` creates drafts on purpose, so the
 *      notes get one last human read, and a draft is invisible to the feed.
 *
 * Until then this returns on the first line and costs nothing. Wiring it now is
 * the point: switching it on later is a config change in one file rather than a
 * feature in three apps.
 */

/** How often to ask again, for an app that stays open across a working day. */
const EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * The file electron-builder writes into the bundle when it knows where releases
 * live. Without it electron-updater has no feed, and asking anyway is an error
 * in the log of every dev run.
 */
const feed = (): boolean =>
  electron.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));

export function updates(one: App): void {
  if (!feed()) return;

  // Downloaded quietly, installed on quit. An app that interrupts a set to ask
  // about a new version is worse than one that never updates — the whole design
  // is that you find out you are current the next time you launch.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`${one.name}: ${info.version} is out — downloading`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`${one.name}: ${info.version} is ready — it installs when you quit`);
  });
  // A machine with no network is the ordinary case on a stage, and a failed
  // check must never be more than a line in a log.
  autoUpdater.on('error', (error) => {
    console.error(`${one.name}: could not check for updates — ${error.message}`);
  });

  const ask = () => {
    void autoUpdater.checkForUpdates()?.catch(() => {});
  };
  ask();
  const again = setInterval(ask, EVERY_MS);
  electron.on('before-quit', () => clearInterval(again));
}
