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

/** How much of the keyboard the roll shows. */
const OCTAVE = 12;

/**
 * The open E of a four-string bass, as this set's clips write it.
 *
 * **A fact about the rig, and the only one in this file.** Nothing in a clip
 * says what instrument plays it or how that instrument is tuned, so the one
 * question a chart cannot answer from the notes is whether a low note is *low*
 * or merely written low. This set puts a five-string's B at 35, which puts the
 * E above it here.
 *
 * Retune or re-record an octave away and this is the line to change.
 */
const FOUR_STRING_E = 40;

/** Beats to the bar, from a clip's own signature. Live counts in quarter notes. */
function beatsPerBar(clip: OpenFlow.PlayingClip): number {
  const { signatureNumerator: num, signatureDenominator: den } = clip;
  if (!(num > 0) || !(den > 0)) return 4;
  return (num * 4) / den;
}

/** One track, its playing clip and the notes read out of it. */
interface Part {
  track: OpenFlow.Track;
  clip: OpenFlow.PlayingClip;
  notes: readonly OpenFlow.ClipNote[];
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
 * A note moved into the octave the roll draws.
 *
 * **One octave, so every note is a pitch class in the end.** Two octaves of real
 * pitches drew an honest picture of a part and spent most of a phone screen on
 * the empty space between the two notes furthest apart in it. What a bass player
 * reads off a chart is which note comes next, and that is the same note in any
 * octave.
 *
 * Both directions, because the window sits on an E rather than on the part: a
 * note over the top row comes down, and one under the bottom row goes up.
 * Only the ones that went up are marked, because they are the ones that cost the
 * player something — see `needsFive`.
 *
 * Whole octaves rather than a clamp to the edge, because a clamp changes what
 * the note *is*, and a run of clamps would flatten a line into a bar along the
 * top of the roll.
 */
function fold(pitch: number, low: number): number {
  return low + ((((pitch - low) % OCTAVE) + OCTAVE) % OCTAVE);
}

/**
 * The E the roll sits on, found from the part.
 *
 * **The bottom row is an E, every song.** Twelve rows up from a four-string's
 * open E is the keyboard the player is reading, and it holds still: the row a
 * note lands on tonight means what it meant last week. The window sat on the
 * part's lowest note before this, which drew a part that fitted in an octave
 * exactly where it was played, and moved every row underneath the reader the
 * moment the bass line changed.
 *
 * **Downwards only.** Clips get written an octave out and the answer has to
 * survive that, but the two directions are not the same question. A part sitting
 * above the open E is playable where it is, whichever octave it was typed in —
 * the fixed pitch is already the useful reading of it. A part sitting entirely
 * *below* the open E is playable nowhere, and measuring that against a fixed
 * pitch would mark every note in it: a roll of dots, saying nothing. So the E
 * follows the part down and never up, and it is the part's **highest** note that
 * says when to move, because the lowest one is the note under question.
 */
function openE(sounding: readonly OpenFlow.ClipNote[]): number {
  let top = sounding[0]!.pitch;
  for (const note of sounding) if (note.pitch > top) top = note.pitch;
  let e = FOUR_STRING_E;
  while (top < e) e -= OCTAVE;
  return e;
}

/**
 * Whether a note is below what a four-string can reach — which is now the same
 * question as whether it had to be moved to be drawn.
 *
 * **One question, not two.** Asking the roll was wrong while the roll followed
 * the part: a line in D minor an octave above the low E had its window snapped
 * to the E above its lowest note, which threw the D and the Eb over the top and
 * marked them, and those are notes anybody can play. The answer then was to ask
 * a fixed pitch instead and let the layout disagree with the mark.
 *
 * The roll sits on the E itself now, so there is nothing left to disagree: a
 * note under the bottom row is a note under the open E, and the octave it is
 * drawn up into is the octave the player has to find it in. The dot says *this
 * line was written for five strings, and here is where the fourth one ran out*.
 */
function needsFive(pitch: number, low: number): boolean {
  return pitch < low;
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

  // Sounding notes first, at their real pitches, because both the keyboard and
  // the dot are measured from them — folding first would move a note and then
  // ask its question of where it was moved to.
  const sounding: OpenFlow.ClipNote[] = [];
  for (const note of part.notes) {
    if (note.start < from || note.start >= to) continue;
    if (!(Math.min(to, note.start + note.duration) > note.start)) continue;
    sounding.push(note);
  }
  // Every note outside the loop bracket. Nothing to draw, and an empty roll
  // looks like a bug where no roll looks like no roll.
  if (sounding.length === 0) return null;

  const low = openE(sounding);

  const notes: BasslineNote[] = sounding.map((note) => ({
    from: note.start - from,
    to: Math.min(to, note.start + note.duration) - from,
    pitch: fold(note.pitch, low),
    ...(needsFive(note.pitch, low) ? { below: true } : {}),
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
    high: low + OCTAVE - 1,
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
  const notes = line.notes
    .map((note) => `${note.from}:${note.to}:${note.pitch}${note.below ? 'v' : ''}`)
    .join(',');
  return `${line.t}|${line.from}|${line.to}|${line.low}|${line.high}|${line.flats}|${line.root}|${notes}`;
}
