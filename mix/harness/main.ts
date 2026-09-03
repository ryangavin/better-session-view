/**
 * A throwaway page for looking at what the beat finding did to one track:
 * the drums, the transients it heard, the beats it laid down, the tempo it
 * followed, and the truth when there is one. Not part of the app.
 */
import { beatAt, tempoAt, countOf, BEATS_PER_BAR } from '../src/warp.ts';
import type { Beats } from '../src/warp.ts';
import type { IndexEntry, Report, Truth } from './types.ts';
import { Audition } from './audio.ts';
import type { Click } from './audio.ts';
import * as D from './draw.ts';
import { double, halve, insertBeat, moveBeat, removeBeat, rotateBar, seedTruth } from './edit.ts';
import { score } from './score.ts';

const REPORTS = './reports';
const KEY = 'mix-harness-track';
const ARM_KEY = 'mix-harness-arm';
/** The arm of the beat finding whose report is shown; empty is ours on the drums, the bare report. */
let arm = '';

const el = <T extends Element>(sel: string): T => document.querySelector<T>(sel)!;
const rowCanvas = (name: string): HTMLCanvasElement => el<HTMLCanvasElement>(`.row[data-row="${name}"] canvas`);

const deck = new Audition();

let entries: IndexEntry[] = [];
let report: Report | null = null;
let truth: Truth | null = null;
let scale: D.TempoScale = { lo: 60, hi: 200 };
let view = { from: 0, to: 60 };
let cursor = 0;
let loop: { from: number; to: number } | null = null;
let hoverCandidate: number | null = null;

let correcting = false;
/** The truth as it stands on disk, to go back to. */
let saved: Truth | null = null;
let undoStack: Truth[] = [];
let selected: number | null = null;
let drag: { beat: number; sample: number; snapped: boolean } | null = null;
let discardArmed = false;
let forgetArmed = false;

const seconds = (): number => report?.track.seconds ?? 60;
const rate = (): number => report?.track.rate ?? 44100;
const width = (): number => rowCanvas('ruler').clientWidth || 1;
/** The narrowest view, in seconds: twenty milliseconds across the width, which is single samples. */
const NARROWEST = 0.02;
const viewOf = (h: number): D.View => ({ from: view.from, to: view.to, width: width(), height: h });

function clampView(): void {
  const total = seconds();
  const span = Math.min(Math.max(view.to - view.from, NARROWEST), total);
  let from = Math.min(Math.max(view.from, 0), Math.max(0, total - span));
  if (span >= total) from = 0;
  view = { from, to: from + span };
}

/* ---------- loading ---------- */

/**
 * A JSON file, or null when it is not there. Vite's dev server answers a
 * missing path with the page's own HTML at 200, so the type is checked rather
 * than the status.
 */
async function json<T>(url: string): Promise<T | null> {
  const got = await fetch(url);
  if (!got.ok || !(got.headers.get('content-type') ?? '').includes('json')) return null;
  try {
    return (await got.json()) as T;
  } catch {
    return null;
  }
}

async function loadIndex(): Promise<void> {
  entries = (await json<IndexEntry[]>(`${REPORTS}/index.json`)) ?? [];
  const select = el<HTMLSelectElement>('#track');
  select.innerHTML = '';
  for (const e of entries) {
    const option = document.createElement('option');
    option.value = e.id;
    option.textContent = `${e.title} — ${e.seconds.toFixed(0)}s — ${e.bpm == null ? 'no fit' : `${e.bpm} bpm`}${e.truth ? ' — truth' : ''}`;
    select.append(option);
  }
  let want = entries[0]?.id;
  try {
    const kept = localStorage.getItem(KEY);
    if (kept && entries.some((e) => e.id === kept)) want = kept;
  } catch {
    // no storage; the first track will do
  }
  // The app's header links here with the open track; that wins over what was remembered.
  const asked = new URLSearchParams(location.search).get('track');
  if (asked) {
    if (entries.some((e) => e.id === asked)) want = asked;
    else el('#summary').textContent = `no report for ${asked} — run npm run warp:mix -- --report`;
  }
  try {
    arm = localStorage.getItem(ARM_KEY) ?? '';
  } catch {
    // no storage
  }
  if (want) {
    select.value = want;
    await loadTrack(want);
  }
}

