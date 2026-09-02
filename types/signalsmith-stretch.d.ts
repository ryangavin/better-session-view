// The Web Audio release of Signalsmith Stretch ships no declarations. This is
// the surface mix[flow] uses, read off the shipped module: every method is a
// message to the worklet and so answers with a Promise, and `addBuffers` copies
// its arrays unless handed a transfer list as a trailing argument.

declare module 'signalsmith-stretch' {
  export interface StretchChange {
    /** Audio-context time the change takes effect. */
    output?: number;
    /**
     * The time the change is *filed* at: every change already scheduled at or
     * after it is dropped. Defaults to the worklet's own clock, which drops
     * everything in the future; set to `output` to queue behind what is there.
     */
    outputTime?: number;
    active?: boolean;
    /** Seconds into the loaded buffers to read from. */
    input?: number;
    /** Buffer seconds per output second. */
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  }

  export interface StretchConfig {
    blockMs?: number | null;
    intervalMs?: number;
    splitComputation?: boolean;
    preset?: 'default' | 'cheaper';
  }

  export interface StretchNode extends AudioWorkletNode {
    /** Where in the buffers it is, as of the last update message. */
    inputTime: number;
    schedule(change: StretchChange, adjustPrevious?: boolean): Promise<StretchChange>;
    start(when?: number, offset?: number, duration?: number, rate?: number, semitones?: number): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    addBuffers(channels: readonly Float32Array[], transfer?: readonly ArrayBufferLike[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number } | undefined>;
    /** Input plus output latency, in seconds: how far ahead to schedule. */
    latency(): Promise<number>;
    configure(config: StretchConfig): Promise<unknown>;
    setUpdateInterval(seconds: number, callback?: (inputTime: number) => void): Promise<unknown>;
  }

  interface SignalsmithStretch {
    (context: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>;
    /** Where to load the worklet from instead of a Blob of its own source. */
    moduleUrl?: string;
  }

  const SignalsmithStretch: SignalsmithStretch;
  export default SignalsmithStretch;
}
