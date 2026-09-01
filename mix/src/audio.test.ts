import { describe, expect, it } from 'vitest';
import { coarser, LIBRARY, onsetsOf, peaksOf, readWav, stemUrl, type Peak } from './audio.ts';

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
