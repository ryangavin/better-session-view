import { spellsFlat } from '../../core/src/chords.ts';
import type { BasslineNote, ChartBassline } from '../protocol.ts';
import type { SetState } from './bridge.ts';

/**
 * The bass part of what is playing, copied out of the clip.
 *
 * **This module infers nothing.** It finds one track, reads the notes Live
 * already holds for the clip in it, clips them to the loop and puts them on the
 * wire. Everything that used to happen here — merging every playing MIDI clip,
 * deciding which of them were drums, fitting chord templates to windows of
 * time — was inference on top of a part that was already written down, and each
 * layer of it was somewhere the answer could be wrong while nothing was broken.
 * A bass player reading off a phone wants the part, and the part is in the clip.
 */

/** Which track carries the bass. Named, because nothing else in a set says. */
const BASS = /bass/i;

/**
 * The bottom of the roll: the low B of a five-string, which Live calls B-1.
 *
 * A floor rather than a fit. Where the low note of a part *is* moves between
 * songs, and rows that move with it would make two songs with the same shape
 * look different — the point of a fixed keyboard is that a fifth is the same
 * distance up the screen every time.
 */
const FLOOR = 23;

/** How much of the keyboard the roll shows before it has to widen. */
const OCTAVES = 2;

/** Beats to the bar, from a clip's own signature. Live counts in quarter notes. */
function beatsPerBar(clip: BSV.PlayingClip): number {
  const { signatureNumerator: num, signatureDenominator: den } = clip;
  if (!(num > 0) || !(den > 0)) return 4;
  return (num * 4) / den;
}

/** One track, its playing clip and the notes read out of it. */
interface Part {
  track: BSV.Track;
  clip: BSV.PlayingClip;
  notes: readonly BSV.ClipNote[];
}

/**
 * The bass track's playing clip, or null when there isn't one.
 *
 * **By name, deliberately.** A set states its songs and keys in names already,
 * and this is the same convention applied to a track: the one with `bass` in it
 * is the bass. The alternative is guessing from the notes — lowest average
 * pitch, most sustained, fewest simultaneous — and every version of that guess
 * picks the wrong track on some song, silently, on stage. A name is a thing
 * somebody can go and fix in a second.
 *
 * The **first** matching track in Live's own order wins, so a set with `Bass`
 * and `Bass Sub` reads the one further left rather than whichever happened to
 * be scanned first.
 */
function bassPart(set: SetState): Part | null {
  for (const track of set.tracks) {
    if (track.isGroup || !track.isMidi) continue;
    if (!BASS.test(track.name)) continue;

    // `TrackPlayState` knows which slot; `PlayingClip` knows where the playhead
    // in it is. Both have to be there for this to be a part rather than a track
    // that merely exists.
    const slot = set.play[track.i]?.playing ?? -1;
    if (slot < 0) continue;
    const read = set.notes.get(`${track.i}:${slot}`);
    if (!read || read.notes.length === 0) continue;
    const clip = set.status.find((playing) => playing.t === track.i);
    if (!clip) continue;

    return { track, clip, notes: read.notes };
  }
  return null;
}

/**
 * The stretch of keyboard to draw, as a pair of MIDI notes, inclusive.
 *
 * Two octaves up from the low B, widened by whole octaves — never by a
 * semitone — until the part fits. Widening in octaves is what keeps the note
 * names in the gutter landing in the same places whatever is playing, and
 * widening at all is what stops a part that goes high being quietly cropped.
 */
function keyboard(notes: readonly BasslineNote[]): { low: number; high: number } {
  let low = FLOOR;
  let high = FLOOR + 12 * OCTAVES;
  for (const note of notes) {
    while (note.pitch < low) low -= 12;
    while (note.pitch > high) high += 12;
  }
  return { low, high };
}

/**
 * The bass part as the phone draws it, or null when there is none to draw.
 *
 * **The loop, not the clip.** Live plays a looping clip's loop bracket and
 * nothing else, so a note before `loopStart` or after `loopEnd` is one nobody
 * in the room will hear — drawing it would put material on the chart that never
 * sounds. A note that starts inside the loop and runs past its end is kept and
 * cut off there, which is what Live does to it.
 *
 * Times come out **relative to the loop's start**, because that is the number
 * the roll is drawn from and doing the subtraction once here beats doing it per
 * note on the oldest phone in the room.
 */
export function buildBassline(set: SetState): ChartBassline | null {
  const part = bassPart(set);
  if (!part) return null;

  const { track, clip } = part;
  // Unwarped audio measures its loop in seconds, so it has no bars — and it has
  // no notes either, so this is belt and braces rather than a real case.
  if (clip.inSeconds) return null;

  const from = clip.loopStart;
  const to = clip.loopEnd;
  if (!(to > from)) return null;

  const notes: BasslineNote[] = [];
  for (const note of part.notes) {
    if (note.start < from || note.start >= to) continue;
    const end = Math.min(to, note.start + note.duration);
    if (!(end > note.start)) continue;
    notes.push({ from: note.start - from, to: end - from, pitch: note.pitch });
  }
  // Every note outside the loop bracket. Nothing to draw, and an empty roll
  // looks like a bug where no roll looks like no roll.
  if (notes.length === 0) return null;
  notes.sort((a, b) => a.from - b.from || a.pitch - b.pitch);

  return {
    t: track.i,
    name: track.name,
    color: track.color,
    from,
    to,
    beatsPerBar: beatsPerBar(clip),
    ...keyboard(notes),
    // Spelled to match the key the set already states, so the gutter reads Bb
    // where the scene names say Bb.
    flats: spellsFlat(keyOf(set)),
    notes,
  };
}

/** The key the set states for what is playing, for spelling only. */
function keyOf(set: SetState): string {
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
 * Every playing clip, not just the bass track's. The extra clips cost one round
 * trip that is already being made, and asking for only the bass would mean this
 * module deciding which track that is before the answer that names the track's
 * instrument has come back — which is the sort of ordering that breaks the
 * first time somebody renames a track mid-set.
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

/** What would make a phone redraw the roll, ignoring where the playhead is. */
export function basslineShape(line: ChartBassline | null): string {
  if (!line) return '';
  const notes = line.notes.map((note) => `${note.from}:${note.to}:${note.pitch}`).join(',');
  return `${line.t}|${line.from}|${line.to}|${line.low}|${line.high}|${line.flats}|${notes}`;
}
