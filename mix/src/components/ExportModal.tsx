import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { laneOrder, stemOf } from '../mock.ts';
import { openflow, type ExportProgress } from '../openflow.ts';
import { folderOf } from '../exportNames.ts';
import { OFFERED, everyText, finerOf, loosest, offeredOf, pinnedOf, worstLineOf, type Every } from '../pinned.ts';
import { barText, lengthText } from '../slices.ts';
import type { Mix } from '../state.ts';
import { BEATS_PER_BAR, bpmText, tempoBetween } from '../warp.ts';
import './ExportModal.css';

/**
 * What is about to be written, and the last chance to change it.
 *
 * Two questions, in the order you actually answer them: *what shape* is coming
 * out, and then *which parts of the track go in it*. The shape comes first
 * because it decides what the rest of the sheet is even asking — a folder of
 * stems is a list of files, a clip pack is a Session grid — and a sheet that
 * asked about slices before you had said which of the two you wanted was
 * asking about the wrong one half the time.
 *
 * **The pack is here and greyed rather than absent.** It is the thing this app
 * is for; leaving it out until it works would make the export sheet look
 * finished when it is a third of the way there, and would give a person no
 * reason to look again. Greyed and unpickable is the whole of how it says so —
 * a badge beside the name had to be fitted between the name and the line it
 * describes, and it pushed that line onto a second row. What it was saying
 * belongs in the tooltip, where the answer to *why can't I press this* is.
 *
 * **Export writes the stems laid straight.** `bridge.export.stems` hands the
 * main process the grid — the measured tempo and 1.1.1 — and the whole tempo
 * to lay the files at; `straighten.ts` varispeeds the record by the fraction
 * between and pads to whole bars, so the folder drops into Live like a loop
 * off a pack. The full track is not summed yet, and the pack is still to come.
 *
 * **Where there is a beat map, the record is pinned to the grid, and the one
 * choice on the dialog that changes the sound is how long a loop the files
 * are for.** *Loops of* 4, 8 or 16 bars: the record is pinned at every line
 * a loop of that length would start on, counted from 1.1.1 as Live's global
 * quantization counts, and at every section cut, and between those pins it
 * is left exactly as it was played at one speed — `pinned.ts`. A shorter loop
 * pins more often. Or *sections*: pinned at the cuts alone, so a twenty-four
 * bar section lands its first and last bar on the grid and keeps every push
 * and pull between them, which is the whole point of a section. The default
 * is measured — `loosest` — the sparsest pinning whose bar lines all land
 * within ten milliseconds, offered when it is one of the four and eight bars
 * otherwise; the sentence beside the control says how far the finer lines
 * are off, so someone choosing 16 or sections is told what 4 would cost
 * them, in the words a musician would use rather than a percentage. Every
 * bar and per beat exist for the stretcher, the tests and the harness, and
 * are not offered here. The choice is the
 * window's rather than the dialog's, so a loop under warp plays exactly what
 * the export will write; it is not written beside the track, because how
 * tightly to pin is a question about what the files are for, and the next
 * export may be for something else.
 *
 * **The full track is greyed like the pack.** It was a pick that counted
 * toward the files and was never sent, which is a sheet promising one more
 * file than it writes.
 *
 * **Export sits on the same line as where it is going**, at the end of it,
 * because those two are one sentence: *this much audio, to there*. A row of
 * buttons along the bottom would have separated the verb from its object by the
 * height of the sheet, and the other button on it would have been a Cancel
 * saying exactly what the × in the title bar says.
 *
 * **Where it goes is picked, not typed.** The line at the bottom is the real
 * folder the main process would write into — `destination.ts` — and Change
 * opens the OS dialog. A text field would have been the page naming a path,
 * which is the one thing `preload.ts` refuses to let it do, and it would also
 * have been a person spelling out somewhere that may not exist. Outside a real
 * window there is no dialog to open, so it says the default and the button is
 * dead rather than lying.
 *
 * **Sections are each laid at their own tempo.** A record that runs at 128
 * and then at 140 is not a record at 135, and laid there neither half loops
 * in Live at the tempo on the file. Cut into sections, each is laid at the
 * whole number nearest its own beats — the least warp there is on a steady
 * section — and the list shows that tempo beside each, the line above says
 * the range, and the files and the folder carry it. The list of slices is
 * the same list the pack will use and the same one the ruler draws, which is
 * why naming them is worth doing before either: a folder of sections named
 * Part 3 is a folder you have to listen to to sort out.
 */

