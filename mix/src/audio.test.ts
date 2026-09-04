import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { coarser, LIBRARY, onsetsOf, peaksOf, readWav, stemUrl, wavOf, type Peak } from './audio.ts';

/**
 * The format contract, from the other end.
 *
 * `mix/python/separate.py` writes float32 WAV because independently rescaled
 * stems do not sum — `demucs/README.md` measured it. This is the reader that
 * has to hold that up: a build that could not read back what it writes would
 * lose the only format this app produces, and it would lose it silently,
 * because a decoder that fails returns an empty lane rather than an error.
 */

/** A WAV, written the way the worker writes one. */
function wav(
  samples: number[][],
  { rate = 44100, float = true, pad = false } = {},
): ArrayBuffer {
  const channels = samples.length;
  const frames = samples[0].length;
  const width = float ? 4 : 2;
  // An optional odd-sized chunk between `fmt ` and `data`, which real writers
  // emit and which a fixed-offset reader walks straight past.
  const extra = pad ? 8 + 3 + 1 : 0;
  const bytes = new ArrayBuffer(44 + extra + frames * channels * width);
  const view = new DataView(bytes);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < 4; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, float ? 3 : 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * width, true);
  view.setUint16(32, channels * width, true);
  view.setUint16(34, width * 8, true);
  let at = 36;
  if (pad) {
    tag(at, 'LIST');
    view.setUint32(at + 4, 3, true);
    at += 8 + 3 + 1;
  }
  tag(at, 'data');
  view.setUint32(at + 4, frames * channels * width, true);
  at += 8;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const value = samples[c][f];
      if (float) view.setFloat32(at, value, true);
      else view.setInt16(at, Math.round(value * 32768), true);
      at += width;
    }
  }
  return bytes;
}

/**
 * A WAV in a format nothing here writes — which is most of the WAVs there are.
 *
 * `wav` above writes what the worker writes. This writes what a file arrives
 * as: a container width other than the two we produce, and optionally wrapped
 * in WAVE_FORMAT_EXTENSIBLE, where the tag is 0xFFFE and the real format is the
 * head of a SubFormat GUID out in the extension.
 */
function foreign(
  samples: number[][],
  { bits, format, extensible = false, rate = 44100 }:
    { bits: number; format: number; extensible?: boolean; rate?: number },
): ArrayBuffer {
  const channels = samples.length;
  const frames = samples[0].length;
  // Ceiled, because a compressed format declares a sub-byte width and this
  // still has to lay some bytes down for the reader to refuse.
  const width = Math.max(1, Math.ceil(bits / 8));
  const fmtSize = extensible ? 40 : 16;
  const bytes = new ArrayBuffer(20 + fmtSize + 8 + frames * channels * width);
  const view = new DataView(bytes);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < 4; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, fmtSize, true);
  view.setUint16(20, extensible ? 0xfffe : format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * width, true);
  view.setUint16(32, channels * width, true);
  view.setUint16(34, bits, true);
  if (extensible) {
    view.setUint16(36, 22, true); // cbSize
    view.setUint16(38, bits, true); // valid bits, all of the container
    view.setUint32(40, 0, true); // channel mask, unspecified
    view.setUint16(44, format, true); // the SubFormat GUID's first two bytes
  }
  let at = 20 + fmtSize;
  tag(at, 'data');
  view.setUint32(at + 4, frames * channels * width, true);
  at += 8;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const value = samples[c][f];
      // Integer full scale is one code short on the positive side, which is
      // why nothing here writes a bare 1.0 and expects it back.
      const whole = (scale: number) => Math.max(-scale, Math.min(scale - 1, Math.round(value * scale)));
      if (format === 3) view.setFloat32(at, value, true);
      else if (bits === 16) view.setInt16(at, whole(32768), true);
      else if (bits === 24) {
        const three = whole(8388608);
        view.setUint8(at, three & 0xff);
        view.setUint8(at + 1, (three >> 8) & 0xff);
        view.setUint8(at + 2, (three >> 16) & 0xff);
      } else if (bits === 32) view.setInt32(at, whole(2147483648), true);
      // A narrower or compressed width is only ever written here to be
      // declined, so the bytes under it do not have to mean anything.
      else for (let b = 0; b < width; b++) view.setUint8(at + b, 0);
      at += width;
    }
  }
  return bytes;
}

