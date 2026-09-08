import fsp from 'node:fs/promises';
import path from 'node:path';
import { readWav } from '../src/audio.ts';
import { walk, SCAN_RATE, SCAN_VALUES } from '../src/play/scan.ts';
import { readScanFile, writeScans } from './analysis.ts';

/**
 * The stems walked as they are separated, so the first load is as quick as the
 * second.
 *
 * A deck reads a scan beside the track rather than a hundred million samples,
 * and until now the load that wrote it paid for it. The stems are float WAV on
 * disk the moment demucs is done and the same walk reads them here, so a track
 * separated this minute opens like one played all week. The original is not
 * walked here — it is flac or webm or m4a, and the decoder for those is in the
 * window — but a scan of it kept by an earlier load is carried across, and a
 * separation does not invalidate it.
 *
 * Derived, so it is never worth an error: a stem that will not parse leaves the
 * job's answer alone and the window walks what it needs.
 */
export async function keepStemScans(
  root: string,
  trackId: string,
  stems: string,
  sources: readonly string[],
): Promise<void> {
  try {
    const held = await readScanFile(root, trackId);
    const kept: Record<string, { bins: number; values: Float32Array }> = {};
    // A scan of the original outlives any separation; one of these stems does not.
    if (held?.rate === SCAN_RATE && held.sources.full) kept.full = held.sources.full;
    for (const source of sources) {
      const audio = await read(path.join(root, stems, `${source}.wav`));
      if (!audio) return;
      const steps = walk(audio);
      for (let since = 0; ; since++) {
        const step = steps.next();
        if (step.done) { kept[source] = { bins: step.value.bins, values: step.value.values }; break; }
        // The window has to stay answerable while this runs: it is minutes into
        // a job it is watching, and the IPC it asks over is this same loop.
        if (since % 4096 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    await writeScans(root, trackId, stems, SCAN_RATE, kept);
  } catch {
    // Nothing kept is the state the window already knows how to be in.
  }
}

/** Every source a scan of these stems already holds, or none. */
export async function scanned(root: string, trackId: string, stems: string, sources: readonly string[]): Promise<boolean> {
  const held = await readScanFile(root, trackId);
  if (!held || held.stems !== stems || held.rate !== SCAN_RATE) return false;
  return sources.every((source) => {
    const scan = held.sources[source];
    return !!scan && scan.values.length === scan.bins * SCAN_VALUES;
  });
}

async function read(at: string) {
  const bytes = await fsp.readFile(at);
  const wav = readWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  if (!wav) return null;
  const length = wav.channels[0].length;
  return { channels: wav.channels, sampleRate: wav.rate, length, duration: length / wav.rate };
}
