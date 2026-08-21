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

/**
 * The open E of a four-string, as a pitch class.
 *
 * The bottom of the roll and the line the marker is drawn against — everything
 * below it is the fifth string.
 */
const LOW_E = 4;

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
 * Where the octave the roll draws starts: the E nearest the part's low note.
 *
 * **A four-string's open E, in whatever octave the part is written in.** Which
 * octave that is cannot be a constant — clips get written up, plugins
 * transpose, and a fixed floor was wrong twice before this — so it is measured
 * off the material. The E nearest the lowest note played is that E: a part
 * bottoming out on the open A picks the E a fourth below it, and one bottoming
 * out on a low D picks the E two semitones *above*, which is the answer that
 * says the D is under the E rather than a seventh over it.
 *
 * A tie — a lowest note exactly six semitones between two Es — takes the lower,
 * so nothing gets marked as needing a fifth string on the strength of a
 * coin toss.
 */
function lowE(lowest: number): number {
  const below = lowest - (((lowest - LOW_E) % 12) + 12) % 12;
  const above = below + 12;
  return lowest - below <= above - lowest ? below : above;
}

/**
 * A note brought into the octave the roll draws.
 *
 * **One octave, so every note is a pitch class in the end.** Two octaves of real
 * pitches drew an honest picture of a part and spent most of a phone screen on
 * the empty space between the two notes furthest apart in it. What a bass player
 * reads off a chart is which note comes next, and that is the same note in any
 * octave.
 *
 * `below` is the one thing the octave is still worth saying, and only in one
 * direction. A note **under the low E has to come up** to be drawn, and a
 * four-string has to play it up there too — so the mark is not the roll
 * apologising for its own layout, it is the chart saying *this line was written
 * for five strings, and here is how you get away with it on four*. A note folded
 * *down* from above carries nothing, because anybody can play it where it is
 * drawn.
 */
function fold(pitch: number, low: number): { pitch: number; below: boolean } {
  return { pitch: low + ((((pitch - low) % 12) + 12) % 12), below: pitch < low };
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

  let lowest = sounding[0]!.pitch;
  for (const note of sounding) if (note.pitch < lowest) lowest = note.pitch;
  const low = lowE(lowest);

  const notes: BasslineNote[] = sounding.map((note) => {
    const on = fold(note.pitch, low);
    return {
      from: note.start - from,
      to: Math.min(to, note.start + note.duration) - from,
      pitch: on.pitch,
      ...(on.below ? { below: true } : {}),
    };
  });
  notes.sort((a, b) => a.from - b.from || a.pitch - b.pitch);

  return {
    t: track.i,
    name: track.name,
    color: track.color,
    from,
    to,
    beatsPerBar: beatsPerBar(clip),
    low,
    high: low + 11,
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
