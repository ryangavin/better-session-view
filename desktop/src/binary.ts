/**
 * Typed arrays across a transport that only carries text.
 *
 * Electron's own channel takes a `Float32Array` and hands one back, because it
 * uses the structured clone algorithm. `reach.ts` carries the same calls as
 * JSON, which does not: `JSON.stringify` turns a `Float32Array` into an object
 * with a key per element, and `JSON.parse` gives back that object rather than
 * an array. Nothing throws. The call appears to work and the value is quietly
 * the wrong kind, which is the worst way for a difference between the window
 * and a tab to show up.
 *
 * It showed up as a track re-scanning forty million samples on every open in a
 * browser and never in the window: the peaks cache is a `Float32Array` each
 * way, so reading it returned something `unpacked` could not read and writing
 * it failed inside a `catch` that had nothing to say.
 *
 * So the two ends agree on a tag. Anything else — numbers, strings, plain
 * objects, arrays, null — is left exactly as it was, because it already
 * survives the trip and a codec that rewrites everything is a codec you have to
 * think about at every call site.
 */

/** What a typed array becomes on the wire, and nothing else does. */
interface Wired {
  '~bin': string;
  b64: string;
}

const KINDS = {
  Float32Array,
  Float64Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
} as const;

type Kind = keyof typeof KINDS;

const isWired = (value: unknown): value is Wired =>
  typeof value === 'object' && value !== null && typeof (value as Wired)['~bin'] === 'string';

/**
 * Base64 in whichever runtime this is.
 *
 * The main process has `Buffer` and a browser has `btoa`, and neither has the
 * other. Chunked on the way in because `String.fromCharCode` takes its bytes as
 * arguments, and a stem's worth of peaks is half a megabyte of them — enough to
 * overflow the stack in one call.
 */
const encode = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
};

const decode = (text: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Walk a value, tagging every typed array in it. Everything else is itself. */
export function toWire(value: unknown): unknown {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const view = value as Uint8Array;
    return {
      '~bin': view.constructor.name,
      b64: encode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)),
    } satisfies Wired;
  }
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, toWire(one)]));
  }
  return value;
}

/** The other half. An unknown tag is left alone rather than guessed at. */
export function fromWire(value: unknown): unknown {
  if (isWired(value)) {
    const kind = KINDS[value['~bin'] as Kind];
    if (!kind) return value;
    const bytes = decode(value.b64);
    return new kind(
      bytes.buffer as ArrayBuffer,
      bytes.byteOffset,
      bytes.byteLength / kind.BYTES_PER_ELEMENT,
    );
  }
  if (Array.isArray(value)) return value.map(fromWire);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, fromWire(one)]));
  }
  return value;
}
