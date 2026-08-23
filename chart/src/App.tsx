import { useCallback, useEffect, useRef, useState } from 'react';
import { hex } from '../../core/src/color.ts';
import {
  degreeColor,
  degreeName,
  degreeOf,
  isBlackKey,
  keyColor,
  keyRoot,
  noteName,
} from '../../core/src/chords.ts';
import {
  formatSecondsLeft,
  loopBars,
  trackStatus,
} from '../../core/src/trackStatus.ts';
import {
  BASSLINE_EVENT,
  CHART_EVENT,
  EVENTS_PATH,
  LOOPS_EVENT,
  LOOPS_PATH_LENGTH,
  NUDGE,
  TEMPO_PATH,
  type Chart,
  type ChartBassline,
  type ChartLoops,
  type ChartSong,
  type LoopTrack,
} from '../protocol.ts';

/**
 * The chart, as somebody in the band sees it.
 *
 * Everything about the *song* arrives with every fact already worked out,
 * because the phone is the one client of this project that must not know how a
 * scene name is spelled. The one thing it does compute is where a playhead is
 * right now, and it has to: a wheel told its position twice a second would
 * step, and being told sixty times a second would put the network in the
 * animation loop. It is given a position and the moment it arrived, and it
 * advances that itself — the same trade `visuals` makes with the Link anchor.
 *
 * **The section list is not drawn**, though the payload still carries it and
 * `chart.ts` still works it out. Squeezed into a rail beside the tempo it was
 * too small to read and too wide to spare, and what it cost was the room the
 * two things you actually act on need — the tempo, and how far round each loop
 * is. It is a component's worth of work to put back when there is somewhere for
 * it to go; see `docs/reading.md`.
 */

/** What the status dot says, in the order the answers stop being reassuring. */
function condition(linked: boolean, chart: Chart | null): { text: string; live: boolean } {
  if (!linked || !chart) return { text: 'no chart', live: false };
  if (!chart.connected) return { text: 'no bridge', live: false };
  if (!chart.ready) return { text: 'waiting for Live', live: false };
  if (!chart.rolling) return { text: 'stopped', live: false };
  return { text: 'live', live: true };
}

/**
 * Keep the screen on while this is open.
 *
 * A phone that sleeps between choruses is a chart nobody reads. The lock is
 * dropped by the browser whenever the page is hidden, so it is taken again on
 * every return rather than once on mount. Every failure is silent and expected:
 * an older phone simply dims, which is the behaviour without this anyway.
 */
function useAwake(): void {
  const held = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let dropped = false;
    const take = async () => {
      if (document.visibilityState !== 'visible' || held.current) return;
      try {
        const lock = await navigator.wakeLock?.request('screen');
        if (!lock) return;
        if (dropped) return void lock.release();
        held.current = lock;
        lock.addEventListener('release', () => {
          held.current = null;
        });
      } catch {
        // No wake lock on this phone, or the browser refused it. Nothing to say.
      }
    };
    void take();
    document.addEventListener('visibilitychange', take);
    return () => {
      dropped = true;
      document.removeEventListener('visibilitychange', take);
      void held.current?.release();
      held.current = null;
    };
  }, []);
}

/**
 * What the song is, on one line under its name: the artist, the tag it is filed
 * under, and the key.
 *
 * **One line, because the key is two characters.** It had a size of its own and
 * a caption underneath, which spent a row of a phone screen saying a thing that
 * fits in the corner of one — and every row here is a row the wheels and the
 * roll are asking for. The demotion is in size only: the key leads the line in
 * the colour of the note it is built on, and the credits trail it in quiet ink,
 * because the key is the only one of the three anybody plays off.
 *
 * The colour is `keyColor`, which is absolute where the roll's are relative —
 * the same key is the same colour in every song, so a set looks the same on
 * Thursday as it did on Tuesday. A key the parser cannot read a root out of is
 * printed in plain ink, on the roll's rule: colouring against a root nobody
 * gave still looks deliberate.
 *
 * The key is resolved in `keyNow` below rather than taken off the song, because
 * a song that modulates has no single key and says so with `''`. The rule is
 * still "state it once, as high up as it is true" — what changed when the
 * section list came off the screen is where the lower place is. It used to be
 * the row for each section; it is now the section actually playing.
 */