/** The arms run on the track, for the select; the bare report first. */
function fillArms(entry: IndexEntry | undefined): void {
  const select = el<HTMLSelectElement>('#arm');
  select.innerHTML = '';
  const arms = ['', ...(entry?.arms ?? [])];
  for (const each of arms) {
    const option = document.createElement('option');
    option.value = each;
    option.textContent = each === '' ? 'drums.ours' : each;
    select.append(option);
  }
  if (!arms.includes(arm)) arm = '';
  select.value = arm;
  select.hidden = arms.length < 2;
}

async function loadTrack(id: string): Promise<void> {
  deck.stop();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // no storage
  }
  fillArms(entries.find((e) => e.id === id));
  report = await json<Report>(`${REPORTS}/${id}${arm ? `.${arm}` : ''}.json`);
  truth = await json<Truth>(`${REPORTS}/truth/${id}.json`);
  if (!report) throw new Error(`no report for ${id}${arm ? ` (${arm})` : ''}`);
  saved = truth ? structuredClone(truth) : null;
  correcting = false;
  undoStack = [];
  selected = null;
  drag = null;
  scale = D.tempoScale(report.trace.follow, report.beats);
  view = { from: 0, to: report.track.seconds };
  cursor = 0;
  loop = null;
  fillCandidates();
  chrome();
  summarise();
  showVerdict();
  render();
}

const stemUrl = (name: string): string => {
  const found = report?.track.stems.find((s) => s.endsWith(`/${name}.wav`));
  return `${REPORTS}/${found ?? `${report?.track.id}/${name}.wav`}`;
};

/* ---------- summary ---------- */

function summarise(): void {
  if (!report) return;
  const { track, fit, follow, beats, known } = report;
  const bits = [
    `<b>${track.title}</b>`,
    `${track.seconds.toFixed(1)}s @ ${track.rate}`,
    `seed ${fit ? `${fit.bpm} bpm off ${fit.offset.toFixed(3)}s` : 'none'}`,
    follow
      ? `follow ${follow.bpm} bpm, agreement ${follow.agreement.toFixed(3)}, tracked ${follow.tracked.toFixed(3)}, ${follow.slowest.toFixed(2)}–${follow.fastest.toFixed(2)}`
      : 'follow refused',
    beats ? `${beats.samples.length} beats, ${countOf(beats)} bars, first ${beats.first}` : 'no beats',
    known ? `known ${known.bpm} bpm${known.sections ? ` +${known.sections.length} sections` : ''}` : 'no known tempo',
    truth ? `truth ${truth.beats.samples.length} beats (${truth.source})` : 'no truth file',
    `${report.heard.transients.length} transients`,
  ];
  el('#summary').innerHTML = bits.join('  ·  ');
}

/* ---------- rows ---------- */

function render(): void {
  clampView();
  drawRows();
  drawOverlay();
  drawPanels();
  el('#span').textContent = `${view.from.toFixed(2)}–${view.to.toFixed(2)}s (${(view.to - view.from).toFixed(2)}s)`;
}

function drawRows(): void {
  const beats = report?.beats ?? null;

  const ruler = D.fit(rowCanvas('ruler'));
  D.drawRuler(ruler.g, { ...view, width: ruler.w, height: ruler.h }, beats);

  const wave = D.fit(rowCanvas('wave'));
  const wv = { ...view, width: wave.w, height: wave.h };
  if (report) {
    const close = view.to - view.from < 30;
    const buffer = deck.have.get(stemUrl('drums'));
    if (close && buffer) D.drawBuffer(wave.g, wv, buffer);
    else {
      D.drawPeaks(wave.g, wv, report.peaks.drums, report.peaks.per, report.track.rate);
      if (close) void deck.buffer(stemUrl('drums')).then(render).catch(() => undefined);
    }
  }

  const hits = D.fit(rowCanvas('hits'));
  if (report) D.drawTransients(hits.g, { ...view, width: hits.w, height: hits.h }, report.heard.transients, rate());

  const bt = D.fit(rowCanvas('beats'));
  if (beats) {
    bt.g.globalAlpha = correcting ? 0.4 : 1;
    D.drawBeats(bt.g, { ...view, width: bt.w, height: bt.h }, beats, report?.trace.follow);
    bt.g.globalAlpha = 1;
  } else if (report) note(bt.g, report.trace.follow?.refused ?? report.trace.tempo?.refused ?? 'no beats');

  const tm = D.fit(rowCanvas('tempo'));
  D.drawTempo(tm.g, { ...view, width: tm.w, height: tm.h }, report?.trace.follow, beats, scale);

  const tr = D.fit(rowCanvas('truth'));
  const tv = { ...view, width: tr.w, height: tr.h };
  if (report?.known && report.fit) D.drawKnownGrid(tr.g, tv, report.known, report.fit.offset, report.track.seconds);
  if (truth) D.drawTruth(tr.g, tv, truth, beats);
  else note(tr.g, report?.known ? 'no truth file — faint grid is the known tempo' : 'no truth file');
  drawCorrection(tr.g, tv);
}

