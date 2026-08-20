import { useEffect, useRef, useState } from 'react';
import { hex } from '../../core/src/color.ts';
import { EVENTS_PATH, type Chart, type ChartSection, type ChartSong } from '../protocol.ts';

/**
 * The chart, as somebody in the band sees it.
 *
 * Everything here is presentation. The payload arrives with every fact already
 * worked out — the song, its sections, which one is lit — because the phone is
 * the one client of this project that must not know how a scene name is spelled.
 *
 * It reads and never writes. There is no request on the wire, so there is
 * nothing to guard: the worst a bandmate can do with this page open is watch.
 */

/**
 * Live's actual tempo, and **only when it is not already the big number**.
 *
 * The song's bpm vital is what the set is nominally at; this is what the room
 * is at. When they agree, printing both is the same number twice — so it stays
 * hidden and its appearance means something: either the band is running the
 * song somewhere other than its label, or the song has no label to run against
 * (unnamed, or stating a bpm per section) and this is the only tempo there is.
 *
 * Rounded on both sides because Live's tempo is a float and a set sitting at
 * 100.02 is sitting at 100.
 */
function runningTempo(chart: Chart): number | null {
  if (!chart.ready) return null;
  // Not `Number(bpm)` alone: `Number('')` is 0, which is finite, so a song with
  // no bpm at all would compare as though it had stated one.
  const labelled = chart.song?.bpm ? Number(chart.song.bpm) : Number.NaN;
  if (Number.isFinite(labelled) && Math.round(labelled) === Math.round(chart.tempo)) {
    return null;
  }
  return chart.tempo;
}

/** What the top line says, in the order the answers stop being reassuring. */
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
 * The two facts somebody hearing the song for the first time needs.
 *
 * Split out from the artist and the tag rather than sitting in one row with
 * them, because they are not the same kind of thing: these two are what you
 * need to *play* along, and the other two are what the song is filed under.
 * Given one glance from a music stand, this is what the glance should land on.
 *
 * Either can be missing, and that is the section list carrying it instead — a
 * song that modulates or speeds up states those per section, so an empty slot
 * here is a signal rather than a gap. See `protocol.ts`.
 */
function Vitals({ song }: { song: ChartSong }) {
  const shown = [
    { of: 'key', value: song.key },
    { of: 'bpm', value: song.bpm },
  ].filter((vital) => vital.value !== '');
  if (shown.length === 0) return null;
  return (
    <p className="vitals">
      {shown.map((vital) => (
        <span key={vital.of} className="vital">
          <span className="value">{vital.value}</span>
          <span className="of">{vital.of}</span>
        </span>
      ))}
    </p>
  );
}

/** What the song is filed under. Quiet on purpose — nobody plays off it. */
function Credits({ song }: { song: ChartSong }) {
  const credits = [song.artist, song.tag].filter(Boolean);
  if (credits.length === 0) return null;
  return (
    <p className="credits">
      {credits.map((credit) => (
        <span key={credit} className="credit">
          {credit}
        </span>
      ))}
    </p>
  );
}

function Section({ section }: { section: ChartSection }) {
  const mark = section.playing ? 'playing' : section.queued ? 'queued' : 'idle';
  return (
    <li className={`section ${mark}`}>
      <span
        className="edge"
        style={section.color === null ? undefined : { background: hex(section.color) }}
      />
      <span className="label">{section.label}</span>
      {/* Present only when the heading could not state it — a song that
          modulates or speeds up — so a row carrying one is a row to look at. */}
      {section.bpm && <span className="states">{section.bpm}</span>}
      {section.key && <span className="states">{section.key}</span>}
    </li>
  );
}

export function App() {
  const [chart, setChart] = useState<Chart | null>(null);
  const [linked, setLinked] = useState(false);
  useAwake();

  useEffect(() => {
    // EventSource reconnects on its own, forever, which is the behaviour a
    // phone that went in a pocket between songs needs and the reason this is
    // not a socket.
    const source = new EventSource(EVENTS_PATH);
    source.onopen = () => setLinked(true);
    source.onmessage = (message) => {
      setLinked(true);
      try {
        setChart(JSON.parse(message.data) as Chart);
      } catch {
        // A truncated frame is not worth blanking the page over; the next one
        // is a quarter of a second away.
      }
    };
    source.onerror = () => setLinked(false);
    return () => source.close();
  }, []);

  const state = condition(linked, chart);
  const running = chart ? runningTempo(chart) : null;
  const song = chart?.song ?? null;
  const now = chart?.now ?? null;
  const next = chart?.next ?? null;

  return (
    <main className="chart">
      <header className="condition">
        <span className={`dot ${state.live ? 'on' : 'off'}`} />
        <span className="what">{state.text}</span>
        {running !== null && <span className="tempo">{Math.round(running)}</span>}
      </header>

      {/* A set with nothing playing is the ordinary state between songs, so it
          gets a sentence rather than an empty screen. */}
      {!now && !next && <p className="quiet">Nothing playing</p>}

      {(now || next) && (
        <section className="head">
          <h1 className="song">{song?.name ?? now?.label ?? next?.label}</h1>
          {song && <Vitals song={song} />}
          {song && <Credits song={song} />}
          {now && <p className="now">{now.label}</p>}
          {next && !next.playing && <p className="next">{next.label}</p>}
        </section>
      )}

      {song && song.sections.length > 0 && (
        <ol className="sections">
          {song.sections.map((section) => (
            <Section key={section.s} section={section} />
          ))}
        </ol>
      )}

      {/* Somebody dropped a scene into the set that the naming convention does
          not cover. Saying so is more use than drawing nothing. */}
      {!song && now && <p className="quiet">Not part of a named song</p>}
    </main>
  );
}