function Facts({ song, musicalKey }: { song: ChartSong; musicalKey: string }) {
  const filed = [song.artist, song.tag].filter(Boolean);
  if (!musicalKey && filed.length === 0) return null;
  const root = keyRoot(musicalKey);
  return (
    <p className="facts">
      {musicalKey && (
        <span
          className="musical-key"
          style={root === null ? undefined : { color: keyColor(root) }}
        >
          {musicalKey}
        </span>
      )}
      {filed.map((credit) => (
        <span key={credit} className="credit">
          {credit}
        </span>
      ))}
    </p>
  );
}

/**
 * Live's tempo, and the two buttons that move it.
 *
 * The number is the display *and* the control, which is why it takes the room
 * it does: a band nudging a tempo needs to hit the target without looking and
 * read the result from across a stage. It shows what Live is actually running
 * at rather than what the song's name claims, because that is the thing the
 * buttons change — the claim appears beneath only when the two disagree.
 *
 * Nothing is optimistic. A press sends one nudge and the number moves when Live
 * says it moved, so a number that does not move is telling the truth about a
 * write that did not land.
 */
function Tempo({
  tempo,
  labelled,
  live,
  onNudge,
}: {
  tempo: number;
  labelled: string | null;
  live: boolean;
  onNudge: (by: number) => void;
}) {
  return (
    <div className="deck">
      <button
        className="nudge"
        type="button"
        disabled={!live}
        aria-label="one bpm slower"
        // Pointer-down rather than click: this is a control somebody reaches
        // for mid-song, and the press should land when the finger does.
        onPointerDown={() => onNudge(-NUDGE)}
      >
        −
      </button>
      <span className="reading">
        <span className="bpm">{live ? Math.round(tempo) : '—'}</span>
        <span className="of">bpm</span>
        {labelled && <span className="labelled">named {labelled}</span>}
      </span>
      <button
        className="nudge"
        type="button"
        disabled={!live}
        aria-label="one bpm faster"
        onPointerDown={() => onNudge(NUDGE)}
      >
        +
      </button>
    </div>
  );
}

/** The frame, and the moment it landed here. Monotonic, so a clock change can't move it. */
interface Anchor {
  loops: ChartLoops;
  at: number;
}

/**
 * Where a clip has got to, `ms` after the frame that reported it.
 *
 * A loop advances at a rate the tempo states and nothing else, so this is the
 * whole of the extrapolation. Live reports position in beats for MIDI and
 * warped audio and in **seconds** for unwarped audio, and `inSeconds` is which
 * — advancing seconds at the beat rate would run a wheel at twice speed on a
 * 120 BPM set and look almost right, which is the worst kind of wrong.
 */
function advance(track: LoopTrack, tempo: number, ms: number): OpenFlow.PlayingClip {
  const perSecond = track.inSeconds ? 1 : tempo / 60;
  return {
    t: track.t,
    position: track.position + (ms / 1000) * perSecond,
    loopStart: track.loopStart,
    loopEnd: track.loopEnd,
    looping: track.looping,
    recording: track.recording,
    inSeconds: track.inSeconds,
    signatureNumerator: track.signatureNumerator,
    signatureDenominator: track.signatureDenominator,
  };
}

/** How full to draw one wheel, and what to write in the middle of it. */
function reading(clip: OpenFlow.PlayingClip, tempo: number): { phase: number; text: string } | null {
  const status = trackStatus(clip, tempo);
  if (!status) return null;

  if (status.kind === 'oneShot') {
    // Not a loop, so the wheel fills once and stops rather than wrapping.
    const span = clip.loopEnd - clip.loopStart;
    const done = span > 0 ? (clip.position - clip.loopStart) / span : 1;
    return { phase: Math.max(0, Math.min(1, done)), text: formatSecondsLeft(status.secondsLeft) };
  }

  const bars = loopBars(clip);
  if (status.kind === 'recording') {
    return { phase: 0, text: `${status.bars}.${status.beats}` };
  }
  return { phase: status.phase, text: bars ? `${bars.bar}/${bars.bars}` : '' };
}

