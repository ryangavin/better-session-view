import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../src/controls/Button.tsx';
import { Toggle } from '../src/controls/Toggle.tsx';
import { Knob } from '../src/controls/Knob.tsx';
import { Slider } from '../src/controls/Slider.tsx';
import { NumberField } from '../src/controls/NumberField.tsx';
import { Select } from '../src/controls/Select.tsx';
import { Segmented } from '../src/controls/Segmented.tsx';
import { Meter } from '../src/controls/Meter.tsx';
import { Waveform } from '../src/wave/Waveform.tsx';
import { type Param } from '../src/param/param.ts';
import type { Experiment } from '../src/debug/Workspace.tsx';
import './play.css';
import { PlayThemePicker, PRESETS, color, deckColors, DEFAULT_VARIATION } from './PlayTheme.tsx';

const STEMS = ['Drums', 'Bass', 'Other', 'Vocals'];


const SECTIONS = ['Intro', 'Verse', 'Build', 'Drop', 'Break', 'Outro'];
const SONGS = [
  { title: 'After the rain', artist: 'North Arcade', bpm: 124, key: '8A' },
  { title: 'Soft machinery', artist: 'Parallel State', bpm: 126, key: '8A' },
  { title: 'Night swimming', artist: 'Low Season', bpm: 122, key: '9A' },
  { title: 'Only the echo', artist: 'Mira Sol', bpm: 124, key: '8B' },
];
const LEVEL: Param = { kind: 'float', min: 0, max: 100, defaultValue: 80, unit: 'percent' };
const TRIM: Param = { kind: 'float', min: -12, max: 12, defaultValue: 0, unit: 'decibel' };
const SEND: Param = { ...LEVEL, defaultValue: 0 };
const EQ: Param = { kind: 'float', min: -24, max: 12, defaultValue: 0, unit: 'decibel' };
const FILTER: Param = { kind: 'float', min: -100, max: 100, defaultValue: 0, unit: 'int' };
const TEMPO: Param = { kind: 'float', min: 80, max: 160, defaultValue: 124, unit: 'float' };
const CROSS: Param = { kind: 'float', min: -100, max: 100, defaultValue: 0, unit: 'int' };
const EFFECTS = ['Delay', 'Reverb', 'Echo', 'Chorus', 'Flanger'];
const EFFECTS_A = EFFECTS.map(effect => `A · ${effect}`);
const EFFECTS_B = EFFECTS.map(effect => `B · ${effect}`);
const ROUTE = ['A', 'Thru', 'B'];
// Stable, deterministic fixture silhouettes; these are deliberately not audio data.
const PEAKS = SONGS.map((_, deck) => STEMS.map((__, stem) => Array.from({ length: 384 }, (_, i) => {
  const envelope = (0.3 + 0.7 * Math.abs(Math.sin(i * 0.031 + deck))) *
    (0.2 + 0.8 * Math.abs(Math.sin(i * (0.61 + stem * 0.19) + deck * 2)));
  return { min: -envelope * 0.8, max: envelope };
})));
interface DeckState { full: boolean; fullSection: number; fullQueued: number | null; active: number[]; queued: (number | null)[]; levels: number[]; gain: number; trim: number; sendA: number; sendB: number; eq: number[]; filter: number; route: number; cue: boolean }
const initialDecks = (): DeckState[] => SONGS.map((_, i) => ({
  full: false, fullSection: 3, fullQueued: null, active: [3, 3, 3, 3], queued: [null, null, null, null], levels: [85, 78, 66, 82],
  gain: i < 2 ? 80 : 0, trim: 0, sendA: 0, sendB: 0, eq: [0, 0, 0], filter: 0, route: i % 2 ? 2 : 0, cue: false,
}));