/** Enough of an `AudioBuffer` for the two functions that read one. */
const buffer = (channels: number[][], rate = 44100): AudioBuffer =>
  ({
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate: rate,
    duration: channels[0].length / rate,
    getChannelData: (c: number) => Float32Array.from(channels[c]),
  }) as unknown as AudioBuffer;

describe('reading a WAV this app wrote', () => {
  it('reads back float32 exactly, which is the whole point of writing it', () => {
    const read = readWav(wav([[0.5, -0.25, 0.125]]));
    expect(read?.rate).toBe(44100);
    expect([...read!.channels[0]]).toEqual([0.5, -0.25, 0.125]);
  });

  it('keeps a value above full scale rather than clamping it', () => {
    // Float is what carries a stem that sums past 1.0. Clamping here would
    // reintroduce exactly the rescaling the output contract exists to avoid.
    const read = readWav(wav([[1.8, -1.4]]));
    expect(read!.channels[0][0]).toBeCloseTo(1.8, 5);
    expect(read!.channels[0][1]).toBeCloseTo(-1.4, 5);
  });

  it('keeps the channels apart', () => {
    const read = readWav(wav([[1, 1], [-1, -1]]));
    expect([...read!.channels[0]]).toEqual([1, 1]);
    expect([...read!.channels[1]]).toEqual([-1, -1]);
  });

  it('reads 16-bit too, for a file that came from somewhere else', () => {
    const read = readWav(wav([[0.5, -0.5]], { float: false }));
    expect(read!.channels[0][0]).toBeCloseTo(0.5, 3);
  });

  it('walks the chunks rather than trusting the offsets', () => {
    // A writer may put anything between `fmt ` and `data`, including a chunk
    // with an odd size and the pad byte its size does not mention.
    const read = readWav(wav([[0.25, 0.75]], { pad: true }));
    expect([...read!.channels[0]]).toEqual([0.25, 0.75]);
  });

  it('keeps the sample rate it was written at', () => {
    expect(readWav(wav([[0]], { rate: 48000 }))?.rate).toBe(48000);
  });

  it('declines anything that is not a WAV, so the browser gets a turn', () => {
    expect(readWav(new ArrayBuffer(8))).toBeNull();
    expect(readWav(new TextEncoder().encode('not audio at all, really').buffer)).toBeNull();
  });

  it('declines a compression it does not know rather than reading noise', () => {
    const bytes = wav([[0.5]]);
    new DataView(bytes).setUint16(20, 85, true);
    expect(readWav(bytes)).toBeNull();
  });

  it('reads a real stem the separator wrote', () => {
    // The one contract between `python/separate.py` and `electron/export.ts`,
    // and until this fixture landed nothing held either end of it. A slice of
    // an actual htdemucs_ft drums stem out of the library: float32, stereo,
    // and with the `fact` chunk torchaudio puts between `fmt ` and `data`,
    // which is exactly the thing a fixed-offset reader walks into.
    const bytes = fs.readFileSync(fileURLToPath(new URL('./fixtures/drums-slice.wav', import.meta.url)));
    const read = readWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(read?.rate).toBe(44100);
    expect(read?.channels).toHaveLength(2);
    expect(read?.channels[0]).toHaveLength(4000);
    // Audio rather than silence or noise: it reaches somewhere near full scale
    // and stays inside it, which reading the bytes as the wrong width does not.
    const loudest = Math.max(...read!.channels[0].map(Math.abs));
    expect(loudest).toBeGreaterThan(0.1);
    expect(loudest).toBeLessThan(1);
  });

  it('reads float32 wrapped in WAVE_FORMAT_EXTENSIBLE', () => {
    // libsndfile writes the envelope routinely, and the main process has no
    // browser behind it — declining this is a failed export of a valid file.
    const read = readWav(foreign([[0.5, -0.25]], { bits: 32, format: 3, extensible: true }));
    expect([...read!.channels[0]]).toEqual([0.5, -0.25]);
  });

  it('reads 24-bit PCM, which is what a studio WAV usually is', () => {
    const read = readWav(foreign([[0.5, -0.5, 0.001]], { bits: 24, format: 1 }));
    expect(read!.channels[0][0]).toBeCloseTo(0.5, 6);
    expect(read!.channels[0][1]).toBeCloseTo(-0.5, 6);
    // The bottom of the range is the whole reason for the extra byte: this
    // value is below a 16-bit file's resolution and has to survive.
    expect(read!.channels[0][2]).toBeCloseTo(0.001, 6);
  });

  it('reads 24-bit in the extensible envelope too, which is where it usually arrives', () => {
    const read = readWav(foreign([[0.25], [-0.75]], { bits: 24, format: 1, extensible: true }));
    expect(read!.channels[0][0]).toBeCloseTo(0.25, 6);
    expect(read!.channels[1][0]).toBeCloseTo(-0.75, 6);
  });

  it('reads 32-bit int without reading it as float', () => {
    // The two formats share a width, so getting this wrong is not an error —
    // it is a stem full of denormals that draws as a flat line.
    const read = readWav(foreign([[0.5, -0.5]], { bits: 32, format: 1 }));
    expect(read!.channels[0][0]).toBeCloseTo(0.5, 6);
    expect(read!.channels[0][1]).toBeCloseTo(-0.5, 6);
  });

  it('still declines a format it cannot read, envelope or not', () => {
    // Widening the reader must not turn into reading anything at all: mu-law
    // and ADPCM are bytes that decode to samples, not samples.
    expect(readWav(foreign([[0.5]], { bits: 8, format: 7 }))).toBeNull();
    expect(readWav(foreign([[0.5]], { bits: 4, format: 0x11 }))).toBeNull();
    expect(readWav(foreign([[0.5]], { bits: 16, format: 7, extensible: true }))).toBeNull();
  });

  it('survives a data chunk claiming more than the file holds', () => {
    // A truncated download, or a writer that never went back to fix the size.
    // Trusting the number reads off the end of the buffer; the frames that are
    // actually there are worth more than the failure.
    const bytes = wav([[0.5, -0.5]]);
    new DataView(bytes).setUint32(40, 0xffff, true);
    const read = readWav(bytes);
    expect([...read!.channels[0]]).toEqual([0.5, -0.5]);
  });
});