/**
 * One track's loop, as a wheel with its position written in the middle.
 *
 * A ring rather than the filled pie the grid draws. That pie exists at ten
 * pixels across, where a ring is all stroke and its two ends are a pixel apart
 * at every phase; here there is room for the ring to read from a music stand
 * *and* for the bar count to sit inside it, which is the pair of facts somebody
 * counting bars actually needs.
 *
 * `pathLength` is declared as 1 so the dash array is the phase itself, with no
 * circumference arithmetic to keep in step with the radius.
 */
function Wheel({
  track,
  arcRef,
  textRef,
}: {
  track: LoopTrack;
  arcRef: (el: SVGCircleElement | null) => void;
  textRef: (el: HTMLSpanElement | null) => void;
}) {
  return (
    <li className="loop">
      <span className="wheel">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle className="track" cx="20" cy="20" r="17" />
          <circle
            className="arc"
            cx="20"
            cy="20"
            r="17"
            pathLength={LOOPS_PATH_LENGTH}
            style={{ stroke: hex(track.color) }}
            ref={arcRef}
          />
        </svg>
        <span className="count" ref={textRef} />
      </span>
      <span className="track-name">{track.name}</span>
    </li>
  );
}

/**
 * How wide a note has to be, as a percentage of the roll, before its name fits.
 *
 * A phone's grid is around three hundred pixels and two characters want fourteen
 * of them, so anything under about five percent gets a clipped glyph instead of
 * a label. The threshold is in percent rather than beats deliberately: the same
 * eighth note is legible in a four-bar loop and a smear in a sixteen-bar one, so
 * it is the drawn width that decides and not the duration.
 */
const LABEL_AT = 4.5;

/**
 * The bass part, drawn the way Ableton's piano roll draws it.
 *
 * **A copy, not a chart of it.** Time runs left to right against the clip's own
 * bar lines and pitch runs up the side, and every note is where it was played,
 * as long as it was played for. Nothing here rounds a note to a window, merges
 * a run of them or decides what they add up to — the version that did could
 * disagree with the clip, and a chart the bass player has to double-check
 * against Live is one they will stop reading.
 *
 * **One octave, sitting on the open E.** Twelve rows up from the bottom of a
 * four-string, which is the same twelve rows every song: the row a note lands on
 * says what it said last week. Two octaves of real pitches drew an honest
 * picture of a part and spent most of a phone screen on the gap between the two
 * notes furthest apart in it. What is read off a chart is which note comes next,
 * and that is the same note in any octave.
 *
 * The window comes off the wire rather than being decided here, so every phone
 * in the room is looking at the same keyboard, and every note arrives already
 * folded into it. A note the server marked `below` sounded under that bottom E
 * and is drawn an octave up: the dot says the four strings ran out, the row says
 * where to play it anyway.
 *
 * **Colour is the degree and the text is the note.** A block's hue says what the
 * note is doing in the key — root, fifth, flat seventh — and the letter on it
 * says what to play. They are two different questions and a bass player asks
 * both: one to learn the shape of a song, the other to get through the next bar.
 */
