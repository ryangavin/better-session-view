import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import { Facts, type Fact } from '@openflow/widgets/debug/Facts.tsx';
import { Group, Harness, Shelf, Status, Toolbar } from '@openflow/widgets/debug/Harness.tsx';
import { Legend } from '@openflow/widgets/debug/Legend.tsx';
import { Plot } from '@openflow/widgets/debug/Plot.tsx';
import { Scope, ScopeRow, type ScopePointer } from '@openflow/widgets/debug/Scope.tsx';
import { Transport } from '@openflow/widgets/debug/Transport.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { useRemembered } from '@openflow/widgets/debug/useRemembered.ts';
import { spanOf, xOf, type View } from '@openflow/widgets/debug/axis.ts';
import type { Follow } from '../follow.ts';
import { openflow } from '../openflow.ts';
import type { Mix, Track } from '../state.ts';
import { countedOf, refitOf, sweepOf, type Fit, type Sweep } from '../tempo.ts';
import type { Trace } from '../trace.ts';
import { heardIn, type Heard } from '../transients.ts';
import { BEATS_PER_BAR, beatAt, tempoAt, tempoOf, countOf, renumbered, sampleOf, type Beats } from '../warp.ts';
import { ARMS, INPUTS, run, SAYS, straight, type Arm, type Input } from './arms.ts';
import { Audition, type Click } from './audition.ts';
import * as D from './draw.ts';
import { AnalysisEvidence } from './AnalysisEvidence.tsx';
import './Analysis.css';

/**
 * The beat finding, looked at.
 *
 * The app can say what grid it found; it cannot say why. This page runs the
 * same pipeline on the same decoded stems — with a trace, so every decision
 * on the way to the answer is kept — and draws it: the drums, the hits it
 * heard, the beats it laid, the tempo it followed, and the autocorrelation
 * and phase sweep that chose the seed. Any arm of the A/B rig runs here
 * too, on the drums or the whole mix, so a wrong tempo can be traced to the
 * stage that lost it.
 *
 * The ear is the strongest check: play the stems with a click on every beat,
 * loop a stretch, scrub. When the grid is right, **take** hands it to the
 * app as if Auto-warp had found it — the lanes redraw and it is kept beside
 * the track — and **export** lays every stem straight at a whole tempo from
 * 1.1.1, which is what drops into Live like a loop off a pack.
 */
interface Run {
  arm: Arm;
  input: Input;
  heard: Heard;
  fit: Fit | null;
  follow: Follow | null;
  trace: Trace;
  ms: number;
}

/** The map as it stands: the run's, or the hand's after a sweep or a new 1.1.1. */
interface Map {
  beats: Beats;
  bpm: number;
  offset: number;
  /** The follower laid it; the follow trace still describes it. */
  followed: boolean;
}

const ARM_TITLES: Record<Arm, string> = {
  ours: 'Adaptive beat follower', line: 'Fitted straight grid', whole: 'Whole-tempo grid',
  flux: 'Spectral onset follower', comb: 'Comb-seeded follower', ellis: 'Dynamic beat tracker', grid: 'Comb straight grid',
};

const BANDS = [
  ['low', 'kick', 'below 120 Hz, as the kick was heard'],
  ['mid', 'snare', '200 to 2500 Hz, as the snare was heard'],
  ['high', 'hats', 'above 4 kHz, as the hats were heard'],
] as const;

const EXPORT_TEMPO: Param = { kind: 'float', min: 40, max: 300, defaultValue: 120, unit: 'custom', customUnit: '%0.3f' };

/** Whether a map is a straight ruling: every spacing the same, to a sample. */
function isStraight(beats: Beats): boolean {
  const gap = beats.samples[1] - beats.samples[0];
  for (let i = 1; i + 1 < beats.samples.length; i++) if (Math.abs(beats.samples[i + 1] - beats.samples[i] - gap) > 1) return false;
  return true;
}

const channelsOf = (buffer: AudioBuffer): Float32Array[] =>
  Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/** Every stem summed back into the whole, channel by channel. */
function summed(buffers: AudioBuffer[]): Float32Array[] {
  const length = Math.max(...buffers.map((b) => b.length));
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  return Array.from({ length: channels }, (_, c) => {
    const out = new Float32Array(length);
    for (const b of buffers) {
      const data = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      for (let i = 0; i < data.length; i++) out[i] += data[i];
    }
    return out;
  });
}

