import { LIVE_PALETTE } from '../../core/src/livePalette.ts';
import type { Chart, ChartSection, ChartSong } from '../protocol.ts';
import type { SetState } from './bridge.ts';

/**
 * A running Live set into the thing a band reads off a phone.
 *
 * Pure, which is what makes it the only file here with tests. Everything it
 * needs arrives as a `SetState`; nothing in it can reach a socket, a clock or
 * the bridge.
 *
 * **It never parses a scene name.** The role and the key of a scene come off
 * `SetModel.factsByScene`, read out of the names once by the bridge, and the
 * song's facts come off `SetModel.songs` already rendered. A regex here would
 * be a fourth reading of the naming convention, free to drift the moment that
 * convention changed — and a chart that disagreed with the grid about what a
 * scene is called would be worse than no chart, because the band would believe
 * it. The `factsByScene` half of the model exists for this.
 */

/**
 * The scene the set is on, and the scene it is heading for.
 *
 * The **dominant** playing index rather than any one track's: a scene launch
 * moves every track at once, so what most of the set is playing is the scene,
 * and a track somebody reached past the grid to fire on its own does not get to
 * rename the section for everyone.
 *
 * `fired` is Live's own encoding and **-2 means the track's stop button is
 * fired**, not a scene — so only indexes at or above zero are counted. Folding
 * the two together would have a stopping set report that it was queueing scene
 * -2 and draw whatever that indexed to.
 */
function readFocus(set: SetState): { playing: number; queued: number } {
  const playing = new Map<number, number>();
  const fired = new Map<number, number>();
  for (const track of set.tracks) {
    const play = set.play[track.i];
    if (!play) continue;
    if (play.playing >= 0) playing.set(play.playing, (playing.get(play.playing) ?? 0) + 1);
    if (play.fired >= 0) fired.set(play.fired, (fired.get(play.fired) ?? 0) + 1);
  }
  return { playing: dominant(playing), queued: dominant(fired) };
}

/** The most-voted-for index, or -1 when nothing voted. */
function dominant(counts: Map<number, number>): number {
  let at = -1;
  let most = 0;
  for (const [index, count] of counts) {
    if (count > most) {
      most = count;
      at = index;
    }
  }
  return at;
}

/**
 * What a section says beyond its role, and **only where nothing above it says
 * the same thing**.
 *
 * A song whose scenes agree renders each fact once in the heading, so repeating
 * `Bm` down every row would be noise hiding the one row worth seeing. A song
 * that *modulates* cannot render one — `SongEntry.key` comes back as the
 * collection `Bm / D`, because a fact two scenes disagree about is a range
 * rather than a value — so the heading drops it and every row states its own.
 *
 * The rejected alternative was marking the odd scene out by comparing it
 * against the song's fact. It cannot work: by the time any scene differs, the
 * value it would be compared against is already `Bm / D`, so every row differs
 * from it and the signal inverts exactly when it is needed.
 */
interface Stated {
  key: boolean;
  bpm: boolean;
}

/** Live renders no colour for a scene that has none, and neither do we. */
function colorOf(scene: OpenFlow.Scene | undefined): number | null {
  if (!scene || scene.colorIndex < 0) return null;
  return scene.color;
}

function sectionOf(
  set: SetState,
  s: number,
  playing: number,
  queued: number,
  states: Stated,
): ChartSection {
  const scene = set.scenes[s];
  const facts = set.model?.factsByScene[String(s)];
  const role = facts?.role?.toUpperCase() ?? null;
  return {
    s,
    role,
    // A scene with no role falls back to the song it names, and to its position
    // when the set never named it at all. An empty row is the one thing this
    // must not draw: a section you cannot name is still one you are about to
    // play.
    label: role ?? songNameAt(set, s) ?? `Scene ${s + 1}`,
    key: states.key ? (facts?.key ?? null) : null,
    bpm: states.bpm ? (facts?.bpm ?? null) : null,
    color: colorOf(scene),
    playing: s === playing,
    queued: s === queued,
  };
}

/** The song this scene carries, in the spelling the set uses. */
function songNameAt(set: SetState, s: number): string | null {
  const key = set.model?.songByScene[String(s)];
  if (!key) return null;
  return set.model?.songs.find((song) => song.songKey === key)?.name ?? null;
}

export function buildChart(set: SetState): Chart {
  const { playing, queued } = readFocus(set);

  // What is queued counts as the focus when nothing is playing, so firing the
  // first scene of a song puts that song on the phone before it starts rather
  // than a beat after everyone has heard it.
  const focus = playing >= 0 ? playing : queued;

  const songKey = focus >= 0 ? (set.model?.songByScene[String(focus)] ?? null) : null;
  const entry = songKey ? (set.model?.songs.find((s) => s.songKey === songKey) ?? null) : null;

  // A scene outside every song has no heading above it, so it states its own.
  const states: Stated = entry
    ? { key: entry.keyClash, bpm: entry.bpmClash }
    : { key: true, bpm: true };

  const at = (s: number): ChartSection | null =>
    s >= 0 && s < set.scenes.length ? sectionOf(set, s, playing, queued, states) : null;

  const song: ChartSong | null = entry
    ? {
        name: entry.name,
        // A clash renders as `Bm / D`, which is a collection rather than a key.
        // The sections carry it in that case; see `sectionOf`.
        key: entry.keyClash ? '' : entry.key,
        bpm: entry.bpmClash ? '' : entry.bpm,
        artist: entry.artist,
        tag: entry.tag,
        // -1 covers both "no colour" and "its scenes disagree", and neither is
        // a colour to paint with.
        color: entry.colorIndex >= 0 ? (LIVE_PALETTE[entry.colorIndex] ?? null) : null,
        sections: entry.scenes.map((s) => sectionOf(set, s, playing, queued, states)),
      }
    : null;

  return {
    connected: set.connected,
    ready: set.lomReady && set.rev >= 0,
    rolling: set.rolling,
    tempo: set.tempo,
    song,
    // Repeated from `sections` on purpose. The phone draws the heading from
    // these two and never searches the list for the lit row, which is what
    // keeps it able to say something useful about a scene belonging to no song
    // at all — the case a song-shaped payload alone cannot express.
    now: at(playing),
    next: at(queued),
  };
}