function PianoRoll({ line, anchor }: { line: ChartBassline; anchor: Anchor | null }) {
  const head = useRef<HTMLDivElement | null>(null);
  const held = useRef<{ line: ChartBassline; anchor: Anchor | null }>({ line, anchor });
  held.current = { line, anchor };

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const bar = head.current;
      if (!bar) return;
      const now = held.current;
      const loops = now.anchor?.loops;
      const track = loops?.tracks.find((row) => row.t === now.line.t);
      if (!loops || !track) {
        bar.style.opacity = '0';
        return;
      }
      const span = now.line.to - now.line.from;
      if (!(span > 0)) return;
      const ms = loops.rolling ? performance.now() - now.anchor!.at : 0;
      const clip = advance(track, loops.tempo, ms);
      const into = (((clip.position - now.line.from) % span) + span) % span;
      bar.style.opacity = '1';
      // Transform rather than `left`, so the playhead moves without asking the
      // browser to lay the grid out again sixty times a second.
      //
      // **The element is the full width of the grid**, marked by its left
      // border, because a percentage translate resolves against the element's
      // own width rather than its parent's. A two-pixel bar translated 75% moves
      // a pixel and a half — which looks exactly like a playhead that is stuck
      // at the start, and is the sort of wrong that reads as "not implemented".
      bar.style.transform = `translateX(${(into / span) * 100}%)`;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const span = line.to - line.from;
  if (!(span > 0)) return null;

  const rows = Math.max(1, line.high - line.low + 1);
  const pitches = Array.from({ length: rows }, (_, i) => line.high - i);
  const degree = (pitch: number) => (line.root === null ? null : degreeOf(pitch, line.root));
  const bars = Math.max(1, Math.round(span / line.beatsPerBar));
  // Beat lines are detail, and detail stops helping once the bars are thin. A
  // sixteen-bar loop on a phone is twenty pixels a bar, where four more lines
  // inside each one is a texture rather than a grid.
  const beats = bars <= 8 && Number.isInteger(line.beatsPerBar) ? line.beatsPerBar : 0;

  return (
    <div className="roll" style={{ '--rows': rows } as React.CSSProperties}>
      <div className="keys">
        {pitches.map((pitch) => (
          <span key={pitch} className={`key ${isBlackKey(pitch) ? 'black' : 'white'}`}>
            {/* Every white key, so a note can be read off its row without
                counting up from the nearest C. The black keys stay blank: their
                names are the two-character ones, and the pattern beside them
                already says which is which. No octave numbers, because the roll
                is one octave and which one it is is not a fact anybody plays. */}
            {isBlackKey(pitch) ? '' : noteName(pitch, line.flats)}
          </span>
        ))}
      </div>

      <div className="grid">
        {pitches.map((pitch) => (
          <div
            key={pitch}
            className={`lane ${isBlackKey(pitch) ? 'black' : 'white'} ${
              pitch % 12 === 0 ? 'octave' : ''
            }`}
          />
        ))}

        {Array.from({ length: bars - 1 }, (_, i) => (
          <div key={`bar${i}`} className="barline" style={{ left: `${((i + 1) / bars) * 100}%` }} />
        ))}

        {Array.from({ length: bars * beats }, (_, i) => i).map((i) =>
          i === 0 || i % beats === 0 ? null : (
            <div key={`beat${i}`} className="beatline" style={{ left: `${(i / (bars * beats)) * 100}%` }} />
          ),
        )}

        {line.notes.map((note) => {
          const at = degree(note.pitch);
          const width = ((note.to - note.from) / span) * 100;
          return (
            <div
              key={`${note.from}:${note.pitch}`}
              className={`note ${at === 0 ? 'tonic' : ''} ${note.below ? 'below' : ''}`}
              style={{
                left: `${(note.from / span) * 100}%`,
                width: `${width}%`,
                top: `${((line.high - note.pitch) / rows) * 100}%`,
                height: `${100 / rows}%`,
                // The track's colour until the set states a key, because a roll
                // coloured against a root nobody gave is worse than a plain one:
                // the colours would still look deliberate.
                backgroundColor: at === null ? hex(line.color) : degreeColor(at),
              }}
              title={`${noteName(note.pitch, line.flats)}${at === null ? '' : ` · ${degreeName(at)}`}${
                note.below ? ' · an octave up, needs the fifth string' : ''
              }`}
            >
              {width >= LABEL_AT ? noteName(note.pitch, line.flats) : ''}
            </div>
          );
        })}

        <div className="playhead" ref={head} />
      </div>

      <ol className="bars">
        {Array.from({ length: bars }, (_, i) => (
          <li key={i}>{i + 1}</li>
        ))}
      </ol>
    </div>
  );
}

