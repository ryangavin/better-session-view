import { isPercussion, readProgression, spellsFlat, type ChordNote } from '../../core/src/chords.ts';
import type { ChartProgression, ProgressionCell } from '../protocol.ts';
import type { SetState } from './bridge.ts';

/**
 * The chord progression of what is playing, read out of the MIDI.
 *
 * The set states its songs, keys and roles in scene names, and states its
 * progressions **nowhere at all** — so unlike everything else the chart shows,
 * this one is inferred rather than read. `core/src/chords.ts` does the
 * inference and owns the musical decisions; this file decides only *what to
 * feed it*, which turns out to be most of the difficulty.
 */

/** Beats to the bar, from a clip's own signature. Live counts in quarter notes. */
function beatsPerBar(clip: BSV.PlayingClip): number {
  const { signatureNumerator: num, signatureDenominator: den } = clip;
  if (!(num > 0) || !(den > 0)) return 4;
  return (num * 4) / den;
}

/**
 * Which playing clips carry harmony.
 *
 * Every playing MIDI clip **except percussion**, merged. Merging is what makes
 * the answer good: a bass line alone spells nothing, an arpeggio alone is one
 * note at a time, and put together they are a chord with a root under it. It is
 * also what makes excluding drums necessary rather than fastidious — a kick and
 * snare at C1 and D1 turn `Am | F | C | G` into `Am6 | F6 | C | Gmaj7`.
 *
 * An audio clip contributes nothing and cannot: Live has no notes to give for
 * one. A song whose harmony is only audio therefore has no chart, which is
 * honest — the alternative is guessing from the bass line.
 */
function harmonyOf(set: SetState): { clips: BSV.PlayingClip[]; notes: ChordNote[] } {
  const clips: BSV.PlayingClip[] = [];
  const notes: ChordNote[] = [];

  for (const playing of set.status) {
    // `PlayingClip` says where the playhead is but not which slot it is in —
    // that is `TrackPlayState`, which is the frame that knows about slots.
    const slot = set.play[playing.t]?.playing ?? -1;
    if (slot < 0) continue;
    const read = set.notes.get(`${playing.t}:${slot}`);
    if (!read || read.notes.length === 0) continue;
    if (isPercussion(read.instrument)) continue;
    clips.push(playing);
    for (const note of read.notes) notes.push(note);
  }
  return { clips, notes };
}

/**
 * The progression, or null when there is nothing to read one from.
 *
 * The timeline is the **longest** harmony loop, because that is the one whose
 * period the progression actually has: a two-bar bass figure under an eight-bar
 * chord cycle would otherwise report the cycle four times over, each time
 * cutting it off a quarter of the way through. `t` names the clip that timeline
 * belongs to so the phone can light the right cell from the loop it is already
 * being told about.
 */
export function buildProgression(set: SetState): ChartProgression | null {
  const { clips, notes } = harmonyOf(set);
  if (clips.length === 0 || notes.length === 0) return null;

  let longest = clips[0]!;
  for (const clip of clips) {
    if (clip.loopEnd - clip.loopStart > longest.loopEnd - longest.loopStart) longest = clip;
  }
  // Unwarped audio measures its loop in seconds, so it has no bars and cannot
  // be a timeline for a chart written in them.
  if (longest.inSeconds) return null;

  const from = longest.loopStart;
  const to = longest.loopEnd;
  if (!(to > from)) return null;

  const song = songOf(set);
  const flats = spellsFlat(song);
  const perBarBeats = beatsPerBar(longest);
  const segments = readProgression(notes, {
    from,
    to,
    beatsPerBar: perBarBeats,
    perBar: 2,
    // Spelled to match the key the set already states, so the chart reads Bb
    // where the scene names say Bb.
    flats,
  });

  // Every window blank means the notes spelled nothing anywhere — a melody with
  // no harmony under it, most likely. Saying so with an empty chart is worse
  // than saying nothing, because an empty chart looks like a bug.
  if (!segments.some((segment) => segment.symbol !== null)) return null;

  const cells: ProgressionCell[] = segments.map((segment) => ({
    from: segment.from,
    to: segment.to,
    symbol: segment.symbol,
    root: segment.rootClass,
    tones: segment.tones,
  }));
  return { t: longest.t, from, to, beatsPerBar: perBarBeats, flats, cells };
}

/** The key the set states for what is playing, for spelling only. */
function songOf(set: SetState): string {
  const model = set.model;
  if (!model) return '';
  let scene = -1;
  const counts = new Map<number, number>();
  for (const play of set.play) {
    if (play && play.playing >= 0) counts.set(play.playing, (counts.get(play.playing) ?? 0) + 1);
  }
  let most = 0;
  for (const [at, count] of counts) {
    if (count > most) {
      most = count;
      scene = at;
    }
  }
  if (scene < 0) return '';
  const facts = model.factsByScene[String(scene)];
  if (facts?.key) return facts.key;
  const key = model.songByScene[String(scene)];
  return model.songs.find((song) => song.songKey === key)?.key ?? '';
}

/**
 * The clips playing right now, as an ask for their notes.
 *
 * Every playing clip, including percussion: what a track's instrument *is*
 * arrives with the answer, so the ask cannot filter on it. Reading a drum
 * clip's notes and throwing them away is one clip's worth of waste; the
 * alternative is a second round trip to find out what to ask for.
 */
export function playingClips(set: SetState): Array<{ t: number; s: number }> {
  const clips: Array<{ t: number; s: number }> = [];
  for (const track of set.tracks) {
    if (track.isGroup) continue;
    const slot = set.play[track.i]?.playing ?? -1;
    if (slot >= 0) clips.push({ t: track.i, s: slot });
  }
  return clips;
}

/** What would make a phone redraw the chart, ignoring where the playhead is. */
export function progressionShape(progression: ChartProgression | null): string {
  if (!progression) return '';
  return `${progression.t}|${progression.from}|${progression.to}|${progression.cells
    .map((cell) => `${cell.from}:${cell.symbol ?? ''}`)
    .join(',')}`;
}