type Target = 'stems' | 'pack';

/** One selectable line: the target above, a stem below, the same shape for both. */
function Pick({
  on,
  onPick,
  name,
  blurb,
  ink,
  soon = false,
}: {
  on: boolean;
  onPick(): void;
  name: string;
  blurb?: string;
  ink?: string;
  /** Not built yet: greyed, unpickable, and it says why when you hover it. */
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      className="mf-pick"
      data-on={on || undefined}
      aria-pressed={on}
      disabled={soon}
      title={soon ? 'Coming soon' : undefined}
      onClick={onPick}
      style={(ink ? { '--mf-pick-ink': ink } : {}) as CSSProperties}
    >
      <span className="mf-pick-mark" />
      <span className="mf-pick-name">{name}</span>
      {blurb && <span className="mf-pick-blurb">{blurb}</span>}
    </button>
  );
}

export function ExportModal({ mix }: { mix: Mix }) {
  const close = () => mix.setExporting(false);
  const sources = laneOrder(mix.song?.sources ?? []);
  const [target, setTarget] = useState<Target>('stems');
  const [chosen, setChosen] = useState<string[]>(sources);
  const [sliced, setSliced] = useState(false);
  const [where, setWhere] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [wrote, setWrote] = useState<string | null>(null);
  const bridge = openflow();

  useEffect(() => {
    let live = true;
    void bridge?.destination.read().then((at) => {
      if (live) setWhere(at);
    });
    return () => {
      live = false;
    };
  }, [bridge]);

  // The tempo the files are laid at: the whole number nearest the grid's, so
  // the name on the file is the tempo Live reads, and the record is varisped
  // by the fraction between — see `straighten.ts`.
  const laidAt = Math.round(mix.targetBpm);

  // How the record is pinned to that grid, where there is a map to pin: the
  // sections always, and between them as densely as was measured to be
  // needed unless the sheet has been told otherwise.
  const cuts = useMemo(() => mix.slices.map((slice) => slice.bar), [mix.slices]);
  // Cut into sections with a map, each section is laid at its own tempo —
  // `electron/export.ts` — and this is the same reading, so the list and
  // the folder name say what the files will say.
  const tempos = useMemo(
    () =>
      sliced && mix.beats
        ? mix.slices.map((slice, i) =>
            Math.round(tempoBetween(mix.grid, slice.bar * BEATS_PER_BAR, (mix.slices[i + 1]?.bar ?? mix.bars) * BEATS_PER_BAR)),
          )
        : null,
    [sliced, mix.beats, mix.grid, mix.slices, mix.bars],
  );
  const lowest = tempos ? Math.min(...tempos) : laidAt;
  const highest = tempos ? Math.max(...tempos) : laidAt;
  const spread = lowest !== highest;
  const rangeText = spread ? `${lowest}–${highest}` : String(laidAt);
  const measured = useMemo(
    () => (mix.beats ? loosest(mix.grid, laidAt, cuts) : null),
    [mix.beats, mix.grid, laidAt, cuts],
  );
  const picked = mix.pinEvery;
  const every: Every = picked ?? (mix.linkAudio.enabled ? 4 : measured ? offeredOf(measured.every) : 8);
  const offered = offeredOf(every);
  // The finer lines are what a shorter loop would want: the bar lines under
  // a loop of four, the four-bar lines above it and under the sections.
  const finer = finerOf(offered);
  const worst = useMemo(
    () => (mix.beats ? worstLineOf(mix.grid, pinnedOf(mix.grid, laidAt, cuts, every), finer) : 0),
    [mix.beats, mix.grid, laidAt, cuts, every, finer],
  );
  const line = finer === 1 ? 'bar line' : `${finer}-bar line`;
  // The control beside it already says how often the record is pinned; the
  // sentence says what the finer lines will cost.
  const pinSays = !mix.beats
    ? ''
    : worst < 0.0005
      ? `every ${line} on the grid`
      : `the worst ${line} ${(worst * 1000).toFixed(worst < 0.01 ? 1 : 0)} ms off`;
  if (!mix.song) return null;
  const song = mix.song;
  const at = `${where ?? '~/Music/mixflow'}/${folderOf(song.title, lowest, highest)}/`;
  const sections = sliced ? mix.slices.length : 1;
  const files = chosen.length * sections;
  const parts = [
    chosen.length ? `${chosen.length} stem${chosen.length === 1 ? '' : 's'}` : '',
    sections > 1 ? `× ${sections} sections` : '',
  ].filter(Boolean);

  const facts: [string, string][] = [
    ['track', song.artist ? `${song.title} · ${song.artist}` : song.title],
    ['writes', files ? `${files} wav · ${parts.join(' + ')}` : 'nothing chosen'],
    ['tempo', spread ? `${rangeText} BPM · a tempo per section` : `${bpmText(mix.targetBpm)} BPM${mix.bpmAuto ? ' · fitted' : ' · set by hand'}`],
    ['length', `${mix.bars} bars · ${Math.round(mix.seconds)}s`],
  ];

  const flip = (id: string) =>
    setChosen((was) => (was.includes(id) ? was.filter((s) => s !== id) : [...was, id]));

  const write = async () => {
    if (!bridge || !song.stems || chosen.length === 0) return;
    setWriting(true);
    setWrote(null);
    setProgress(null);
    const off = bridge.export.onProgress(setProgress);
    try {
      const done = await bridge.export.stems({
        trackId: song.id,
        title: song.title,
        stems: song.stems,
        sources: sources.filter((id) => chosen.includes(id)),
        slices: sliced ? mix.slices : undefined,
        // The map where there is one, pinned to the grid at the sections and
        // as densely between them as the sheet says — `straighten.ts`. Null
        // is a grid that really is a straight line, and the constant speed
        // is right for it.
        beats: mix.beats ?? undefined,
        every: mix.beats ? every : undefined,
        cuts,
        bpm: mix.targetBpm,
        offset: mix.offset,
        to: laidAt,
      });
      const cut = done.parts > 1 ? ` · ${done.parts} sections` : '';
      const pinned = done.every
        ? ` · pinned ${everyText(done.every)}${done.worst && done.worst >= 0.0005 ? `, worst ${line} ${(done.worst * 1000).toFixed(0)} ms off` : ''}`
        : '';
      const laid = done.tempos && Math.min(...done.tempos) !== Math.max(...done.tempos) ? ` · laid at ${Math.min(...done.tempos)}–${Math.max(...done.tempos)}` : '';
      setWrote(`${done.files.length} wav · ${done.bars} bars${cut}${laid}${pinned} · ${done.where}`);
    } catch (error) {
      setWrote(`failed — ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      off();
      setWriting(false);
      setProgress(null);
    }
  };

  return (
    <Modal
      title="export"
      label="Export"
      className="mf-export"
      onClose={close}
    >
      <div className="mf-export-picks">
        <Pick
          on={target === 'stems'}
          onPick={() => setTarget('stems')}
          name="stems"
          blurb="One wav per stem, in a folder named after the track"
        />
        <Pick
          on={target === 'pack'}
          onPick={() => setTarget('pack')}
          name="ableton song pack"
          blurb="A Session row per slice, a track per stem, every clip warped"
          soon
        />
      </div>

      <div className="mf-export-what">
        <p className="mf-cap">what goes in</p>
        <div className="mf-export-picks">
          {sources.map((id) => {
            const stem = stemOf(id);
            return (
              <Pick
                key={id}
                on={chosen.includes(id)}
                onPick={() => flip(id)}
                name={stem.name}
                ink={stem.ink}
              />
            );
          })}
          <Pick
            on={false}
            onPick={() => {}}
            name="Full track"
            blurb="The stems summed back, at the levels on the lanes"
            soon
          />
        </div>
      </div>

      <div className="mf-export-picks">
        <Pick
          on
          onPick={() => {}}
          name={spread ? 'Laid straight, each section at its own tempo' : `Laid straight at ${laidAt} BPM`}
          blurb={
            spread
              ? `${rangeText} BPM · from 1.1.1, whole bars, every section pinned to its bars`
              : mix.beats
                ? `From 1.1.1, whole bars, every section pinned to its bars`
                : `From 1.1.1, whole bars, the record varisped by ${((laidAt / mix.targetBpm - 1) * 100).toFixed(3)}%`
          }
        />
        {mix.beats && (
          <div className="mf-export-pin">
            <span className="mf-export-pin-cap">loops of</span>
            <Segmented
              items={OFFERED.map((each) => (each === 'section' ? 'sections' : String(each)))}
              index={OFFERED.indexOf(offered)}
              onChange={(next) => mix.setPinEvery(OFFERED[next])}
              label="How long a loop the files are pinned for"
              title="The record is pinned to the grid at every line a loop of this length starts on, counted from 1.1.1 as Live counts, and left exactly as it was played between them. A shorter loop pins more often. Sections pins the cuts alone: a section lands its first and last bar and keeps everything between as it was played."
            />
            <span className="mf-export-pin-says">
              {pinSays}
              {measured && picked && picked !== offeredOf(measured.every) ? ` · measured: ${everyText(measured.every)}` : ''}
            </span>
          </div>
        )}
        {target === 'stems' && (
          <Pick
            on={sliced}
            onPick={() => setSliced(!sliced)}
            name={`Cut into ${mix.slices.length} sections`}
            blurb="A folder per stem holding its sections in order: one drag per stem into Live"
          />
        )}
      </div>

      {(target === 'pack' || sliced) && (
        <div className="mf-modal-slices">
          <div className="mf-modal-slice-head">
            <span>#</span>
            <span>
              slice
              {!mix.slicesAuto && (
                <button
                  type="button"
                  className="mf-modal-slice-redo"
                  onClick={mix.resetSlices}
                  title="Throw these away and read the slices off the stems again"
                >
                  read again
                </button>
              )}
            </span>
            <span>bar</span>
            <span>len</span>
            <span>tempo</span>
          </div>
          {mix.slices.map((slice, i) => {
            const next = mix.slices[i + 1]?.bar ?? mix.bars;
            return (
              <div
                key={i}
                className="mf-modal-slice"
                data-on={i === mix.activeSlice || undefined}
                onClick={() => mix.pickSlice(i)}
              >
                <span className="mf-modal-slice-num">{String(i + 1).padStart(2, '0')}</span>
                <input
                  type="text"
                  value={slice.name}
                  onChange={(e) => mix.rename(i, e.target.value)}
                  aria-label={`Name of slice ${i + 1}`}
                />
                <span className="mf-modal-slice-fact">{barText(slice.bar)}</span>
                <span className="mf-modal-slice-fact">{lengthText(next - slice.bar)}</span>
                <span className="mf-modal-slice-fact">{tempos ? tempos[i] : laidAt}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mf-modal-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>

      <div className="mf-export-where">
        <span className="mf-cap">to</span>
        <span className="mf-modal-path" title={at}>
          {at}
        </span>
        <Button
          onPress={() => void bridge?.destination.choose().then(setWhere)}
          disabled={!bridge}
          title={bridge ? 'Choose the folder exports are written into' : 'Only in the app'}
        >
          Change…
        </Button>
        <Button
          onPress={() => void write()}
          disabled={!bridge || chosen.length === 0 || writing}
          className="mf-primary"
          title={bridge ? undefined : 'Only in the app'}
        >
          {writing ? 'Writing…' : 'Export stems'}
        </Button>
      </div>
      {writing && (
        <div className="mf-export-job">
          <div className="mf-export-bar" data-waiting={!progress || undefined}>
            <div className="mf-export-fill" style={{ width: `${Math.round((progress?.done ?? 0) * 100)}%` }} />
          </div>
          <span className="mf-export-stage">{progress ? `${progress.stage} · ${Math.round(progress.done * 100)}%` : 'reading the stems…'}</span>
        </div>
      )}
      {wrote && <p className="mf-export-wrote">{wrote}</p>}
    </Modal>
  );
}