describe('peaks', () => {
  it('draws a column per column asked for, whatever the length', () => {
    expect(peaksOf(buffer([new Array(1000).fill(0)]), 40)).toHaveLength(40);
    expect(peaksOf(buffer([new Array(7).fill(0)]), 40)).toHaveLength(40);
  });

  it('takes the loudest point in a span, not a point in it', () => {
    // A transient that decays inside one column has to survive into the
    // drawing; point-sampling is what turns a drum lane into a ruled line.
    const samples = new Array(100).fill(0);
    samples[37] = 0.9;
    const [peak] = peaksOf(buffer([samples]), 4).slice(1, 2);
    expect(peak.max).toBeCloseTo(0.9, 5);
  });

  it('keeps the two sides apart, because real audio is not symmetric', () => {
    const peaks = peaksOf(buffer([[0.8, 0.8, -0.2, -0.2]]), 2);
    expect(peaks[0].max).toBeCloseTo(0.8, 5);
    expect(peaks[0].min).toBe(0);
    expect(peaks[1].min).toBeCloseTo(-0.2, 5);
  });

  it('draws a hard-panned hit at its real height, not half of it', () => {
    // Averaging the channels would put a hat that is only in one of them at
    // half the height it actually reaches.
    const peaks = peaksOf(buffer([[0.9, 0.9], [0, 0]]), 1);
    expect(peaks[0].max).toBeCloseTo(0.9, 5);
  });

  it('draws silence as silence', () => {
    const peaks = peaksOf(buffer([new Array(64).fill(0)]), 8);
    expect(peaks.every((p) => p.min === 0 && p.max === 0)).toBe(true);
  });
});