/** Gap between wheels, in pixels. Kept here because the fit has to subtract it. */
const SHELF_GAP = 10;

/** Room under each wheel for its track's name. */
const SHELF_NAME = 15;

/**
 * How many columns to lay the wheels out in, and how big to draw them.
 *
 * **The shelf is a fixed size and the wheels fit themselves into it.** The
 * alternative — wheels of a set size that wrap when they run out of room — is
 * what this replaces, and its problem was not that it wrapped: it was that the
 * shelf grew a line when it did, so firing a scene with one more track in it
 * moved everything below. On a phone on a music stand, a layout that jumps is a
 * layout somebody has to re-find mid-song.
 *
 * So the wheels take one row while a row's worth of width leaves them bigger
 * than half the shelf is tall, and two rows after that. That crossover is not a
 * track count: it falls out of the shelf's own proportions, since a second row
 * halves the height a wheel can use and doubles the width. Below it, splitting
 * makes every wheel *smaller* — which is why the obvious "wrap when it gets
 * tight" rule makes six wheels worse rather than better.
 */
function fit(count: number, box: { width: number; height: number } | null): {
  columns: number;
  wheel: number;
} {
  if (count === 0 || !box || box.width <= 0 || box.height <= 0) {
    return { columns: Math.max(1, count), wheel: 0 };
  }

  const across = (columns: number, rows: number) => {
    const wide = (box.width - SHELF_GAP * (columns - 1)) / columns;
    const tall = (box.height - SHELF_GAP * (rows - 1)) / rows - SHELF_NAME;
    return Math.max(0, Math.floor(Math.min(wide, tall)));
  };

  const one = across(count, 1);
  const columns = Math.ceil(count / 2);
  const two = across(columns, 2);
  return two > one ? { columns, wheel: two } : { columns: count, wheel: one };
}

/**
 * Every playing track's loop, turning.
 *
 * React owns which rows exist; the animation frame owns what is written in
 * them. Putting the phase through React state would re-render the whole list
 * sixty times a second to move an arc, which is the cost this project's
 * performance note is about — and here it would be paid on the oldest phone in
 * the room.
 */
