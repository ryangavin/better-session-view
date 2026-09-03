/**
 * The two things the harness page cannot do from a browser once a grid is
 * decided: keep it, and export by it.
 *
 * PUT /harness/grid/<track id> writes the grid into the app's library —
 * `analysis/<track>/analysis.json`, the same file the app reads on opening
 * the track — so a grid decided here is the grid there. POST
 * /harness/export/<track id> lays every stem straight at a whole tempo from
 * 1.1.1 and writes them where the app's exports go, named for the tempo so
 * Live reads it off the file.
 *
 * The library root and the export folder come from the app's own settings
 * file, which is the one place either is recorded.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';
import { readWav, wavOf } from '../src/audio.ts';
import { straightened, type Ruling } from '../src/straighten.ts';
import { writeAnalysis, type Grid, type Reading } from '../electron/analysis.ts';
import { readSettings, settingsIn } from '../electron/settings.ts';

const SETTINGS = settingsIn(path.join(os.homedir(), '.openflow', 'mix', 'electron'));

interface ExportAsk extends Ruling {
  title: string;
  /** Stem files, relative to the reports folder. */
  stems: string[];
}

interface Written {
  where: string;
  files: string[];
  bars: number;
  seconds: number;
  speed: number;
}

const body = (req: NodeJS.ReadableStream): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

/** A file name Finder and Live will both take: no separators, no colons, one line. */
const tidy = (text: string): string => text.replace(/[/\\:]+/g, '-').replace(/\s+/g, ' ').trim() || 'untitled';

async function exportStems(reports: string, id: string, ask: ExportAsk): Promise<Written> {
  if (!(ask.bpm > 0) || !(ask.to > 0) || !Number.isFinite(ask.offset)) throw new Error('bad ruling');
  const settings = await readSettings(SETTINGS);
  const under = settings.exports ?? path.join(os.homedir(), 'Music', 'mixflow');
  const label = Number.isInteger(ask.to) ? String(ask.to) : ask.to.toFixed(3);
  const where = path.join(under, `${tidy(ask.title)} ${label}bpm`);
  fs.mkdirSync(where, { recursive: true });
  const files: string[] = [];
  let bars = 0;
  let seconds = 0;
  let speed = 1;
  for (const stem of ask.stems) {
    if (!stem.startsWith(`${id}/`) || stem.includes('..')) throw new Error(`stem outside the track: ${stem}`);
    const bytes = fs.readFileSync(path.join(reports, stem));
    const read = readWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (!read) throw new Error(`${stem}: not a wav this reads`);
    const laid = straightened(read.channels, read.rate, ask);
    const source = path.basename(stem, '.wav');
    const file = path.join(where, `${tidy(ask.title)} - ${source} - ${label}bpm.wav`);
    fs.writeFileSync(file, Buffer.from(wavOf(laid.channels, laid.rate)));
    files.push(file);
    bars = laid.bars;
    seconds = laid.seconds;
    speed = laid.speed;
  }
  return { where, files, bars, seconds, speed };
}

async function keepGrid(id: string, ask: { grid: Grid | null; fit: Reading | null }): Promise<string> {
  const settings = await readSettings(SETTINGS);
  if (!settings.library) throw new Error('the app has no library folder chosen');
  const manifest = JSON.parse(fs.readFileSync(path.join(settings.library, 'library.json'), 'utf8')) as {
    tracks?: { id: string }[];
  };
  if (!manifest.tracks?.some((t) => t.id === id)) throw new Error(`track ${id} is not in the app's library`);
  await writeAnalysis(settings.library, id, ask);
  return path.join(settings.library, 'analysis', id, 'analysis.json');
}

export function gridExport(reports: string): Plugin {
  return {
    name: 'harness-export',
    configureServer(server) {
      const handle = (prefix: string, method: string, act: (id: string, ask: never) => Promise<unknown>) =>
        server.middlewares.use(prefix, (req, res, next) => {
          if (req.method !== method) return next();
          const id = decodeURIComponent((req.url ?? '/').slice(1));
          if (!/^[A-Za-z0-9_-]+$/.test(id)) {
            res.statusCode = 400;
            return res.end('bad id');
          }
          void body(req)
            .then((text) => act(id, JSON.parse(text) as never))
            .then((answer) => {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify(answer));
            })
            .catch((error: unknown) => {
              res.statusCode = 400;
              res.end(error instanceof Error ? error.message : String(error));
            });
        });
      handle('/harness/grid/', 'PUT', (id, ask) => keepGrid(id, ask).then((where) => ({ where })));
      handle('/harness/export/', 'POST', (id, ask) => exportStems(reports, id, ask));
    },
  };
}