/** Animate only the meter, keeping the launcher and controls off the frame render path. */
function PreviewMeter({ sample, label }: { sample(): number; label: string }) {
  const latest = useRef(sample);
  latest.current = sample;
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let level = 0;
    const draw = (now: number) => {
      const dt = Math.min(100, now - previous);
      previous = now;
      const target = Math.max(0, Math.min(1, latest.current()));
      level += (target - level) * (1 - Math.exp(-dt / (target > level ? 35 : 140)));
      if (target === 0 && level < 0.0001) level = 0;
      setValue(level);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <Meter ink="var(--play-signal)" width={14} name="" label={label} orientation="vertical" length={210} value={value} />;
}

function PlayCase() {
  const [theme, setTheme] = useState(PRESETS[0].colors);
  const [variation, setVariation] = useState(DEFAULT_VARIATION);
  const INKS = theme.slice(2, 6).map(color);
  const DECK_INKS = deckColors(theme, variation);
  useEffect(() => {
    const primary = color(theme[0]);
    document.body.style.setProperty('--amber', primary);
    document.body.style.setProperty('--amber-hover', color({ ...theme[0], l: Math.min(95, theme[0].l + 10) }));
    document.body.style.setProperty('--amber-muted', color({ ...theme[0], l: Math.max(25, theme[0].l - 25) }));
    return () => { for (const token of ['--amber', '--amber-hover', '--amber-muted']) document.body.style.removeProperty(token); };
  }, [theme]);
  const [decks, setDecks] = useState(initialDecks);
  const [running, setRunning] = useState(false);
  const [clock, setClock] = useState({ beat: 0, tick: 0 });
  const beat = clock.beat;
  const phase = useRef({ beat: 0, tick: 0 });
  const playheads = useRef<(HTMLSpanElement | null)[]>([]);
  const [loop, setLoop] = useState<{ start: number | null; end: number | null; enabled: boolean }>({ start: null, end: null, enabled: false });
  const [fxA, setFxA] = useState(0);
  const [fxB, setFxB] = useState(1);
  const [bpm, setBpm] = useState(124);
  const [cross, setCross] = useState(0);
  const [master, setMaster] = useState(80);
  const [masterTrim, setMasterTrim] = useState(0);
  const [masterFilter, setMasterFilter] = useState(0);
  const [masterSendA, setMasterSendA] = useState(0);
  const [masterSendB, setMasterSendB] = useState(0);
  const [masterEq, setMasterEq] = useState([0, 0, 0]);
  const [quantized, setQuantized] = useState(true);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = performance.now();
    const advance = (now: number) => {
      const elapsed = Math.min(100, now - previous) * bpm / 60000;
      previous = now;
      phase.current.tick += elapsed;
      phase.current.beat += elapsed;
      if (loop.enabled && loop.start !== null && loop.end !== null && phase.current.beat >= loop.end) {
        phase.current.beat = loop.start + (phase.current.beat - loop.start) % (loop.end - loop.start);
      }
      const position = `${(phase.current.beat % 128) / 128 * 100}%`;
      playheads.current.forEach(head => { if (head) head.style.left = position; });
      const next = { tick: Math.floor(phase.current.tick), beat: Math.floor(phase.current.beat) };
      setClock(c => c.tick === next.tick && c.beat === next.beat ? c : next);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [running, bpm, loop]);
  useEffect(() => {
    if (clock.tick % 4 !== 0) return;
    setDecks(all => all.map(d => ({ ...d, fullSection: d.fullQueued ?? d.fullSection, fullQueued: null, active: d.active.map((a, i) => d.queued[i] ?? a), queued: [null, null, null, null] })));
  }, [clock.tick]);
  const update = (deck: number, patch: Partial<DeckState>) => setDecks(all => all.map((d, i) => i === deck ? { ...d, ...patch } : d));
  const launch = (deck: number, section: number, stem?: number) => setDecks(all => all.map((d, i) => {
    if (i !== deck) return d;
    const waiting = running && quantized;
    if (d.full) return { ...d, fullSection: waiting ? d.fullSection : section, fullQueued: waiting ? section : null };
    return { ...d,
      active: d.active.map((a, s) => !waiting && (stem === undefined || s === stem) ? section : a),
      queued: d.queued.map((q, s) => stem === undefined || s === stem ? (waiting ? section : null) : q),
    };
  }));
  const stopAll = () => { setRunning(false); phase.current = { beat: 0, tick: 0 }; setClock({ beat: 0, tick: 0 }); setLoop({ start: null, end: null, enabled: false }); setDecks(all => all.map(d => ({ ...d, fullSection: -1, fullQueued: null, active: [-1, -1, -1, -1], queued: [null, null, null, null] }))); };
  const deckLevel = (d: DeckState) => {
    const weight = d.route === 1 ? 1 : d.route === 0 ? Math.min(1, (100 - cross) / 100) : Math.min(1, (100 + cross) / 100);
    return running ? (d.full ? (d.fullSection < 0 ? 0 : 0.8) : d.levels.reduce((sum, v, s) => sum + (d.active[s] < 0 ? 0 : v / 400), 0)) * 10 ** (d.trim / 20) * d.gain / 100 * weight * (0.68 + 0.2 * Math.exp(-5 * (phase.current.beat % 1)) + 0.05 * Math.sin(phase.current.beat * 7.3)) : 0;
  };
  const masterStrip = <div className="play-master-strip" aria-label="Master mixer">
    <b className="play-master-title">MASTER</b>
      <div className="play-actions">
        <div className="play-run-stop"><Toggle on={running} onChange={setRunning} width={62}>{running ? 'Ⅱ Pause' : '▶ Run'}</Toggle>
        <Button onPress={stopAll} width={62}>■ Stop</Button></div>
        <div className="play-timing" role="group" aria-label="Tempo and launch timing"><NumberField name="" label="BPM" showFill={false} width={62} title="Tempo in BPM" param={TEMPO} value={bpm} onChange={setBpm} />
        <Toggle label="Quantize launches to next bar" title="Launch timing: next bar or immediate" on={quantized} onChange={value => { setQuantized(value); if (!value) setDecks(all => all.map(d => ({ ...d, fullSection: d.fullQueued ?? d.fullSection, fullQueued: null, active: d.active.map((a, i) => d.queued[i] ?? a), queued: [null, null, null, null] }))); }} width={62}>{quantized ? '1 bar' : 'Now'}</Toggle></div>
        <div className="play-fx-pickers">
          <Select name="" label="FX A effect" items={EFFECTS_A} index={fxA} onChange={setFxA} width={126} />
          <Select name="" label="FX B effect" items={EFFECTS_B} index={fxB} onChange={setFxB} width={126} />
        </div>
        <div className="play-loop-controls" role="group" aria-label="Global loop">
          <Button width={62} label="Global loop in" title="Mark loop start at the current beat" onPress={() => setLoop({ start: beat, end: null, enabled: false })}>In</Button>
          <Button width={62} label="Global loop out" disabled={loop.start === null || beat <= loop.start} title="Mark loop end and engage the loop" onPress={() => setLoop(l => ({ ...l, end: beat, enabled: true }))}>Out</Button>
          <Toggle width={126} label="Global loop enabled" disabled={loop.end === null} on={loop.enabled} onChange={enabled => { setLoop(l => ({ ...l, enabled })); if (enabled && loop.start !== null) { phase.current.beat = loop.start; setClock(c => ({ ...c, beat: loop.start! })); } }}>{loop.enabled ? 'Exit loop' : loop.end === null ? (loop.start === null ? 'Loop' : 'Set Out…') : 'Reloop'}</Toggle>
        </div>
        <span className="play-clock">{String(Math.floor(beat / 4) + 1).padStart(3, '0')}<b>.{beat % 4 + 1}</b></span>
      </div>

    <div className="play-effects">
      <Knob ink="var(--amber)" name="FX A" label="Master effects send A" param={SEND} value={masterSendA} onChange={setMasterSendA} />
      <Knob ink="var(--amber)" name="Filter" label="Master filter" param={FILTER} value={masterFilter} onChange={setMasterFilter} />
      <Knob ink="var(--amber)" name="FX B" label="Master effects send B" param={SEND} value={masterSendB} onChange={setMasterSendB} />
    </div>
    <div className="play-channel play-master-channel">

      <div className="play-level-stack">
        <div className="play-channel-fader"><Slider name="" label="Master level" param={LEVEL} value={master} onChange={setMaster} length={210} /><PreviewMeter label="Master output" sample={() => Math.min(1, decks.reduce((sum, d) => sum + deckLevel(d), 0) * 10 ** (masterTrim / 20) * master / 100)} /></div>
      </div>
      <div className="play-eq-stack play-master-eq"><Knob className="play-trim" ink="var(--amber)" name="Trim" label="Master trim" param={TRIM} value={masterTrim} onChange={setMasterTrim} />{['High', 'Mid', 'Low'].map((name, i) => <Knob key={name} name={name} label={`Master ${name}`} param={EQ} origin="center" value={masterEq[i]} onChange={value => setMasterEq(all => all.map((v, e) => e === i ? value : v))} />)}</div>
    </div>
    <div className="play-master-cross">
    <Slider name="" label="Crossfader" showValue={false} param={CROSS} value={cross} onChange={setCross} orientation="horizontal" length={126} display={cross === 0 ? 'Center' : `${Math.abs(cross)} ${cross < 0 ? 'A' : 'B'}`} />
    </div>
  </div>;
  return <div className="play-example" style={{ '--play-signal': color(theme[1]) } as CSSProperties}>
    <PlayThemePicker theme={theme} onChange={setTheme} variation={variation} onVariation={setVariation} />
    <div className="play-timeline" aria-label="Four decks aligned to a shared 32-bar preview">
      <div className="play-wave-row play-ruler"><span title="Four aligned decks · 32 bars · global loop markers">DECKS · BARS</span><div className="play-bar-labels">{Array.from({ length: 8 }, (_, i) => <span key={i}>{Math.floor(beat / 128) * 32 + i * 4 + 1}</span>)}</div></div>
      {SONGS.map((song, index) => <div className="play-wave-row" style={{ '--deck-ink': DECK_INKS[index] } as CSSProperties} key={song.title}>
        <div className="play-wave-label"><b>{'ABCD'[index]}</b><span>{song.title}</span></div>
        <div className="play-wave-lane">
          <Waveform peaks={PEAKS[index][0]} ink={`color-mix(in srgb, ${DECK_INKS[index]} ${variation.strength}%, #9ca3ad)`} height={48} label={`Deck ${index + 1} illustrative waveform on the shared beat grid`} />
          {loop.start !== null && <div className="play-loop-region" data-enabled={loop.enabled} style={{ left: `${Math.max(0, loop.start - Math.floor(beat / 128) * 128) / 128 * 100}%`, width: `${Math.max(0, Math.min(128, (loop.end ?? loop.start) - Math.floor(beat / 128) * 128) - Math.max(0, loop.start - Math.floor(beat / 128) * 128)) / 128 * 100}%`, '--loop-ink': 'var(--amber)' } as CSSProperties}><span>{loop.end === null ? 'IN' : `↻ ${loop.end - loop.start} beats`}</span></div>}
          <span className="play-wave-grid" />
          <span ref={node => { playheads.current[index] = node; }} className="play-playhead" style={{ left: `${(phase.current.beat % 128) / 128 * 100}%` }} />
        </div>
      </div>)}
    </div>
    <div className="play-scroll"><div className="play-decks">
      {decks.map((d, index) => <Fragment key={index}><div className="play-deck" style={{ '--deck-ink': DECK_INKS[index] } as CSSProperties}>
        <div className="play-track"><b className="play-letter">{'ABCD'[index]}</b><div><h3>{SONGS[index].title}</h3><p>{SONGS[index].artist}</p></div><span>{SONGS[index].bpm} BPM<br />{SONGS[index].key}</span></div>

        <div className="play-performance">
          <div className="play-grid" data-full={d.full}>
          <span className="play-axis">SECTION</span>{STEMS.map((s, i) => <span className="play-stem-name" style={{ color: INKS[i] }} key={s}>{s}</span>)}
          {SECTIONS.map((section, row) => <div className="play-launch-row" key={section}>
            {d.full ? <Toggle width={44} on={d.fullSection === row} label={`Deck ${index + 1}: launch ${section} full mix${d.fullQueued === row ? ', queued' : ''}`} onChange={() => launch(index, row)}>{section}</Toggle> : <Button width={44} label={`Deck ${index + 1}: launch ${section} all stems`} title="Launch this section on all four stems" onPress={() => launch(index, row)}>{section}</Button>}
            {STEMS.map((stem, s) => {
              const active = d.active[s] === row, queued = d.queued[s] === row;
              return <div className="play-cell" key={stem} data-active={active} data-queued={queued} style={{ '--stem-ink': INKS[s] } as CSSProperties}>
                <Toggle disabled={d.full} on={active} ink={INKS[s]} width={34} label={`Deck ${index + 1}: ${section} ${stem}${queued ? ', queued' : active ? ', selected' : ''}`} onChange={() => launch(index, row, s)}>{queued ? '◷' : active ? '▶' : '▷'}</Toggle>
              </div>;
            })}
          </div>)}
          <Button width={44} label={`Deck ${index + 1}: stop all stems`} onPress={() => launch(index, -1)}>{(d.full ? d.fullQueued === -1 : d.queued.every(section => section === -1)) ? '◷ Stop' : 'Stop'}</Button>{STEMS.map((s, i) => <Button disabled={d.full} key={s} label={`Deck ${index + 1}: stop ${s}`} width={34} onPress={() => launch(index, -1, i)}>■</Button>)}
        </div>
        </div>
        <div className="play-effects">
          <Knob ink="var(--amber)" name="FX A" label={`Deck ${index + 1} effects send A`} param={SEND} value={d.sendA} onChange={sendA => update(index, { sendA })} />
          <Knob ink="var(--amber)" name="Filter" label={`Deck ${index + 1} filter`} param={FILTER} value={d.filter} onChange={filter => update(index, { filter })} />
          <Knob ink="var(--amber)" name="FX B" label={`Deck ${index + 1} effects send B`} param={SEND} value={d.sendB} onChange={sendB => update(index, { sendB })} />
        </div>
        <div className="play-channel">
          <div className="play-eq-stack play-stem-levels" data-full={d.full}>
            {STEMS.map((stem, i) => <Knob key={stem} disabled={d.full} name={stem} label={`Deck ${index + 1} ${stem} level`} param={LEVEL} value={d.levels[i]} onChange={value => update(index, { levels: d.levels.map((v, s) => s === i ? value : v) })} ink={INKS[i]} />)}
          </div>
          <div className="play-level-stack">
          <div className="play-channel-fader"><Slider name="" label={`Deck ${index + 1} level`} param={LEVEL} value={d.gain} onChange={gain => update(index, { gain })} length={210} />
          <PreviewMeter label={`Deck ${index + 1} output`} sample={() => deckLevel(d)} /></div></div>
          <div className="play-eq-stack">
            <Knob className="play-trim" ink="var(--amber)" name="Trim" label={`Deck ${index + 1} trim`} param={TRIM} value={d.trim} onChange={trim => update(index, { trim })} />
            {['High', 'Mid', 'Low'].map((name, e) => <Knob key={name} name={name} label={`Deck ${index + 1} ${name}`} param={EQ} origin="center" value={d.eq[e]} onChange={v => update(index, { eq: d.eq.map((a, i) => i === e ? v : a) })} />)}
          </div>
        </div>
        <div className="play-route"><Toggle on={d.cue} onChange={cue => update(index, { cue })} width={45} label={`Deck ${index + 1} headphone cue`}>Cue</Toggle><Segmented name="" label={`Deck ${index + 1} crossfade assignment`} items={ROUTE} index={d.route} onChange={route => update(index, { route })} /><Toggle on={d.full} width={44} label={`Deck ${index + 1} original full mix`} title="Use the original unseparated track instead of stems" onChange={full => update(index, { full, ...(full ? { fullSection: d.active.find(section => section >= 0) ?? -1, fullQueued: null } : {}) })}>Full</Toggle></div>
      </div>{index === 1 && masterStrip}</Fragment>)}
    </div></div>

  </div>;
}

export const PLAY_TABS: readonly Experiment<null>[] = [{ id: 'four-decks', title: 'Four-deck mixer', description: '', component: PlayCase }];
