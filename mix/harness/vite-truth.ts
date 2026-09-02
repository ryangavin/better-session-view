/**
 * The one thing the harness page cannot do from a browser: write the beats
 * corrected by hand to disk. A dev-server middleware takes a PUT of a Truth
 * at /harness/truth/<track id> and writes reports/truth/<track id>.json,
 * where the warp tool reads it. Reads go through Vite's static serving as
 * for any other file under mix/.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export function truthWriter(reports: string): Plugin {
  const dir = path.join(reports, 'truth');
  return {
    name: 'harness-truth',
    configureServer(server) {
      server.middlewares.use('/harness/truth/', (req, res, next) => {
        if (req.method !== 'PUT') return next();
        const id = decodeURIComponent((req.url ?? '/').slice(1).replace(/\.json$/, ''));
        if (!/^[A-Za-z0-9_-]+$/.test(id)) {
          res.statusCode = 400;
          return res.end('bad id');
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const truth = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { track?: string };
            if (truth.track !== id) throw new Error('truth names another track');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(truth, null, 2));
            res.statusCode = 204;
            res.end();
          } catch (error) {
            res.statusCode = 400;
            res.end(error instanceof Error ? error.message : String(error));
          }
        });
      });
    },
  };
}
