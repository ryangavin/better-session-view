/**
 * Getting the stems into memory, and turning them into something to draw.
 *
 * The window reaches its audio over `mix://app/library/…`, which the main
 * process mounts on the library folder. That is deliberately not IPC: four
 * stems of a four-minute track are a few hundred megabytes, and passing them
 * through a message port copies every byte. It is deliberately not `file://`
 * either — a different origin, which the page cannot fetch from.
 *
 * **The peaks are computed from the same buffers that play.** That is the whole
 * point of doing it here rather than writing a peak file in the main process:
 * a drawing derived from anything other than the audio in the graph can
 * disagree with it, and a waveform that disagrees with what you hear is worse
 * than no waveform, because it looks like the file is wrong.
 */

/** One column of a drawing: how far the signal reached either side of zero. */
export interface Peak {
  min: number;
  max: number;
}

/**
 * Where the library is served from, before the main process has said.
 *
 * Absolute on the app's own scheme rather than root-relative, and that is not a
 * style choice — it is the only form that works in both places this page runs.
 * Built, the page is already on `mix://app/` and either would do. Under `npm
 * run dev:mix` it is on vite's `http://localhost:…`, where a root-relative path
 * would ask vite for a file it has never heard of. The scheme is registered
 * `corsEnabled` and the mount answers with an allow-origin header, so the
 * cross-origin fetch a dev session makes is answered the same way the
 * same-origin one is. Both are checked, in Electron, against a real stem.
 */
export const LIBRARY = 'mix://app/library/';

/**
 * A stem's URL, given where the library is mounted and the manifest's relative
 * path to the stem folder.
 *
 * The base is asked for rather than assumed, because the process that serves
 * the files is the one that knows where it put them — and because it lets the
 * same page be served over plain HTTP with the library beside it, which is how
 * this gets looked at on a device that cannot run Electron.
 */
export const stemUrl = (base: string, stems: string, source: string): string =>
  fileUrl(base, `${stems}/${source}.wav`);

/**
 * Any file in the library, by its manifest-relative path.
 *
 * The same joining `stemUrl` does, which is why it is the thing `stemUrl` is
 * now written in terms of: one place decides how a relative path becomes a URL,
 * so a cover and a stem cannot disagree about a double slash.
 */
export const fileUrl = (base: string, at: string): string =>
  `${base}/${at}`.replace(/([^:])\/+/g, '$1/');

/**
 * A WAV this app wrote, read without asking the browser.
 *
 * The fallback for `decodeAudioData`, and it exists because the output contract
 * is float32 — `demucs/README.md`'s reason: independently rescaled stems do not
 * sum. Float WAV is not the common case a decoder is tuned for, and a build
 * that cannot read one would silently lose the only format this app produces.
 * Reading it is a header and a copy, so the certainty is nearly free.
 *
 * Returns null for anything that is not the shape we write, which is the signal
 * to let the browser try.
 */
export function readWav(
  bytes: ArrayBuffer,
): { channels: Float32Array<ArrayBuffer>[]; rate: number } | null {
  const view = new DataView(bytes);
  if (bytes.byteLength < 44) return null;
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let data: { at: number; length: number } | null = null;

  // Chunk walk rather than fixed offsets: a writer is free to put anything
  // between `fmt ` and `data`, and several do.
  let at = 12;
  while (at + 8 <= bytes.byteLength) {
    const kind = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (kind === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      rate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (kind === 'data') {
      data = { at: body, length: Math.min(size, bytes.byteLength - body) };
    }
    // Chunks are word-aligned, and an odd size carries a pad byte the size
    // does not mention.
    at = body + size + (size % 2);
  }

  if (!data || channels < 1 || rate < 1) return null;
  const float = format === 3 && bits === 32;
  const short = format === 1 && bits === 16;
  if (!float && !short) return null;

  const width = bits / 8;
  const frames = Math.floor(data.length / (width * channels));
  const out = Array.from(
    { length: channels },
    () => new Float32Array(new ArrayBuffer(frames * 4)),
  );
  for (let f = 0; f < frames; f++) {
    const base = data.at + f * width * channels;
    for (let c = 0; c < channels; c++) {
      out[c][f] = float
        ? view.getFloat32(base + c * 4, true)
        : view.getInt16(base + c * 2, true) / 32768;
    }
  }
  return { channels: out, rate };
}

/**
 * Channels written as a float32 WAV, the format the stems arrive in.
 *
 * Float because that is what was separated and what will be read back: a
 * stem rescaled to 16 bits on the way out would be the one thing in the
 * library that does not sum. Every channel is taken to be the length of the
 * first.
 */
export function wavOf(channels: readonly Float32Array[], rate: number): ArrayBuffer {
  const frames = channels[0]?.length ?? 0;
  const width = 4 * channels.length;
  const bytes = new ArrayBuffer(44 + frames * width);
  const view = new DataView(bytes);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < 4; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + frames * width, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * width, true);
  view.setUint16(32, width, true);
  view.setUint16(34, 32, true);
  tag(36, 'data');
  view.setUint32(40, frames * width, true);
  for (let f = 0; f < frames; f++) {
    const base = 44 + f * width;
    for (let c = 0; c < channels.length; c++) view.setFloat32(base + c * 4, channels[c][f] ?? 0, true);
  }
  return bytes;
}

/**
 * One stem, decoded.
 *
 * The browser first, because it knows every format and resamples; our own
 * reader second, for the float32 WAVs this app writes. `decodeAudioData`
 * detaches the buffer it is given, so the fallback gets its own copy — reading
 * a detached buffer is an empty stem rather than an error, which is the worst
 * of the available failures.
 */
