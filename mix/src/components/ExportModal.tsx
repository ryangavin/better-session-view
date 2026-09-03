import { useEffect, useState, type CSSProperties } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { laneOrder, stemOf } from '../mock.ts';
import { openflow } from '../openflow.ts';
import { barText, lengthText } from '../slices.ts';
import type { Mix } from '../state.ts';
import { bpmText } from '../warp.ts';
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
 * **Sections are a cut, not a second render.** Asked for them, the stems are
 * laid straight exactly as they always were and then cut where the slices fall
 * — so a section costs no render time and butts back against its neighbours
 * sample for sample. The list of slices is the same list the pack will use and
 * the same one the ruler draws, which is why naming them is worth doing before
 * either: a folder of sections named Part 3 is a folder you have to listen to
 * to sort out.
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
  const [fullTrack, setFullTrack] = useState(false);
  const [sliced, setSliced] = useState(false);
  const [where, setWhere] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
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

  if (!mix.song) return null;
  const song = mix.song;
  const folder = song.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const at = `${where ?? '~/Music/mixflow'}/${folder}/`;
  const sections = sliced ? mix.slices.length : 1;
  const files = (chosen.length + (fullTrack ? 1 : 0)) * sections;
  const parts = [
    chosen.length ? `${chosen.length} stem${chosen.length === 1 ? '' : 's'}` : '',
    fullTrack ? 'full track' : '',
    sections > 1 ? `× ${sections} sections` : '',
  ].filter(Boolean);

  const facts: [string, string][] = [
    ['track', song.artist ? `${song.title} · ${song.artist}` : song.title],
    ['writes', files ? `${files} wav · ${parts.join(' + ')}` : 'nothing chosen'],
    ['tempo', `${bpmText(mix.targetBpm)} BPM${mix.bpmAuto ? ' · fitted' : ' · set by hand'}`],
    ['length', `${mix.bars} bars · ${Math.round(mix.seconds)}s`],
  ];

  const flip = (id: string) =>
    setChosen((was) => (was.includes(id) ? was.filter((s) => s !== id) : [...was, id]));

  // The tempo the files are laid at: the whole number nearest the grid's, so
  // the name on the file is the tempo Live reads, and the record is varisped
  // by the fraction between — see `straighten.ts`.
  const laidAt = Math.round(mix.targetBpm);
  const write = async () => {
    if (!bridge || !song.stems || chosen.length === 0) return;
    setWriting(true);
    setWrote(null);
    try {
      const done = await bridge.export.stems({
        trackId: song.id,
        title: song.title,
        stems: song.stems,
        sources: sources.filter((id) => chosen.includes(id)),
        slices: sliced ? mix.slices : undefined,
        bpm: mix.targetBpm,
        offset: mix.offset,
        to: laidAt,
      });
      const cut = done.parts > 1 ? ` · ${done.parts} sections` : '';
      setWrote(`${done.files.length} wav · ${done.bars} bars${cut} · ${done.where}`);
    } catch (error) {
      setWrote(`failed — ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWriting(false);
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
            on={fullTrack}
            onPick={() => setFullTrack(!fullTrack)}
            name="Full track"
            blurb="The stems summed back, at the levels on the lanes"
          />
        </div>
      </div>

      <div className="mf-export-picks">
        <Pick
          on
          onPick={() => {}}
          name={`Laid straight at ${laidAt} BPM`}
          blurb={`From 1.1.1, whole bars, the record varisped by ${((laidAt / mix.targetBpm - 1) * 100).toFixed(3)}%`}
        />
        {target === 'stems' && (
          <Pick
            on={sliced}
            onPick={() => setSliced(!sliced)}
            name={`Cut into ${mix.slices.length} sections`}
            blurb="A folder per section, each holding the same stems, cut on the grid"
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
      {wrote && <p className="mf-export-wrote">{wrote}</p>}
    </Modal>
  );
}