function Loops({ anchor }: { anchor: Anchor | null }) {
  const arcs = useRef(new Map<number, SVGCircleElement>());
  const texts = useRef(new Map<number, HTMLSpanElement>());
  const held = useRef<Anchor | null>(anchor);
  held.current = anchor;
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const shelf = useRef<HTMLOListElement | null>(null);

  // Measured rather than guessed, because the answer depends on the shape of
  // the space and not on the phone: the same six wheels want one row in
  // landscape and two in a narrow portrait, and a breakpoint written in track
  // counts would be wrong on one of them.
  useEffect(() => {
    const el = shelf.current;
    if (!el) return;
    const watch = new ResizeObserver(([entry]) => {
      const size = entry?.contentRect;
      if (size) setBox({ width: size.width, height: size.height });
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const now = held.current;
      if (!now) return;
      // A stopped set's clips are frozen where they stand, and Live goes on
      // reporting them. Advancing anyway would spin every wheel on a silent
      // stage.
      const ms = now.loops.rolling ? performance.now() - now.at : 0;
      for (const track of now.loops.tracks) {
        const read = reading(advance(track, now.loops.tempo, ms), now.loops.tempo);
        const arc = arcs.current.get(track.t);
        if (arc) {
          const phase = read ? read.phase : 0;
          arc.style.strokeDasharray = `${phase} ${LOOPS_PATH_LENGTH - phase}`;
        }
        const text = texts.current.get(track.t);
        if (text) text.textContent = read ? read.text : '';
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const tracks = anchor?.loops.tracks ?? [];
  const shape = fit(tracks.length, box);

  // The shelf is rendered whatever happens, and holds its height when it is
  // empty. A block that appears and disappears with the clips would move the
  // roll under somebody's eyes every time a scene changed, which is the whole
  // complaint this layout answers.
  return (
    <ol
      className="loops"
      ref={shelf}
      style={
        {
          '--columns': shape.columns,
          '--wheel': `${shape.wheel}px`,
        } as React.CSSProperties
      }
    >
      {tracks.map((track) => (
        <Wheel
          key={track.t}
          track={track}
          arcRef={(el) => {
            if (el) arcs.current.set(track.t, el);
            else arcs.current.delete(track.t);
          }}
          textRef={(el) => {
            if (el) texts.current.set(track.t, el);
            else texts.current.delete(track.t);
          }}
        />
      ))}
    </ol>
  );
}

export function App() {
  const [chart, setChart] = useState<Chart | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [bassline, setBassline] = useState<ChartBassline | null>(null);
  const [linked, setLinked] = useState(false);
  useAwake();

  useEffect(() => {
    // EventSource reconnects on its own, forever, which is the behaviour a
    // phone that went in a pocket between songs needs and the reason this is
    // not a socket.
    const source = new EventSource(EVENTS_PATH);
    source.onopen = () => setLinked(true);
    source.onerror = () => setLinked(false);

    const take = <T,>(name: string, hand: (value: T) => void) => {
      source.addEventListener(name, ((message: MessageEvent) => {
        setLinked(true);
        try {
          hand(JSON.parse(message.data) as T);
        } catch {
          // A truncated frame is not worth blanking the page over; the next one
          // is along shortly.
        }
      }) as EventListener);
    };

    take<Chart>(CHART_EVENT, setChart);
    // Stamped on arrival with the browser's own monotonic clock, so nothing
    // here depends on the two machines agreeing about the time.
    take<ChartLoops>(LOOPS_EVENT, (loops) => setAnchor({ loops, at: performance.now() }));
    // Null is a real value here: a song with no bass track playing has to be
    // able to clear the roll the song before it left on screen.
    take<ChartBassline | null>(BASSLINE_EVENT, setBassline);

    return () => source.close();
  }, []);

  const nudge = useCallback((by: number) => {
    void fetch(TEMPO_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ by }),
    }).catch(() => {
      // Nothing useful to say to the room. The tempo not moving is the report.
    });
  }, []);

  const state = condition(linked, chart);
  const song = chart?.song ?? null;
  const now = chart?.now ?? null;
  const next = chart?.next ?? null;
  const ready = chart?.ready === true;

  // The song's, when its scenes agree on one. When they do not, the song has
  // nothing to state and the section playing does — which is the more useful
  // answer anyway: what matters on stage is the key of the part you are in, not
  // the set of keys the song visits.
  const keyNow = song?.key || now?.key || '';

  // Only when it disagrees with what Live is doing. When they match, the big
  // number already says it.
  const named = song?.bpm ? Number(song.bpm) : Number.NaN;
  const labelled =
    ready && Number.isFinite(named) && Math.round(named) !== Math.round(chart?.tempo ?? 0)
      ? song!.bpm
      : null;

  return (
    <main className="chart">
      <span
        className={`status-dot ${state.live ? 'on' : 'off'}`}
        role="status"
        aria-label={state.text}
        title={state.text}
      />

      <section className="head">
        <h1 className="song">
          {song?.name ?? now?.label ?? next?.label ?? 'Nothing playing'}
        </h1>
        {song && <Facts song={song} musicalKey={keyNow} />}
      </section>

      <Tempo tempo={chart?.tempo ?? 0} labelled={labelled} live={ready} onNudge={nudge} />

      <Loops anchor={anchor} />

      {bassline && (
        <section className="chart-roll">
          <p className="reading-from">{bassline.name}</p>
          <PianoRoll line={bassline} anchor={anchor} />
        </section>
      )}

      {/* Somebody dropped a scene into the set that the naming convention does
          not cover. Saying so is more use than drawing nothing. */}
      {!song && now && <p className="quiet">Not part of a named song</p>}
    </main>
  );
}
