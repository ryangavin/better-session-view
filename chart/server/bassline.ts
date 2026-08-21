import { keyRoot, spellsFlat } from '../../core/src/chords.ts';
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

/** How much of the keyboard the roll shows. Two octaves is a bass. */
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
 * The stretch of keyboard to draw: two octaves, sitting on the part's low note.
 *
 * **The part decides where the window is, not the other way round.** The low B
 * of a five-string is a fact about an instrument and not about a set — clips get
 * written an octave up, plugins transpose, and a roll anchored on the
 * theoretical note drew a real part hanging off the middle line with the bottom
 * half empty. Anchoring on the lowest note played means the roll always fills,
 * whatever the material is doing.
 *
 * Two octaves stays fixed, so what changes between songs is where the window
 * *is* and never how tall a row is. A note above the window is folded down into
 * it, silently: what a bass player needs from a chart is which notes are valid,
 * and being told that one of them was moved to fit is the chart talking about
 * itself.
 */
function keyboard(notes: readonly BSV.ClipNote[]): { low: number; high: number } {
  let low = notes[0]!.pitch;
  for (const note of notes) if (note.pitch < low) low = note.pitch;
  return { low, high: low + 12 * OCTAVES };
}

/**
 * A note dropped by whole octaves until it is on the keyboard.
 *
 * Whole octaves rather than a clamp to the edge, because a clamp changes what
 * the note *is*, and a run of clamps would flatten a line into a bar along the
 * top of the roll. An octave keeps the note name, which is the part being read.
 *
 * Only ever downwards: the window sits on the lowest note, so nothing can fall
 * off the bottom of it.
 */
function fold(pitch: number, high: number): number {
  let at = pitch;
  while (at > high) at -= 12;
  return at;
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
  const key = keyOf(set);
  // Unwarped audio measures its loop in seconds, so it has no bars — and it has
  // no notes either, so this is belt and braces rather than a real case.
  if (clip.inSeconds) return null;

  const from = clip.loopStart;
  const to = clip.loopEnd;
  if (!(to > from)) return null;

  // Sounding notes first, at their real pitches, because the window is measured
  // from them — folding before knowing where the keyboard is would move a note
  // and then anchor to where it was moved to.
  const sounding: BSV.ClipNote[] = [];
  for (const note of part.notes) {
    if (note.start < from || note.start >= to) continue;
    if (!(Math.min(to, note.start + note.duration) > note.start)) continue;
    sounding.push(note);
  }
  // Every note outside the loop bracket. Nothing to draw, and an empty roll
  // looks like a bug where no roll looks like no roll.
  if (sounding.length === 0) return null;

  const { low, high } = keyboard(sounding);
  const notes: BasslineNote[] = sounding.map((note) => ({
    from: note.start - from,
    to: Math.min(to, note.start + note.duration) - from,
    pitch: fold(note.pitch, high),
  }));
  notes.sort((a, b) => a.from - b.from || a.pitch - b.pitch);

  return {
    t: track.i,
    name: track.name,
    color: track.color,
    from,
    to,
    beatsPerBar: beatsPerBar(clip),
    low,
    high,
    // Both from the key the set already states: the gutter reads Bb where the
    // scene names say Bb, and the degrees are counted from the note the song is
    // actually in rather than from whatever the bass player's lowest note was.
    flats: spellsFlat(key),
    root: keyRoot(key),
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
  return `${line.t}|${line.from}|${line.to}|${line.low}|${line.high}|${line.flats}|${line.root}|${notes}`;
}