/** What only the correcting hand needs: the region it may touch, the beat it holds, where a drag would land. */
function drawCorrection(g: CanvasRenderingContext2D, v: D.View): void {
  if (!correcting || !truth) return;
  const r = truth.beats.rate;

  g.fillStyle = 'rgba(11, 10, 9, 0.72)';
  const a = D.xOf(v, truth.region.from);
  const b = D.xOf(v, truth.region.to);
  if (a > 0) g.fillRect(0, 0, a, v.height);
  if (b < v.width) g.fillRect(b, 0, v.width - b, v.height);

  if (selected != null && truth.beats.samples[selected] != null) {
    const x = Math.round(D.xOf(v, truth.beats.samples[selected] / r)) + 0.5;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, v.height);
    g.stroke();
    g.lineWidth = 1;
    g.fillStyle = '#ffffff';
    g.font = '10px ui-monospace, monospace';
    g.fillText(`${selected}`, x + 3, v.height - 3);
  }

  if (drag) {
    const x = Math.round(D.xOf(v, drag.sample / r)) + 0.5;
    g.strokeStyle = drag.snapped ? '#ffd93d' : '#8b837a';
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, v.height);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = g.strokeStyle;
    g.font = '10px ui-monospace, monospace';
    g.fillText(`${(drag.sample / r).toFixed(4)}s${drag.snapped ? ' snap' : ''}`, x + 3, 11);
  }
}

function note(g: CanvasRenderingContext2D, text: string): void {
  g.fillStyle = '#8b837a';
  g.font = '11px ui-monospace, monospace';
  g.fillText(text, 70, 16);
}

function drawOverlay(): void {
  const canvas = el<HTMLCanvasElement>('#overlay');
  const rows = el<HTMLElement>('#rows');
  canvas.style.height = `${rows.clientHeight}px`;
  const { g, w, h } = D.fit(canvas);
  const v: D.View = { ...view, width: w, height: h };
  if (loop) {
    g.fillStyle = 'rgba(120, 180, 255, 0.10)';
    const a = D.xOf(v, loop.from);
    g.fillRect(a, 0, D.xOf(v, loop.to) - a, h);
    g.strokeStyle = '#78b4ff';
    g.beginPath();
    g.moveTo(a + 0.5, 0);
    g.lineTo(a + 0.5, h);
    g.moveTo(D.xOf(v, loop.to) + 0.5, 0);
    g.lineTo(D.xOf(v, loop.to) + 0.5, h);
    g.stroke();
  }
  const at = deck.position() ?? cursor;
  const x = Math.round(D.xOf(v, at)) + 0.5;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x, 0);
  g.lineTo(x, h);
  g.stroke();
}

/* ---------- fit panels ---------- */

