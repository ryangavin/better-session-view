import { app as electron } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type { App } from './apps.ts';

/**
 * Where an app's own state lives, and it has to be said **before anything can
 * read it**.
 *
 * An unpackaged Electron app defaults to `~/Library/Application Support/
 * Electron` — a directory every unpackaged Electron app on the machine shares,
 * this repo's included. That is where `localStorage` goes, so leaving it there
 * would mean set[flow]'s column widths and visual[flow]'s keystone corners in
 * one bucket, each disappearing the day something else claimed it.
 *
 * Under `~/.openflow` instead, which is the root this project already keeps
 * state in, and one directory per app beneath it. Moving this later moves the
 * storage, so it is the first line of every `main.ts` for a reason.
 */
export function state(one: App): string {
  const home = process.env.OPENFLOW_HOME ?? path.join(os.homedir(), '.openflow');
  const here = path.join(home, one.name, 'electron');
  electron.setPath('userData', here);
  return here;
}