export function Analysis({ mix, editing = false }: { mix: Mix; editing?: boolean }) {
  const song = mix.song;
  const withStems = mix.songs.filter((t) => t.stems && t.sources.length > 0);
  const subject = (
    <Select
      items={withStems.map((t) => t.title)}
      index={Math.max(0, withStems.findIndex((t) => t.id === song?.id))}
      onChange={(i) => mix.select(withStems[i].id)}
      width={220}
      label="track"
    />
  );
  if (!song || !song.stems) {
    return (
      <Harness title="analysis" subject={subject} status={<Status tone="quiet">open a track with stems</Status>} />
    );
  }
  return <Track key={song.id} mix={mix} song={song} subject={editing ? undefined : subject} editing={editing} />;
}

function Track({ mix, song, subject, editing }: { mix: Mix; song: Track; subject: React.ReactNode; editing: boolean }) {
  const seconds = mix.seconds;
  const axis = useAxis({ seconds: Math.max(seconds, 1) });
  const box = useRef<HTMLDivElement>(null);
  const deck = useRef<Audition | null>(null);
  if (!deck.current) deck.current = new Audition();

  const [arm, setArm] = useRemembered<Arm>('mix-analysis-arm', 'ours');
  const [input, setInput] = useRemembered<Input>('mix-analysis-input', 'drums');
  const [stems, setStems] = useRemembered<string[]>('mix-analysis-stems', ['drums']);
  const [bands, setBands] = useRemembered<string[]>('mix-analysis-bands', []);
  const [click, setClick] = useRemembered('mix-analysis-click', true);
  const [ran, setRan] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [map, setMap] = useState<Map | null>(() => editing ? { beats: mix.grid, bpm: tempoOf(mix.grid), offset: sampleOf(mix.grid, 0) / mix.grid.rate, followed: Boolean(mix.beats) } : null);
  const [swept, setSwept] = useState<Sweep | null>(null);
  const [candidate, setCandidate] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState<number | null>(null);
  const [picking, setPicking] = useState<number[] | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean }>({ text: '' });
  const [under, setUnder] = useState('');
  const [exportBpm, setExportBpm] = useState(120);
  const [exporting, setExporting] = useState(false);

  const pendingRun = useRef<number | null>(null);
  useEffect(() => () => { if (pendingRun.current !== null) window.clearTimeout(pendingRun.current); }, []);

  const say = useCallback((text: string, bad = false) => setNote({ text, bad }), []);

  // The stems the app decoded, handed to the deck as they arrive.
  const decoded = !mix.decoding;
  useEffect(() => {
    const d = deck.current!;
    for (const source of song.sources) {
      const buffer = mix.audioOf(source);
      if (buffer) d.adopt(source, buffer);
    }
  }, [song.sources, decoded, mix]);
  useEffect(() => () => deck.current?.forget(), []);

  const rate = mix.rate || 44100;

  /** The channels an arm hears: the drums, or the whole. */
  const channelsFor = useCallback(
    (which: Input): Float32Array[] | null => {
      if (which === 'drums') {
        const drums = mix.audioOf('drums');
        return drums ? channelsOf(drums) : null;
      }
      const all = song.sources.map((s) => mix.audioOf(s)).filter((b): b is AudioBuffer => b !== null);
      return all.length ? summed(all) : null;
    },
    [mix, song.sources],
  );

  const analyse = useCallback(
    (which: Arm, on: Input) => {
      const name = editing ? ARM_TITLES[which] : which;
      const channels = channelsFor(on);
      if (!channels) {
        say('the stems are not decoded yet', true);
        return;
      }
      setRunning(true);
      say(`running ${name} on ${on}…`);
      pendingRun.current = window.setTimeout(() => {
        pendingRun.current = null;
        try {
          const trace: Trace = { tempo: { frame: 0.004 }, follow: { frame: 0.004 } };
          const started = performance.now();
          const got = run(which, channels, rate, trace);
          const ms = Math.round(performance.now() - started);
          setRunning(false);
          if (!got) {
            if (!editing) setRan(null);
            if (!editing) setMap(null);
            say(`${name}: heard nothing to work with`, true);
            return;
          }
          setRan({ arm: which, input: on, heard: got.heard, fit: got.fit, follow: got.follow, trace, ms });
          setSwept(null);
          setCandidate(trace.tempo?.chosen?.candidate ?? 0);
          if (got.beats) {
            setMap({
              beats: got.beats,
              bpm: got.fit?.bpm ?? tempoOf(got.beats),
              offset: got.fit?.offset ?? got.beats.samples[0] / got.beats.rate,
              followed: got.follow !== null,
            });
            setExportBpm(Math.round(got.fit?.bpm ?? tempoOf(got.beats)));
            say(`${name} on ${on}: ${got.fit ? `${got.fit.bpm} bpm` : 'no fit'}${got.follow ? ', followed' : ''} in ${ms} ms`);
          } else {
            if (!editing) setMap(null);
            say(`${name} on ${on}: ${trace.tempo?.refused ?? trace.follow?.refused ?? 'no beats'} (${ms} ms)`, true);
          }
        } catch (error) {
          setRunning(false); say(error instanceof Error ? error.message : String(error), true);
        }
      }, 0);
    },
    [channelsFor, rate, say, editing],
  );

  // The first look is the app's own pipeline on the drums, as soon as they are decoded.
  const drumsReady = decoded && mix.audioOf('drums') !== null;
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current || !drumsReady) return;
    looked.current = true;
    if (editing) {
      const channels = channelsFor('drums');
      const heard = channels && heardIn(channels, rate);
      if (heard) setRan({ arm: 'ours', input: 'drums', heard, fit: mix.detected, follow: mix.detected && 'beats' in mix.detected ? mix.detected : null, trace: {}, ms: 0 });
      say('Showing the current grid. Find beats to compare a new candidate; Apply grid keeps your changes.');
    } else analyse(arm, input);
  }, [drumsReady, analyse, arm, input, editing, channelsFor, rate, mix.detected, say]);

  /* ---------- the map by hand ---------- */

  const replaceMap = useCallback((beats: Beats, bpm: number, offset: number) => {
    setMap({ beats, bpm, offset, followed: false });
    setExportBpm(Math.round(bpm));
  }, []);

  const sweep = useCallback(
    (from?: Map) => {
      const m = from ?? map;
      if (!ran || !m) return;
      const got = sweepOf(ran.heard, m.offset, m.bpm);
      setSwept(got);
      if (!got) {
        say('too few hits to sweep', true);
        return;
      }
      const ruled = straight(got.best.bpm, m.offset, m.beats.rate, m.beats.length);
      if (ruled) replaceMap(ruled, got.best.bpm, m.offset);
      say(`swept from 1.1.1 at ${m.offset.toFixed(3)} s: ${got.best.bpm.toFixed(3)} (${got.best.error.toFixed(1)} ms) · whole ${got.whole.bpm} (${got.whole.error.toFixed(1)} ms)`);
    },
    [ran, map, replaceMap, say],
  );

  /** 1.1.1 moved to a sample: a straight map ruled again and swept; a followed map renumbered. */
  const downbeatAt = useCallback(
    (sample: number) => {
      if (!ran || !map) return;
      const r = map.beats.rate;
      if (isStraight(map.beats)) {
        const ruled = straight(map.bpm, sample / r, r, map.beats.length);
        if (!ruled) return;
        const next: Map = { beats: ruled, bpm: map.bpm, offset: sample / r, followed: false };
        setMap(next);
        sweep(next);
        return;
      }
      const i = D.nearestBeat(map.beats, sample);
      if (i == null) return;
      const samples = [...map.beats.samples];
      samples[i] = sample;
      replaceMap(renumbered({ ...map.beats, samples }, map.beats.first + i), map.bpm, sample / r);
      say(`1.1.1 at ${(sample / r).toFixed(3)} s`);
    },
    [ran, map, replaceMap, sweep, say],
  );

  const twoPicked = useCallback(
    (a: number, b: number) => {
      if (!ran || !map) return;
      const r = map.beats.rate;
      const counted = countedOf(a / r, b / r, map.bpm);
      if (!counted) {
        say('the two picks are not a beat apart', true);
        return;
      }
      const first = Math.min(a, b);
      const i = D.nearestBeat(map.beats, first);
      const inBar = i == null ? 0 : (((map.beats.first + i) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
      const period = 60 / counted.bpm;
      const downbeat = first / r - inBar * period;
      const refined = refitOf(ran.heard, counted.bpm, downbeat);
      const bpm = refined?.bpm ?? counted.bpm;
      const offset = refined?.offset ?? downbeat;
      const ruled = straight(bpm, offset, r, map.beats.length);
      if (!ruled) return;
      replaceMap(ruled, bpm, offset);
      say(`${counted.beats} beats apart: ${counted.bpm} measured, ${bpm} through the song${refined ? '' : ' (refinement refused; the measurement stands)'}`);
    },
    [ran, map, replaceMap, say],
  );

  /** The kick or snare nearest a moment, within a twentieth of a second, as a sample. */
  const hitNear = useCallback(
    (at: number): number | null => {
      let best: number | null = null;
      let away = 0.05;
      for (const hit of ran?.heard.transients ?? []) {
        if (hit.band === 'high') continue;
        const d = Math.abs(hit.at - at);
        if (d < away) {
          away = d;
          best = hit.sample;
        }
      }
      return best;
    },
    [ran],
  );

  /** The beat nearest a moment, within a quarter of a beat, as a sample. */
  const beatNear = useCallback(
    (at: number): number | null => {
      if (!map) return null;
      const i = D.nearestBeat(map.beats, at * map.beats.rate);
      if (i == null) return null;
      const period = (60 * map.beats.rate) / tempoOf(map.beats);
      return Math.abs(map.beats.samples[i] - at * map.beats.rate) <= period / 4 ? map.beats.samples[i] : null;
    },
    [map],
  );

  /** A click on the beats row or the transients row: a pick, or with alt, a new 1.1.1. */
  const pickOn = useCallback(
    (near: (at: number) => number | null, what: string) => (ev: ScopePointer) => {
      if (ev.type !== 'up' || !map) return;
      if (!picking && !ev.alt) return;
      const sample = near(ev.at);
      if (sample == null) {
        say(`no ${what} there`, true);
        return;
      }
      if (picking) {
        const next = [...picking, sample];
        if (next.length < 2) {
          setPicking(next);
          say(`first beat at ${(sample / map.beats.rate).toFixed(3)} s — pick the second`);
          return;
        }
        setPicking(null);
        twoPicked(next[0], next[1]);
        return;
      }
      downbeatAt(sample);
    },
    [map, picking, downbeatAt, twoPicked, say],
  );

  /* ---------- listening ---------- */

  const chosen = useMemo(
    () => [...stems.filter((s) => song.sources.includes(s)), ...bands.map((b) => `drums#${b}`)],
    [stems, bands, song.sources],
  );

  const clicks = useMemo((): Click[] => {
    if (!click || !map) return [];
    return map.beats.samples.map((sample, i) => ({ at: sample / map.beats.rate, down: D.isDownbeat(map.beats, i) }));
  }, [click, map]);

  const play = useCallback(async () => {
    const d = deck.current!;
    mix.stop();
    d.looping = axis.loop !== null;
    const span = axis.loop ?? { from: 0, to: seconds };
    try {
      await d.start(chosen, clicks, span, axis.loop ? axis.loop.from : axis.cursor);
      setPlaying(true);
    } catch (err) {
      say(String(err), true);
    }
  }, [mix, axis.loop, axis.cursor, seconds, chosen, clicks, say]);

  const stop = useCallback(() => {
    const d = deck.current!;
    const at = d.position();
    d.stop();
    setPlaying(false);
    setHead(null);
    if (at != null) axis.seek(at);
  }, [axis]);

  const toggle = useCallback(() => {
    if (deck.current!.playing) stop();
    else void play();
  }, [play, stop]);

  // A change of what is heard while playing restarts the pass with it.
  const heardKey = `${chosen.join(',')}|${clicks.length}|${axis.loop?.from}-${axis.loop?.to}`;
  const lastHeard = useRef(heardKey);
  useEffect(() => {
    if (lastHeard.current === heardKey) return;
    lastHeard.current = heardKey;
    if (deck.current!.playing) void play();
  }, [heardKey, play]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      const d = deck.current!;
      if (!d.playing) {
        setPlaying(false);
        setHead(null);
        return;
      }
      setHead(d.position());
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLElement && ev.target.closest('input, select, textarea, button')) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);

  const wasPlaying = useRef(false);
  const scrub = useMemo(
    () => ({
      start: (at: number) => {
        const d = deck.current!;
        wasPlaying.current = d.playing;
        mix.stop();
        d.scrubStart(chosen, at);
        setPlaying(false);
        setHead(null);
      },
      to: (at: number) => deck.current!.scrubTo(at),
      end: () => {
        deck.current!.scrubEnd();
        if (wasPlaying.current) void play();
      },
    }),
    [chosen, mix, play],
  );

  /* ---------- taking and exporting ---------- */

  const take = useCallback(() => {
    if (!ran || !map) return;
    const found: Fit | Follow =
      map.followed && ran.follow
        ? { ...ran.follow, beats: map.beats }
        : { bpm: map.bpm, offset: map.offset, agreement: ran.fit?.agreement ?? 0 };
    mix.take(found, map.beats);
    say(`taken: ${map.bpm} bpm from ${map.offset.toFixed(3)} s${map.followed ? ', followed' : ', straight'} — the lanes have it, and it is kept beside the track`);
  }, [ran, map, mix, say]);

  const exportStems = useCallback(async () => {
    const bridge = openflow();
    if (!map || !song.stems) return;
    if (!bridge) {
      say('export needs the app around the page', true);
      return;
    }
    setExporting(true);
    say(`laying ${song.sources.length} stems at ${exportBpm}…`);
    try {
      const done = await bridge.export.stems({
        trackId: song.id,
        title: song.title,
        stems: song.stems,
        sources: song.sources,
        bpm: map.bpm,
        offset: map.offset,
        to: exportBpm,
      });
      say(`${done.files.length} stems, ${done.bars} bars (${done.seconds.toFixed(1)} s) at ${exportBpm}, speed ${done.speed.toFixed(5)} → ${done.where}`);
    } catch (error) {
      say(`export failed: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setExporting(false);
    }
  }, [map, song, exportBpm, say]);

  /* ---------- drawing ---------- */

  const inks = () => D.inksOf(box.current);
  const beats = map?.beats ?? null;
  const followTrace = map?.followed ? ran?.trace.follow : undefined;
  const scale = useMemo(() => D.tempoScale(followTrace, beats), [followTrace, beats]);
  const drumPeaks = mix.peaks.drums;
  const drumBuffer = mix.audioOf('drums');
  const kept = mix.grid;

  const drawRuler = useCallback((g: CanvasRenderingContext2D, v: View) => D.drawRuler(g, v, beats, inks()), [beats]);
  const drawWave = useCallback(
    (g: CanvasRenderingContext2D, v: View) => {
      const i = inks();
      if (spanOf(v) < 30 && drumBuffer) D.drawBuffer(g, v, drumBuffer, i.wave);
      else if (drumPeaks) D.drawPeaks(g, v, drumPeaks, (seconds * rate) / drumPeaks.length, rate, i.wave);
    },
    [drumBuffer, drumPeaks, seconds, rate],
  );
  const drawHits = useCallback(
    (g: CanvasRenderingContext2D, v: View) => {
      if (ran) D.drawTransients(g, v, ran.heard.transients, ran.heard.rate, inks());
    },
    [ran],
  );
  const drawBeats = useCallback(
    (g: CanvasRenderingContext2D, v: View) => {
      if (beats) D.drawBeats(g, v, beats, followTrace, inks());
    },
    [beats, followTrace],
  );
  const drawKept = useCallback(
    (g: CanvasRenderingContext2D, v: View) => {
      const i = inks();
      D.drawBeats(g, v, kept, undefined, i, i.kept, i.kept);
    },
    [kept],
  );
  const drawTempo = useCallback(
    (g: CanvasRenderingContext2D, v: View) => D.drawTempo(g, v, followTrace, beats, scale, inks()),
    [followTrace, beats, scale],
  );

  const tempoTrace = ran?.trace.tempo;
  const candidates = tempoTrace?.candidates ?? [];
  const [hoverCandidate, setHoverCandidate] = useState<number | null>(null);
  const drawAcf = useCallback(
    (g: CanvasRenderingContext2D, w: number, h: number, hover: number | null) => {
      let near: number | null = null;
      if (hover !== null && tempoTrace) {
        let gap = 14;
        candidates.forEach((c, i) => {
          const cx = D.candidateX(tempoTrace, c.bpm, w);
          if (cx !== null && Math.abs(cx - hover) < gap) {
            gap = Math.abs(cx - hover);
            near = i;
          }
        });
      }
      if (near !== hoverCandidate) setHoverCandidate(near);
      D.drawAcf(g, w, h, tempoTrace, near, inks());
    },
    [tempoTrace, candidates, hoverCandidate],
  );
  const [sweepText, setSweepText] = useState('');
  const drawSweep = useCallback(
    (g: CanvasRenderingContext2D, w: number, h: number) => {
      const text = D.drawSweep(g, w, h, candidates[candidate], inks());
      setSweepText((was) => (was === text ? was : text));
    },
    [candidates, candidate],
  );
  const [driftText, setDriftText] = useState('');
  const drawDrift = useCallback(
    (g: CanvasRenderingContext2D, w: number, h: number) => {
      const text = D.drawDrift(g, w, h, swept, inks());
      setDriftText((was) => (was === text ? was : text));
    },
    [swept],
  );

  /** What is under the pointer on the beats row. */
  const overBeats = useCallback(
    (ev: ScopePointer) => {
      if (ev.type !== 'move' || !map) return;
      const b = map.beats;
      const near = D.nearestBeat(b, ev.at * b.rate);
      if (near == null || Math.abs(xOf(ev.view, b.samples[near] / b.rate) - ev.x) > 6) {
        setUnder('');
        return;
      }
      const beat = b.first + near;
      const hit = followTrace?.beats?.[near]?.hit ?? null;
      const t = ran?.heard.transients[hit ?? -1];
      setUnder(
        [
          `beat ${beat}`,
          `bar ${Math.floor(beat / BEATS_PER_BAR) + 1}.${(((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) + 1}`,
          `${(b.samples[near] / b.rate).toFixed(4)} s`,
          hit != null && t ? `struck ${t.band} ${t.strength.toFixed(2)}` : followTrace ? 'interpolated' : 'ruled',
          `${tempoAt(b, beat).toFixed(3)} bpm`,
          `beatAt ${beatAt(b, b.samples[near]).toFixed(3)}`,
        ].join(' · '),
      );
    },
    [map, followTrace, ran],
  );

  const chosenTrace = tempoTrace?.chosen;
  const acfText = !ran
    ? ''
    : ran.fit === null
      ? `no fit: ${tempoTrace?.refused ?? 'refused'}`
      : chosenTrace
        ? [
            `fitted ${chosenTrace.fitted.toFixed(4)} → ${chosenTrace.bpm} bpm, agreement ${chosenTrace.agreement.toFixed(4)}, offset ${chosenTrace.offset.toFixed(4)} s`,
            `candidate ${chosenTrace.candidate}, line first ${chosenTrace.line.first.toFixed(4)} period ${chosenTrace.line.period.toFixed(6)}`,
            `votes ${chosenTrace.votes.map((n) => n.toFixed(2)).join(' / ')} → downbeat ${chosenTrace.downbeat}`,
          ].join('\n')
        : 'no chosen candidate in the trace';

  const facts: Fact[] = [
    { name: 'length', value: `${seconds.toFixed(1)} s @ ${rate}` },
    { name: 'seed', value: ran?.fit ? `${ran.fit.bpm} bpm off ${ran.fit.offset.toFixed(3)} s` : 'none', tone: ran && !ran.fit ? 'bad' : 'normal' },
    {
      name: 'follow',
      value: ran?.follow
        ? `${ran.follow.bpm} bpm · agreement ${ran.follow.agreement.toFixed(3)} · tracked ${ran.follow.tracked.toFixed(3)} · ${ran.follow.slowest.toFixed(2)}–${ran.follow.fastest.toFixed(2)}`
        : ran
          ? 'refused'
          : '—',
      tone: ran && !ran.follow ? 'quiet' : 'normal',
    },
    { name: 'map', value: beats ? `${beats.samples.length} beats · ${countOf(beats)} bars · first ${beats.first}${map?.followed ? '' : ' · straight'}` : 'none' },
    { name: 'heard', value: ran ? `${ran.heard.transients.length} transients` : '—' },
    { name: 'kept', value: `${mix.targetBpm.toFixed(3)} bpm off ${mix.offset.toFixed(3)} s${mix.beats ? ' · map' : ' · ruled'}`, tone: 'quiet' },
  ];

  const status = running ? (
    <Status tone="quiet">running…</Status>
  ) : (
    <Status tone={note.bad ? 'bad' : 'normal'}>{note.text}</Status>
  );

  return (
    <div ref={box} className="mf-analysis">
      <Harness title={editing ? "Beat grid" : "analysis"} subject={subject} status={status}>
        {editing && <p className="mf-grid-guidance">Listen with a click, compare the proposed beats with the saved grid, then <b>Apply grid</b>. Alt-click a hit or beat to set bar 1; use two beats to refine the tempo. Apply before leaving this view to keep your candidate.</p>}
        <Toolbar>
          <Group caption={editing ? "Algorithm" : "run"} title={editing ? undefined : SAYS[arm]}>
            <Select items={editing ? ARMS.map((a) => ARM_TITLES[a]) : [...ARMS]} index={ARMS.indexOf(arm)} onChange={(i) => setArm(ARMS[i])} width={editing ? 174 : 72} label={editing ? "Beat analysis algorithm" : "arm"} />
            <Segmented items={[...INPUTS]} index={INPUTS.indexOf(input)} onChange={(i) => setInput(INPUTS[i])} label="input" />
            <Button onPress={() => analyse(arm, input)} disabled={running || !drumsReady}>
              {editing ? 'Find beats' : 'run'}
            </Button>
          </Group>
          <Group caption="listen">
            <Transport playing={playing} onToggle={toggle} at={head ?? axis.cursor} latency={deck.current.latency()} disabled={!decoded} />
            {song.sources.map((s) => (
              <Toggle
                key={s}
                on={stems.includes(s)}
                onChange={(on) => setStems(on ? [...stems, s] : stems.filter((x) => x !== s))}
              >
                {s}
              </Toggle>
            ))}
            {BANDS.map(([band, name, title]) => (
              <Toggle
                key={band}
                on={bands.includes(band)}
                onChange={(on) => setBands(on ? [...bands, band] : bands.filter((x) => x !== band))}
                title={title}
              >
                {name}
              </Toggle>
            ))}
            <Toggle on={click} onChange={setClick} title="a click on every beat of the map, higher on the downbeat">
              click
            </Toggle>
          </Group>
          <Group caption="view">
            <Button onPress={axis.whole}>whole</Button>
            <Button onPress={() => axis.loop && axis.frame(axis.loop)} disabled={!axis.loop}>
              frame loop
            </Button>
            <Button onPress={() => axis.setLoop(null)} disabled={!axis.loop}>
              clear loop
            </Button>
          </Group>
          <Group caption="grid">
            <Button
              onPress={() => {
                setPicking(picking ? null : []);
                say(picking ? '' : 'pick the first beat on the beats row or the transients row');
              }}
              disabled={!map}
              title="click any two beats; the count between them is inferred and the tempo set from them"
            >
              {picking ? (picking.length ? 'pick the second beat' : 'pick the first beat') : 'two beats'}
            </Button>
            <Button onPress={() => sweep()} disabled={!map} title="hold 1.1.1 and walk the tempo a beat per minute either side">
              sweep
            </Button>
            <Button onPress={take} disabled={!map || !ran || running} title="Save this candidate as the track's beat grid">
              {editing ? 'Apply grid' : 'take'}
            </Button>
            {editing && <>
              <Button onPress={() => { setMap({ beats: mix.grid, bpm: tempoOf(mix.grid), offset: sampleOf(mix.grid, 0) / mix.grid.rate, followed: Boolean(mix.beats) }); say('Showing the saved grid again.'); }}>Use saved grid</Button>
              <Button onPress={() => { if (!map) return; const ruled = straight(map.bpm, map.offset, map.beats.rate, map.beats.length); if (ruled) replaceMap(ruled, map.bpm, map.offset); say('Straight-grid candidate. Apply grid to keep it.'); }} disabled={!map || running}>Straight grid</Button>
            </>}
          </Group>
          {!editing && <>
          <Group caption="export">
            <NumberField param={EXPORT_TEMPO} value={exportBpm} onChange={setExportBpm} showFill={false} width={64} label="export tempo" />
            <Button onPress={() => void exportStems()} disabled={!map || exporting} title="lay every stem straight from 1.1.1 at that tempo, padded to whole bars, into the export folder">
              export stems
            </Button>
          </Group>
          </>}
        </Toolbar>
        <Facts items={editing ? [{ name: "candidate tempo", value: map ? `${map.bpm.toFixed(2)} BPM` : "—" }, { name: "bar 1", value: map ? `${map.offset.toFixed(3)} s` : "—" }, { name: "beats", value: map?.beats.samples.length ?? "—" }] : facts} />
        {!editing && <AnalysisEvidence mix={mix} beats={beats} heard={ran?.heard ?? null} axis={axis} head={head ?? undefined} runLabel={ran ? `${ran.arm} on ${ran.input}${map?.followed ? ' · followed' : ' · edited/straight'}` : 'No run'} />}
        <Scope axis={axis} head={head ?? undefined} scrub={scrub}>
          <ScopeRow label="time" height={26} draw={drawRuler} ruler />
          <ScopeRow
            label="drums"
            height={64}
            draw={drawWave}
            legend={<Legend items={[{ kind: 'swatch', ink: 'var(--stem-drums)', label: 'stem' }]} />}
          />
          <ScopeRow
            label="heard"
            height={48}
            draw={drawHits}
            onPointer={pickOn(hitNear, 'kick or snare')}
            legend={
              <Legend
                items={[
                  { kind: 'swatch', ink: 'var(--red)', label: 'kick' },
                  { kind: 'swatch', ink: 'var(--amber)', label: 'snare' },
                  { kind: 'swatch', ink: 'var(--blue)', label: 'hats' },
                  { kind: 'text', ink: 'var(--caption)', text: '·', label: 'alt-click a hit to make it 1.1.1' },
                ]}
              />
            }
          />
          <ScopeRow
            label={editing ? "candidate" : "beats"}
            height={48}
            draw={drawBeats}
            onPointer={(ev) => {
              overBeats(ev);
              pickOn(beatNear, 'beat')(ev);
            }}
            legend={
              <Legend
                items={[
                  { kind: 'line', ink: 'var(--green)', label: 'beat' },
                  { kind: 'tall', ink: 'var(--fg)', label: 'downbeat' },
                  { kind: 'dashed', ink: 'var(--green)', label: 'interpolated' },
                  { kind: 'text', ink: 'var(--caption)', text: '·', label: 'alt-click a beat to make it 1.1.1' },
                ]}
              />
            }
          />
          <ScopeRow
            label={editing ? "saved" : "kept"}
            height={28}
            draw={drawKept}
            legend={<Legend items={[{ kind: 'line', ink: 'var(--preview)', label: 'the grid the app holds now' }]} />}
          />
          <ScopeRow
            label="tempo"
            height={56}
            draw={drawTempo}
            legend={
              <Legend
                items={[
                  { kind: 'swatch', ink: 'var(--amber)', label: 'followed' },
                  { kind: 'dot', ink: 'var(--green)', label: 'beat to beat' },
                  { kind: 'dot', ink: 'var(--blue)', label: 'stretch read' },
                  { kind: 'dot', ink: 'var(--idle)', label: 'unclear' },
                  { kind: 'dot', ink: 'var(--red)', label: 'fill' },
                ]}
              />
            }
          />
        </Scope>
        <Status tone="quiet" className="mf-analysis-under">
          {under || 'click the time row to seek · drag to pan · shift-drag for a loop · drag the head or alt-drag to scrub · scroll pans, shift-scroll zooms · space plays'}
        </Status>
        {!editing && <Shelf>
          <Plot title="autocorrelation" draw={drawAcf} caption={acfText} height={110} />
          <Plot
            title="phase sweep"
            actions={
              candidates.length ? (
                <Select
                  items={candidates.map((c, i) => `${i}: ${c.bpm.toFixed(2)} s${c.score.toFixed(2)}${c.rejected ? ` (${c.rejected})` : ''}`)}
                  index={Math.min(candidate, candidates.length - 1)}
                  onChange={setCandidate}
                  width={150}
                  label="candidate"
                />
              ) : undefined
            }
            draw={drawSweep}
            caption={sweepText}
            height={110}
          />
          <Plot
            title="tempo from 1.1.1"
            actions={
              <Button onPress={() => sweep()} disabled={!map}>
                sweep
              </Button>
            }
            draw={drawDrift}
            caption={driftText}
            height={110}
          />
        </Shelf>}
      </Harness>
    </div>
  );
}