function fillCandidates(): void {
  const select = el<HTMLSelectElement>('#cand');
  select.innerHTML = '';
  const cands = report?.trace.tempo?.candidates ?? [];
  cands.forEach((c, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${i}: ${c.bpm.toFixed(2)} bpm score ${c.score.toFixed(3)}${c.rejected ? ` (${c.rejected})` : ''}`;
    select.append(option);
  });
  const chosen = report?.trace.tempo?.chosen?.candidate ?? 0;
  if (cands.length) select.value = String(chosen);
}

function drawPanels(): void {
  const tempo = report?.trace.tempo;
  D.drawAcf(el<HTMLCanvasElement>('#acf'), tempo, hoverCandidate);

  const chosen = tempo?.chosen;
  el('#chosen').textContent = !report
    ? ''
    : report.fit === null
      ? `no fit: ${tempo?.refused ?? 'refused'}`
      : chosen
        ? [
            `fitted ${chosen.fitted.toFixed(4)} → reported ${chosen.bpm} bpm`,
            `agreement ${chosen.agreement.toFixed(4)}, offset ${chosen.offset.toFixed(4)}s`,
            `candidate ${chosen.candidate}, line first ${chosen.line.first.toFixed(4)} period ${chosen.line.period.toFixed(6)}`,
            `votes ${chosen.votes.map((n) => n.toFixed(2)).join(' / ')} → downbeat ${chosen.downbeat}`,
            report.follow === null ? `follow refused: ${report.trace.follow?.refused ?? '—'}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : 'no chosen candidate in the trace';

  const which = Number(el<HTMLSelectElement>('#cand').value || 0);
  el('#sweepText').textContent = D.drawSweep(el<HTMLCanvasElement>('#sweep'), tempo?.candidates?.[which]);
}

/* ---------- time interaction ---------- */

function zoom(factor: number, atX: number): void {
  const v = viewOf(1);
  const at = D.timeOf(v, atX);
  const span = Math.min(Math.max((view.to - view.from) * factor, NARROWEST), seconds());
  const share = (at - view.from) / (view.to - view.from);
  view = { from: at - share * span, to: at + (1 - share) * span };
  render();
}

function pan(bySeconds: number): void {
  view = { from: view.from + bySeconds, to: view.to + bySeconds };
  render();
}

function wireTime(): void {
  const rows = el<HTMLElement>('#rows');
  rows.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const x = ev.clientX - rows.getBoundingClientRect().left;
      // Scroll pans, on either axis, so a zoomed view moves fast; shift or
      // cmd/ctrl with it zooms about the cursor.
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
        zoom(Math.exp((Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX) * 0.002), x);
      } else {
        const by = (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY) / width();
        pan(by * (view.to - view.from));
      }
    },
    { passive: false },
  );

  const ruler = el<HTMLElement>('.row[data-row="ruler"]');
  ruler.addEventListener('pointerdown', (ev) => {
    ruler.setPointerCapture(ev.pointerId);
    const box = ruler.getBoundingClientRect();
    const startX = ev.clientX;
    const startView = { ...view };
    const startTime = D.timeOf(viewOf(1), ev.clientX - box.left);
    const selecting = ev.shiftKey;
    let moved = false;

    const move = (m: PointerEvent) => {
      const dx = m.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      if (selecting) {
        const to = D.timeOf(viewOf(1), m.clientX - box.left);
        loop = { from: Math.min(startTime, to), to: Math.max(startTime, to) };
        drawOverlay();
      } else if (moved) {
        const by = (dx / width()) * (startView.to - startView.from);
        view = { from: startView.from - by, to: startView.to - by };
        render();
      }
    };
    const up = (u: PointerEvent) => {
      ruler.removeEventListener('pointermove', move);
      ruler.removeEventListener('pointerup', up);
      if (!moved && !selecting) seek(D.timeOf(viewOf(1), u.clientX - box.left));
      if (selecting && loop && loop.to - loop.from < 0.05) loop = null;
      render();
    };
    ruler.addEventListener('pointermove', move);
    ruler.addEventListener('pointerup', up);
  });
}

function seek(at: number): void {
  cursor = Math.max(0, Math.min(at, seconds()));
  if (deck.playing) void play();
  else drawOverlay();
}

/* ---------- audition ---------- */

const chosenMap = (): Beats | null => {
  const want = el<HTMLInputElement>('input[name="map"]:checked').value;
  if (want === 'truth' && truth) {
    return { rate: truth.beats.rate, length: rate() * seconds(), first: 0, samples: truth.beats.samples };
  }
  return report?.beats ?? null;
};