describe('folding peaks down', () => {
  /**
   * The claim this rests on: scanning finely and folding is the same drawing
   * as scanning coarsely. If it were not, the lanes and the onsets would be
   * reading two different pictures of the same stem — and the warp lane's
   * whole argument is that a tick always lines up with the transient below it.
   */
  it('is the same as having scanned at the coarser count', () => {
    const samples = Array.from({ length: 3600 }, (_, i) => Math.sin(i / 3) * (i % 97 === 0 ? 1 : 0.2));
    const fine = peaksOf(buffer([samples]), 900);
    expect(coarser(fine, 5)).toEqual(peaksOf(buffer([samples]), 180));
  });

  it('keeps the loudest point of the group, which is the point of folding', () => {
    const folded = coarser([
      { min: 0, max: 0.2 },
      { min: -0.7, max: 0.4 },
      { min: -0.1, max: 0.1 },
    ], 3);
    expect(folded).toEqual([{ min: -0.7, max: 0.4 }]);
  });

  it('keeps a short last group rather than dropping it', () => {
    // A track is not a multiple of anything, and losing the tail would lose
    // the end of the song from the drawing that finds its downbeats.
    expect(coarser([{ min: 0, max: 1 }, { min: 0, max: 1 }, { min: -1, max: 0 }], 2)).toHaveLength(2);
  });

  it('hands back the same peaks when there is nothing to fold', () => {
    const lane = [{ min: -0.5, max: 0.5 }];
    expect(coarser(lane, 1)).toEqual(lane);
  });
});

describe('onsets', () => {
  /** A lane that jumps at four places and is quiet between them. */
  const hits = (at: number[], columns = 64): Peak[] =>
    Array.from({ length: columns }, (_, i) =>
      at.includes(i) ? { min: -0.8, max: 0.8 } : { min: 0, max: 0 },
    );

  it('finds a rise where there is one, in seconds', () => {
    const found = onsetsOf({ drums: hits([16, 32, 48]) }, 64);
    expect(found.map((o) => Math.round(o.at))).toEqual([16, 32, 48]);
  });

  it('finds nothing in silence', () => {
    expect(onsetsOf({ drums: hits([]) }, 64)).toEqual([]);
  });

  it('prefers the drums, because that is what a grid lines up with', () => {
    // The vocal's rises are not the beat, and on a separated mix there is no
    // reason to be guessing from a sum when the percussion is on its own lane.
    const found = onsetsOf({ drums: hits([10]), vocals: hits([3, 5, 7, 9]) }, 64);
    expect(found).toHaveLength(1);
  });

  it('falls back to whatever there is when there are no drums', () => {
    expect(onsetsOf({ other: hits([20]) }, 64)).toHaveLength(1);
  });

  it('scales strength against the loudest rise rather than absolutely', () => {
    const found = onsetsOf({ drums: hits([8, 24]) }, 64);
    expect(Math.max(...found.map((o) => o.strength))).toBeCloseTo(1, 5);
  });

  it('answers nothing rather than throwing on a track with no peaks yet', () => {
    expect(onsetsOf({}, 0)).toEqual([]);
  });
});

describe('where a stem is served from', () => {
  it("is an absolute URL on the app's own scheme, not a root-relative path", () => {
    // Root-relative would ask vite for the file during a dev session, where the
    // page is on localhost and this handler is not.
    expect(stemUrl(LIBRARY, 'stems/abc/htdemucs_ft', 'vocals')).toBe(
      'mix://app/library/stems/abc/htdemucs_ft/vocals.wav',
    );
  });

  it('does not double a separator when the manifest has a trailing one', () => {
    expect(stemUrl(LIBRARY, 'stems/abc/htdemucs/', 'bass')).toBe(
      'mix://app/library/stems/abc/htdemucs/bass.wav',
    );
  });

  it("leaves the scheme's own double slash alone", () => {
    expect(stemUrl(LIBRARY, 's', 'v')).toBe('mix://app/library/s/v.wav');
  });

  it('serves from a plain path when the library is mounted on one', () => {
    // Which is how the same page gets looked at over HTTP, on a device that
    // cannot run Electron.
    expect(stemUrl('/library', 'stems/a/htdemucs', 'drums')).toBe(
      '/library/stems/a/htdemucs/drums.wav',
    );
  });
});

describe('wavOf', () => {
  it('writes what readWav reads back, to the float', () => {
    const left = Float32Array.from([0, 0.5, -0.25, 1, -1]);
    const right = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
    const read = readWav(wavOf([left, right], 48000));
    expect(read?.rate).toBe(48000);
    expect(read?.channels.length).toBe(2);
    expect(Array.from(read!.channels[0])).toEqual(Array.from(left));
    expect(Array.from(read!.channels[1])).toEqual(Array.from(right));
  });

  it('is empty but well-formed with no frames', () => {
    const read = readWav(wavOf([new Float32Array(0)], 44100));
    expect(read?.channels[0].length).toBe(0);
  });
});
