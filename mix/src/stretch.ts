import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch';

/**
 * The stretcher: Signalsmith Stretch, as one worklet node for every stem.
 *
 * One node rather than one per stem, and that is the whole reason the stems
 * stay locked. A worklet node acts on the schedule it was sent, at the sample
 * — but six of them are six message streams and six latencies to keep the
 * same, and a mixer that could drift a millisecond between the kick and the
 * bass is a mixer you can hear. Twelve channels through one node is one time
 * map, one clock and one latency, and the stems come apart again in a
 * splitter on the way to their own gains.
 *
 * The samples go over as copies. A stem's `AudioBuffer` stays in the graph —
 * the lanes draw from it and the plain sources play it — and its memory
 * cannot be lent to a worklet, so the stretcher holds its own. Made only when
 * warp is first switched on, and handed over rather than cloned, which is the
 * difference between a second copy and a third.
 */

export interface Stretch {
  node: StretchNode;
  /** Input plus output latency, in seconds, read once: how far ahead a change has to be scheduled. */
  latency: number;
}

/** How long the worklet may take to answer before it is taken not to exist. */
const PATIENCE = 10000;

/**
 * A node with this many output channels, or null where there is no worklet
 * to be had — a page without WebAssembly, a scheme that refuses a Blob, a
 * build that broke the processor's source. Null rather than a throw because
 * every one of those means the same thing to the window: play it straight.
 */
export async function stretchOf(ctx: BaseAudioContext, channels: number): Promise<Stretch | null> {
  try {
    const made = SignalsmithStretch(ctx, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [channels],
    });
    const node = await Promise.race([
      made,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PATIENCE)),
    ]);
    if (!node) return null;
    const latency = await node.latency();
    return { node, latency };
  } catch {
    return null;
  }
}

/** A buffer at another rate, rendered through an offline graph at this one. */
async function resampled(buffer: AudioBuffer, rate: number): Promise<AudioBuffer> {
  const length = Math.ceil(buffer.duration * rate);
  const offline = new OfflineAudioContext(buffer.numberOfChannels, length, rate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

/**
 * The stems' samples as the flat channel list the node wants: two per stem,
 * at the graph's rate, every one the length of the longest.
 *
 * At the graph's rate because the worklet does not resample — a 44.1 kHz stem
 * in a 48 kHz graph would play a semitone and a half sharp — and the fallback
 * decoder keeps a float WAV at the rate it was written. A mono stem is sent
 * twice, so every stem is two channels and the splitter's arithmetic holds.
 */
export async function channelsOf(
  ctx: BaseAudioContext,
  buffers: readonly AudioBuffer[],
): Promise<Float32Array[]> {
  let length = 0;
  for (const buffer of buffers) length = Math.max(length, Math.ceil(buffer.duration * ctx.sampleRate));
  const out: Float32Array[] = [];
  for (const buffer of buffers) {
    const fitted = buffer.sampleRate === ctx.sampleRate ? buffer : await resampled(buffer, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const channel = new Float32Array(length);
      fitted.copyFromChannel(channel, Math.min(c, fitted.numberOfChannels - 1));
      out.push(channel);
    }
  }
  return out;
}