function clicksOf(): Click[] {
  const beats = chosenMap();
  if (!beats) return [];
  const downs = new Set(truth?.beats.downbeat ?? []);
  const useTruth = el<HTMLInputElement>('input[name="map"]:checked').value === 'truth' && truth;
  return beats.samples.map((sample, i) => ({
    at: sample / beats.rate,
    down: useTruth ? downs.has(i) || downs.has(sample) : D.isDownbeat(beats, i),
  }));
}

async function play(): Promise<void> {
  if (!report) return;
  const stems = [
    ...[...document.querySelectorAll<HTMLInputElement>('.stem')].filter((box) => box.checked).map((box) => stemUrl(box.value)),
    ...[...document.querySelectorAll<HTMLInputElement>('.band')].filter((box) => box.checked).map((box) => `${stemUrl('drums')}#${box.value}`),
  ];
  deck.looping = loop !== null;
  const span = loop ?? { from: 0, to: report.track.seconds };
  el('#note').textContent = 'decoding…';
  try {
    await deck.start(stems, clicksOf(), span, loop ? loop.from : cursor);
    el('#note').textContent = '';
  } catch (err) {
    el('#note').textContent = String(err);
  }
  el('#play').textContent = 'stop';
}

function toggle(): void {
  if (deck.playing) {
    cursor = deck.position() ?? cursor;
    deck.stop();
    el('#play').textContent = 'play';
    drawOverlay();
  } else void play();
}

/* ---------- tooltips ---------- */

function wireTooltip(): void {
  const tip = el<HTMLElement>('#tip');
  const canvas = rowCanvas('beats');
  canvas.addEventListener('mousemove', (ev) => {
    const beats = report?.beats;
    if (!beats) return;
    const box = canvas.getBoundingClientRect();
    const v = viewOf(1);
    const near = D.nearestBeat(beats, D.timeOf(v, ev.clientX - box.left) * beats.rate);
    if (near == null || Math.abs(D.xOf(v, beats.samples[near] / beats.rate) - (ev.clientX - box.left)) > 6) {
      tip.hidden = true;
      return;
    }
    const sample = beats.samples[near];
    const hit = report?.trace.follow?.beats?.[near]?.hit ?? null;
    const t = report?.heard.transients[hit ?? -1];
    const beat = beats.first + near;
    tip.hidden = false;
    tip.style.left = `${ev.clientX + 12}px`;
    tip.style.top = `${ev.clientY + 12}px`;
    tip.textContent = [
      `beat ${beat}  (index ${near})`,
      `bar ${Math.floor(beat / BEATS_PER_BAR) + 1}.${(((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) + 1}`,
      `sample ${sample}  ${(sample / beats.rate).toFixed(4)}s`,
      hit != null && t ? `anchor: ${t.band} strength ${t.strength.toFixed(3)} level ${t.level.toFixed(3)}` : 'interpolated',
      `tempo ${tempoAt(beats, beat).toFixed(3)} bpm`,
      `beatAt ${beatAt(beats, sample).toFixed(3)}`,
    ].join('\n');
  });
  canvas.addEventListener('mouseleave', () => (tip.hidden = true));

  const acf = el<HTMLCanvasElement>('#acf');
  acf.addEventListener('mousemove', (ev) => {
    const cands = report?.trace.tempo?.candidates ?? [];
    const box = acf.getBoundingClientRect();
    const x = ev.clientX - box.left;
    let best: number | null = null;
    let bestGap = 14;
    const acfTrace = report?.trace.tempo?.acf;
    const frame = report?.trace.tempo?.frame ?? 0;
    if (!acfTrace || !frame) return;
    const bpms = acfTrace.values.map((_, i) => 60 / ((acfTrace.lo + i) * frame));
    const lo = Math.min(...bpms);
    const hi = Math.max(...bpms);
    cands.forEach((c, i) => {
      const cx = ((c.bpm - lo) / (hi - lo)) * (box.width - 40) + 32;
      if (Math.abs(cx - x) < bestGap) {
        bestGap = Math.abs(cx - x);
        best = i;
      }
    });
    if (best !== hoverCandidate) {
      hoverCandidate = best;
      drawPanels();
    }
  });
}

/* ---------- correcting ---------- */

