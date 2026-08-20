import type { ChartLoops, LoopTrack } from '../protocol.ts';
import type { SetState } from './bridge.ts';

/**
 * Every track with something playing in it, as one frame to watch go round.
 *
 * Pure, like `chart.ts`, and separate from it for the reason the two SSE events
 * are separate: a chart changes when somebody fires something, and this changes
 * twenty times a second. Building them together would mean building the song
 * list every time a playhead moved.
 *
 * **Group tracks are left out.** A group carries no clips of its own — Live
 * reports it as playing whatever its members are — so drawing one would be a
 * second wheel turning in lockstep with the wheels beneath it, for a row that
 * is not an instrument anybody is listening to.
 */
export function buildLoops(set: SetState): ChartLoops {
  const byIndex = new Map(set.tracks.map((track) => [track.i, track]));
  const tracks: LoopTrack[] = [];

  for (const clip of set.status) {
    const track = byIndex.get(clip.t);
    if (!track || track.isGroup) continue;
    tracks.push({
      t: clip.t,
      name: track.name,
      color: track.color,
      position: clip.position,
      loopStart: clip.loopStart,
      loopEnd: clip.loopEnd,
      looping: clip.looping,
      recording: clip.recording,
      inSeconds: clip.inSeconds,
      signatureNumerator: clip.signatureNumerator,
      signatureDenominator: clip.signatureDenominator,
    });
  }

  // Track order, not loop length. The longest loop is the structural one and
  // the temptation is to float it to the top — but these rows are read at a
  // glance against a stage where the tracks are in Live's order, and a list
  // that reorders itself whenever a clip changes is one nobody can find
  // anything in twice. Which loop is the long one is legible from its bar
  // count.
  tracks.sort((a, b) => a.t - b.t);

  return { tempo: set.tempo, rolling: set.rolling, tracks };
}

/**
 * What would make a phone redraw differently, ignoring how far along anything
 * is.
 *
 * The positions move constantly and are *meant* to — the phone advances them
 * itself. Everything else here changes only when somebody fires a clip, renames
 * a track or moves the tempo, and that is what has to reach a phone promptly
 * rather than on the next heartbeat.
 */
export function loopShape(loops: ChartLoops): string {
  const rows = loops.tracks.map(
    (track) =>
      `${track.t}:${track.name}:${track.color}:${track.loopStart}:${track.loopEnd}:` +
      `${track.looping ? 1 : 0}${track.recording ? 1 : 0}${track.inSeconds ? 1 : 0}:` +
      `${track.signatureNumerator}/${track.signatureDenominator}`,
  );
  return `${loops.tempo}|${loops.rolling ? 1 : 0}|${rows.join('|')}`;
}
