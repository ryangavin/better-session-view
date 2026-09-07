/** Blend across a loop seam without shortening its sample period or moving its markers. */
export function loopBuffer(context: BaseAudioContext, source: AudioBuffer, from: number, to: number): AudioBuffer {
  const rate = source.sampleRate;
  const start = Math.max(0, Math.min(source.length - 1, Math.round(from * rate)));
  const end = Math.max(start + 1, Math.min(source.length, Math.round(to * rate)));
  const length = Math.max(1, end - start);
  const result = context.createBuffer(source.numberOfChannels, length, rate);
  const fade = Math.min(Math.round(rate * .004), Math.floor(length / 2));
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel), output = result.getChannelData(channel);
    const sample = (i: number) => input[Math.max(0, Math.min(input.length - 1, i))];
    output.set(input.subarray(start, end));
    for (let t = -fade; t < fade; t++) {
      const x = (t + fade) / (2 * fade), weight = x * x * (3 - 2 * x);
      output[t < 0 ? length + t : t] = sample(end + t) * (1 - weight) + sample(start + t) * weight;
    }
  }
  return result;
}