/** The truth beat under a page x, or null: where an edit would start. */
function truthBeatAt(clientX: number): number | null {
  if (!truth) return null;
  const canvas = rowCanvas('truth');
  const box = canvas.getBoundingClientRect();
  const v = viewOf(1);
  let best: number | null = null;
  let gap = Infinity;
  truth.beats.samples.forEach((s, i) => {
    const d = Math.abs(D.xOf(v, s / truth!.beats.rate) - (clientX - box.left));
    if (d < gap && d < 8) {
      gap = d;
      best = i;
    }
  });
  return best;
}

/** How far a dragged beat reaches for a transient to land on, in seconds. */
const SNAP = 0.03;

/**
 * The transient a beat should land on, or the raw time when none is close.
 * A kick or a snare is worth more than a hi-hat here, so a low or mid hit wins
 * over a high one even when the high one is nearer.
 */
function snapAt(at: number, free: boolean): { at: number; snapped: boolean } {
  if (free || !report) return { at, snapped: false };
  let best: number | null = null;
  let bestGap = Infinity;
  let bestBand = 2;
  for (const t of report.heard.transients) {
    const gap = Math.abs(t.at - at);
    if (gap > SNAP) continue;
    const band = t.band === 'high' ? 1 : 0;
    if (band < bestBand || (band === bestBand && gap < bestGap)) {
      best = t.at;
      bestGap = gap;
      bestBand = band;
    }
  }
  return best == null ? { at, snapped: false } : { at: best, snapped: true };
}

const sampleAt = (at: number): number => Math.round(at * (truth?.beats.rate ?? rate()));

const auditingTruth = (): boolean => el<HTMLInputElement>('input[name="map"]:checked').value === 'truth';

/** Take a corrected truth, keeping the one it replaced for undo. */
function apply(next: Truth): void {
  if (!truth || next === truth) return;
  undoStack.push(structuredClone(truth));
  truth = next;
  afterEdit();
}

function afterEdit(): void {
  summarise();
  showVerdict();
  render();
  if (deck.playing && auditingTruth()) void play();
}

function undo(): void {
  const back = undoStack.pop();
  if (!back) return;
  truth = back;
  selected = null;
  drag = null;
  afterEdit();
}