export async function decode(ctx: BaseAudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  const spare = bytes.slice(0);
  try {
    return await ctx.decodeAudioData(bytes);
  } catch (why) {
    const read = readWav(spare);
    if (!read) throw why;
    const buffer = ctx.createBuffer(read.channels.length, read.channels[0].length, read.rate);
    read.channels.forEach((channel, i) => buffer.copyToChannel(channel, i));
    return buffer;
  }
}

/**
 * `columns` peaks across the whole buffer, loudest-in-the-span rather than
 * point-sampled.
 *
 * A column is a *span* of time and the thing drawn in it is the furthest the
 * signal got anywhere inside it. Point-sampling instead is what makes a drum
 * lane look like a ruled line: a transient that decays inside a column is
 * either caught whole or missed entirely depending on where the column landed.
 *
 * Channels are folded by taking the widest excursion of either, not by
 * averaging them: a hard-panned hat is in the picture at its real height rather
 * than at half of it.
 */
export function peaksOf(buffer: AudioBuffer, columns: number): Peak[] {
  const data = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const per = buffer.length / columns;
  const out: Peak[] = new Array(columns);
  for (let i = 0; i < columns; i++) {
    const from = Math.floor(i * per);
    const to = Math.min(buffer.length, Math.max(from + 1, Math.floor((i + 1) * per)));
    let low = 0;
    let high = 0;
    for (const channel of data) {
      for (let s = from; s < to; s++) {
        const value = channel[s];
        if (value < low) low = value;
        else if (value > high) high = value;
      }
    }
    out[i] = { min: low, max: high };
  }
  return out;
}

/** Peaks as one flat array of min, max pairs — how they are kept on disk. */
export function packed(peaks: readonly Peak[]): Float32Array {
  const out = new Float32Array(peaks.length * 2);
  peaks.forEach((peak, i) => {
    out[i * 2] = peak.min;
    out[i * 2 + 1] = peak.max;
  });
  return out;
}

export function unpacked(floats: Float32Array): Peak[] {
  const out: Peak[] = new Array(floats.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = { min: floats[i * 2], max: floats[i * 2 + 1] };
  return out;
}

/**
 * The same peaks at a coarser resolution, folded rather than re-scanned.
 *
 * `by` columns into one, taking the widest excursion of the group — which is
 * exactly what `peaksOf` would have produced at that count, because the group
 * boundaries land on the same samples. It costs a walk of the peaks instead of
 * a second walk of forty million samples.
 *
 * It exists because the drawing and the detection want different resolutions
 * out of one pass. The lanes zoom, so they are scanned fine enough to hold up
 * magnified; onsets are rises in energy between columns, and at that resolution
 * every hi-hat is a rise. `state.ts` scans once for the first and folds down to
 * the second.
 */
export function coarser(peaks: readonly Peak[], by: number): Peak[] {
  if (by <= 1) return [...peaks];
  const out: Peak[] = [];
  for (let i = 0; i < peaks.length; i += by) {
    let low = 0;
    let high = 0;
    for (let p = i; p < Math.min(i + by, peaks.length); p++) {
      if (peaks[p].min < low) low = peaks[p].min;
      if (peaks[p].max > high) high = peaks[p].max;
    }
    out.push({ min: low, max: high });
  }
  return out;
}

/** A moment the audio got suddenly louder, which is what a grid is fitted to. */
export interface Onset {
  /** Where it is, in seconds. */
  at: number;
  /** 0 to 1, against the strongest rise in the track. */
  strength: number;
}

/**
 * How loud the track is per column, off the drums where there are drums and off
 * everything where there are not.
 *
 * A separated mix makes this easier than it is on a mixdown, which is most of
 * the argument for detecting tempo *after* separating rather than before: the
 * thing a grid wants to line up with is the percussion, and here it arrives on
 * its own track with the pads and the vocal already taken off it.
 *
 * One function rather than the same three lines in two places, because *which
 * lane detection listens to* is one decision. The strip that draws the ticks
 * and the fit that places the bars have to be hearing the same thing, or the
 * lane stops being evidence about the grid drawn over it.
 */
export function energyOf(peaks: Record<string, readonly Peak[]>): Float32Array {
  const pick = peaks.drums ?? peaks.bass;
  const from = pick ? [pick] : Object.values(peaks);
  if (from.length === 0 || from[0].length === 0) return new Float32Array(0);

  const columns = from[0].length;
  const energy = new Float32Array(columns);
  for (const lane of from) {
    for (let i = 0; i < columns && i < lane.length; i++) {
      energy[i] += Math.max(lane[i].max, -lane[i].min);
    }
  }
  return energy;
}

/**
 * The moments that energy rose.
 *
 * Rectified energy per short window, differentiated, and the rises kept. Not a
 * tempo — a tempo is what `warp.ts` fits to these.
 */
export function onsetsOf(peaks: Record<string, readonly Peak[]>, seconds: number): Onset[] {
  const energy = energyOf(peaks);
  const columns = energy.length;
  if (columns === 0) return [];

  const out: Onset[] = [];
  let loudest = 0;
  for (let i = 1; i < columns; i++) {
    const rise = energy[i] - energy[i - 1];
    if (rise <= 0.01) continue;
    loudest = Math.max(loudest, rise);
    out.push({ at: (i / columns) * seconds, strength: rise });
  }
  return out.map((o) => ({ ...o, strength: Math.min(1, o.strength / (loudest || 1)) }));
}