/** The scorer's read on the truth as it stands, one line, never in the way of an edit. */
function showVerdict(): void {
  const box = el<HTMLElement>('#verdict');
  box.hidden = !correcting;
  if (!correcting || !report || !truth) return;
  try {
    const s = score(report, truth);
    const flags = [
      s.octave ? `octave ${s.octave}` : '',
      s.offBeat ? 'off-beat' : '',
      s.phase ? `phase ${s.phase > 0 ? '+' : ''}${s.phase}` : '',
    ].filter(Boolean);
    box.innerHTML = [
      `<b>${truth.beats.samples.length} true beats</b>`,
      `on ${s.counts.on}`,
      `shifted ${s.counts.shifted}`,
      `missed ${s.counts.missed}`,
      `spurious ${s.counts.spurious}`,
      `F ${s.fMeasure.toFixed(3)}`,
      `continuity ${s.continuity.toFixed(3)}`,
      flags.length ? flags.join(' + ') : 'no flags',
      `${truth.edits.length} edits`,
    ].join('  ·  ');
  } catch (error) {
    box.textContent = `scorer: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** The page's furniture for whichever mode it is in. */
function chrome(): void {
  document.body.classList.toggle('correcting', correcting);
  el<HTMLElement>('#editbar').hidden = !correcting;
  el<HTMLButtonElement>('#correct').classList.toggle('on', correcting);
  el<HTMLButtonElement>('#correct').textContent = correcting ? 'correcting' : 'correct';
  el<HTMLButtonElement>('#forget').hidden = saved === null;
}

function toggleCorrect(): void {
  if (correcting) {
    correcting = false;
    selected = null;
    drag = null;
    chrome();
    showVerdict();
    render();
    return;
  }
  if (!report) return;
  if (truth) loop = { ...truth.region };
  else if (!loop) {
    el('#note').textContent = 'pick a region first: shift-drag along the time row';
    return;
  } else truth = seedTruth(report, loop);
  el('#note').textContent = '';
  correcting = true;
  undoStack = [];
  selected = null;
  drag = null;
  deck.looping = loop !== null;
  el<HTMLInputElement>('input[name="map"][value="truth"]').checked = true;
  chrome();
  summarise();
  showVerdict();
  render();
  if (deck.playing) void play();
}

function say(text: string, bad = false): void {
  const note = el<HTMLElement>('#editNote');
  note.textContent = text;
  note.classList.toggle('bad', bad);
}

async function saveTruth(): Promise<void> {
  if (!truth || !report) return;
  try {
    const put = await fetch(`./truth/${report.track.id}.json`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(truth),
    });
    if (!put.ok) {
      say(`save failed: ${(await put.text()) || put.status}`, true);
      return;
    }
    saved = structuredClone(truth);
    chrome();
    say(`saved ${truth.beats.samples.length} beats, ${truth.edits.length} edits`);
  } catch (error) {
    say(`save failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

/**
 * Two clicks rather than a dialog: a browser driving the page cannot answer
 * a confirm(). The first click arms the button for three seconds; the second
 * does the thing. Returns whether the thing is to be done.
 */
function armed(button: HTMLButtonElement, isArmed: boolean, setArmed: (to: boolean) => void, label: string, ask: string): boolean {
  const disarm = () => {
    setArmed(false);
    button.classList.remove('danger');
    button.textContent = label;
  };
  if (!isArmed) {
    setArmed(true);
    button.classList.add('danger');
    button.textContent = ask;
    window.setTimeout(() => {
      if (button.classList.contains('danger')) disarm();
    }, 3000);
    return false;
  }
  disarm();
  return true;
}

function discard(): void {
  if (!armed(el('#discard'), discardArmed, (to) => (discardArmed = to), 'discard', 'really discard?')) return;
  truth = saved ? structuredClone(saved) : null;
  undoStack = [];
  selected = null;
  drag = null;
  if (!truth) correcting = false;
  else loop = { ...truth.region };
  chrome();
  summarise();
  showVerdict();
  render();
  say(saved ? 'back to the saved truth' : 'seeded truth thrown away');
}

/** The saved truth for the track deleted from disk, and the page back to the predicted map. */
async function forgetTruth(): Promise<void> {
  if (!report || !saved) return;
  if (!armed(el('#forget'), forgetArmed, (to) => (forgetArmed = to), 'forget truth', 'really forget?')) return;
  const id = report.track.id;
  try {
    const gone = await fetch(`./truth/${id}.json`, { method: 'DELETE' });
    if (!gone.ok) {
      el('#note').textContent = `forget failed: ${(await gone.text()) || gone.status}`;
      return;
    }
  } catch (error) {
    el('#note').textContent = `forget failed: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  truth = null;
  saved = null;
  correcting = false;
  undoStack = [];
  selected = null;
  drag = null;
  loop = null;
  deck.looping = false;
  const entry = entries.find((e) => e.id === id);
  if (entry) {
    entry.truth = false;
    const option = Array.from(el<HTMLSelectElement>('#track').options).find((o) => o.value === id);
    if (option) option.textContent = option.textContent?.replace(/ — truth$/, '') ?? '';
  }
  el<HTMLInputElement>('input[name="map"][value="predicted"]').checked = true;
  el('#note').textContent = 'truth forgotten';
  chrome();
  summarise();
  showVerdict();
  render();
}

function wireCorrection(): void {
  const canvas = rowCanvas('truth');

  canvas.addEventListener('pointerdown', (ev) => {
    if (!correcting || !truth) return;
    ev.preventDefault();
    const hit = truthBeatAt(ev.clientX);
    if (hit != null && ev.altKey) {
      apply(removeBeat(truth, hit));
      selected = null;
      render();
      return;
    }
    if (hit == null) {
      selected = null;
      render();
      return;
    }
    selected = hit;
    canvas.setPointerCapture(ev.pointerId);
    const startX = ev.clientX;
    let moved = false;

    const move = (m: PointerEvent) => {
      if (!truth) return;
      if (Math.abs(m.clientX - startX) > 2) moved = true;
      if (!moved) return;
      const at = D.timeOf(viewOf(1), m.clientX - canvas.getBoundingClientRect().left);
      const want = snapAt(at, m.altKey);
      drag = { beat: hit, sample: sampleAt(want.at), snapped: want.snapped };
      render();
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      const held = drag;
      drag = null;
      if (moved && held && truth) {
        apply(moveBeat(truth, hit, held.sample));
        selected = truth.beats.samples.indexOf(held.sample);
      }
      render();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  });

  canvas.addEventListener('dblclick', (ev) => {
    if (!correcting || !truth) return;
    if (truthBeatAt(ev.clientX) != null) return;
    const at = D.timeOf(viewOf(1), ev.clientX - canvas.getBoundingClientRect().left);
    const want = snapAt(at, ev.altKey);
    const sample = sampleAt(want.at);
    apply(insertBeat(truth, sample));
    selected = truth.beats.samples.indexOf(sample);
    render();
  });

  el('#correct').addEventListener('click', toggleCorrect);
  el('#barBack').addEventListener('click', () => truth && apply(rotateBar(truth, -1)));
  el('#barFwd').addEventListener('click', () => truth && apply(rotateBar(truth, 1)));
  el('#halve').addEventListener('click', () => truth && apply(halve(truth)));
  el('#double').addEventListener('click', () => truth && apply(double(truth)));
  el('#undo').addEventListener('click', undo);
  el('#save').addEventListener('click', () => void saveTruth());
  el('#discard').addEventListener('click', discard);
  el('#forget').addEventListener('click', () => void forgetTruth());
}

/** Keys that only mean something with a beat in hand. Returns whether the key was taken. */
function correctionKey(ev: KeyboardEvent): boolean {
  if (!correcting || !truth) return false;
  const meta = ev.metaKey || ev.ctrlKey;
  if (meta && ev.key.toLowerCase() === 'z') {
    undo();
    return true;
  }
  if (meta && ev.key.toLowerCase() === 's') {
    void saveTruth();
    return true;
  }
  if (meta) return false;
  if (ev.key === 'Escape') {
    selected = null;
    render();
    return true;
  }
  if (selected == null) return false;
  if (ev.key === 'Backspace' || ev.key === 'Delete') {
    apply(removeBeat(truth, selected));
    selected = null;
    render();
    return true;
  }
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return false;
  const rate = truth.beats.rate;
  const by = ev.altKey ? 1 : Math.max(1, Math.round(rate * (ev.shiftKey ? 0.01 : 0.001)));
  const to = truth.beats.samples[selected] + (ev.key === 'ArrowLeft' ? -by : by);
  apply(moveBeat(truth, selected, to));
  selected = truth.beats.samples.indexOf(to);
  render();
  return true;
}

/* ---------- wiring ---------- */

function wire(): void {
  el<HTMLSelectElement>('#track').addEventListener('change', (ev) => {
    void loadTrack((ev.target as HTMLSelectElement).value);
  });
  el<HTMLSelectElement>('#arm').addEventListener('change', (ev) => {
    arm = (ev.target as HTMLSelectElement).value;
    try {
      localStorage.setItem(ARM_KEY, arm);
    } catch {
      // no storage
    }
    if (report) void loadTrack(report.track.id);
  });
  el('#play').addEventListener('click', toggle);
  el('#clearLoop').addEventListener('click', () => {
    loop = null;
    deck.looping = false;
    render();
  });
  el('#whole').addEventListener('click', () => {
    view = { from: 0, to: seconds() };
    render();
  });
  el('#cand').addEventListener('change', drawPanels);
  for (const box of document.querySelectorAll<HTMLInputElement>('.stem, .band')) {
    box.addEventListener('change', () => {
      if (deck.playing) void play();
    });
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="map"]')) {
    radio.addEventListener('change', () => {
      if (deck.playing) void play();
    });
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    if (correctionKey(ev)) {
      ev.preventDefault();
      return;
    }
    if (ev.code === 'Space') {
      ev.preventDefault();
      toggle();
    }
  });
  window.addEventListener('resize', render);
  wireTime();
  wireTooltip();
  wireCorrection();

  const frame = () => {
    if (deck.playing) drawOverlay();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

wire();
void loadIndex().catch((err) => {
  el('#summary').textContent = String(err);
});
