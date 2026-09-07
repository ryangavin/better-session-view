import { Button } from '@openflow/widgets/controls/Button.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { OFFERED, offeredOf } from '../pinned.ts';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import type { Snap } from '../grid.ts';
import type { Ready } from '../openflow.ts';
import type { Mix } from '../state.ts';
import { FASTEST, SLOWEST } from '../tempo.ts';
import { bpmText, rangeText } from '../warp.ts';
import './Header.css';

/**
 * Playback and snap stay at hand. **Grid** opens the one mode for asking
 * whether the song is right — the beat handles, bar 1, finding the beats
 * again, the section suggestions — over the real lanes, with Done and Cancel.
 * **Details** beside the title opens what the track *is*: its name, its art,
 * the model that made the stems and the way to make them again. The tempo the
 * beats run at stays on the bar; how it was found is the debug workspace's,
 * reached from the library footer.
 */

const play = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);

const pause = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const stopMark = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" />
  </svg>
);

const loopMark = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 9h13l-3-3M20 15H7l3 3" />
  </svg>
);

/** Two rings, joined: the session shared with Live. */
const linkMark = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="8.5" cy="12" r="5" />
    <circle cx="15.5" cy="12" r="5" />
  </svg>
);

/** A speaker and one wave: this computer's own output. */
const speakerMark = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5v5h4l5 4v-13l-5 4z" />
    <path d="M16.5 9a4.5 4.5 0 0 1 0 6" />
  </svg>
);




/**
 * The tempo, in the transport, because it is the speed the record plays at.
 *
 * Unlabelled, and the group is not: `snap` and `beats` name a cluster of marks
 * and buttons that would otherwise be a rebus. A BPM does not need naming.
 *
 * It used to live in the export dialog, which was the only place a tempo could
 * be seen or changed — a number that rules every line in the window, reachable
 * only from the thing you press when you have finished. Auto-warp is unusable
 * without it: the whole feedback from pressing it is a number appearing and the
 * ticks lining up.
 *
 * Unnamed and unfilled, for the reason `widgets/docs/catalogue.md` gives about
 * fills: 124 of a 70-to-190 range is 45% of nothing, and it would be the
 * loudest thing on the bar while carrying the least.
 */
const TEMPO: Param = {
  kind: 'float',
  min: SLOWEST,
  max: FASTEST,
  defaultValue: 120,
  unit: 'custom',
  customUnit: '%0.1f',
};
const LINK_TEMPO: Param = { ...TEMPO, min: 20, max: 999 };

/** bar.beat.sixteenth, one-based, from a position measured in bars. */
function position(bar: number, bars: number): string {
  const whole = Math.floor(bar);
  const beat = Math.floor((bar - whole) * 4);
  const sixteenth = Math.floor(((bar - whole) * 4 - beat) * 4);
  return `${Math.min(whole, Math.max(0, bars - 1)) + 1}.${beat + 1}.${sixteenth + 1}`;
}

/** `3:07`, beside the bar count, because a length in bars is a claim and this is not. */
function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The rungs a cut can be held to, coarsest first.
 *
 * Marked rather than named, because five words would take the width of the
 * transport and the marks are the ones a musician already reads: the grid's
 * own hatch, four bars, one bar, a beat, half of one.
 */
const SNAPS: readonly { id: Snap; mark: string; says: string }[] = [
  { id: 'grid', mark: '⌗', says: 'Cuts land on the grid the ruler is drawing at this zoom' },
  { id: 'phrase', mark: '4', says: 'Cuts land on four bars, whatever the zoom' },
  { id: 'bar', mark: '1', says: 'Cuts land on a bar, whatever the zoom' },
  { id: 'beat', mark: '♩', says: 'Cuts land on a beat, whatever the zoom' },
  { id: 'half', mark: '½', says: 'Cuts land on half a beat, whatever the zoom' },
];

export function Header({ mix, ready, playView = false, onToggleView }: { mix: Mix; ready: Ready | null; playView?: boolean; onToggleView?(): void }) {
  const live = mix.phase === 'ready';
  const song = mix.song;

  const logo = <button type="button" className="mf-mark" aria-label={playView ? 'Switch to single-track editor' : 'Switch to four-deck mixer'} aria-pressed={playView} title="Switch Prep / Play (Tab)" onClick={onToggleView}>mix<span>[flow]</span></button>;
  return (
    <header className="mf-header">
      {/* Silent when the toolchain is fine. A green light that is always on is
          a thing you stop seeing; a red one that appears is not. */}
      {!playView && ready && !ready.ok && (
        <span className="mf-broken" title={`${ready.says} — see mix/docs/demucs.md`}>
          <i />
          engine
        </span>
      )}

      {logo}
      <div className="mf-group mf-link" role="group" aria-label="Link Audio">
        <Toggle on={mix.linkAudio.enabled}
          onChange={mix.setLinkAudio}
          label="Link Audio"
          title="Link Audio: share the stems with Live, follow its tempo, and start and stop with it"
          width={30}
        >{linkMark}</Toggle>
        <Toggle on={mix.monitoring} onChange={mix.setMonitoring}
          label="Local audio" width={30}
          title="Local audio: hear the mix through this computer's speakers. What Live receives is unaffected"
        >{speakerMark}</Toggle>
        {mix.linkAudio.enabled && <Select
          items={['4 bars', '8 bars', '16 bars', 'Sections']}
          index={OFFERED.indexOf(mix.linkEvery)}
          onChange={(next) => mix.setLinkEvery(OFFERED[next])}
          label="Link pins"
          title="While linked: how often playback is held to Live's grid — every 4, 8 or 16 bars, or at the sections only. The original feel stays between pins. Export has its own choice, on the export dialog"
          width={74}
        />}
        <span className={mix.linkAudio.problem || mix.linkAudio.dropped ? 'mf-link-problem' : undefined}
          title={mix.linkAudio.problem ?? `${mix.linkAudio.outputs.join(', ')} · ${mix.linkAudio.dropped} dropped blocks`}>
          {mix.linkAudio.problem ? 'unavailable' : mix.linkAudio.starting ? 'connecting' : mix.waitingForLink ? 'waiting for bar' : mix.linkAudio.enabled
            ? `${mix.linkAudio.peers} peers${mix.linkAudio.dropped ? ' · gaps' : ''}` : ''}
        </span>
      </div>

      {!playView && <div className="mf-open">
        {song ? (
          <>
            <span className="mf-open-title" title={song.title}>{song.title}</span>
            {song.artist && <span className="mf-open-artist" title={song.artist}>{song.artist}</span>}
            <Button
              onPress={mix.openDetails}
              disabled={mix.editingGrid}
              className="mf-open-details"
              title="The track's name, artist, album and art, and the model that made its stems"
            >
              Details
            </Button>

          </>
        ) : (
          <span className="mf-open-none">nothing open</span>
        )}
      </div>}

      {(live || playView) && (
        <>
          {/* Playback: the buttons, the tempo they run at, and the reading.

              Tempo is here rather than beside Auto-warp because with warp on
              it is the speed the song plays at — the one number on the bar
              that changes what you hear. Measuring it is a separate job, and
              it has a separate group. */}
          <div className="mf-group" role="group" aria-label="Playback">
            <Button
              onPress={() => mix.setPlaying(!mix.playing)}
              label={mix.playing ? 'Pause' : 'Play'}
              title={
                !mix.playable
                  ? mix.decoding
                    ? 'Reading the stems'
                    : 'No stems loaded'
                  : mix.waitingForLink
                    ? 'Waiting for the matching Link bar position. Press to cancel'
                  : mix.playing
                    ? 'Pause (Space)'
                    : 'Play (Space)'
              }
              width={26}
              disabled={!mix.playable}
              className={mix.playing ? 'mf-playing' : undefined}
            >
              {mix.playing ? pause : play}
            </Button>
            <Button
              onPress={mix.stop}
              label="Stop"
              title="Stop and return to the top"
              width={26}
              disabled={!mix.playable}
            >
              {stopMark}
            </Button>
            <Toggle
              on={mix.loop}
              onChange={mix.setLoop}
              label="Loop"
              title={
                mix.region
                  ? 'Looping a part of the track. Command-L lets it go'
                  : 'Loop the whole track. Shift-click the timeline, or Command-L for the selected section'
              }
              width={26}
              className={mix.region ? 'mf-looping-part' : undefined}
            >
              {loopMark}
            </Toggle>
            <NumberField
              param={mix.linkAudio.enabled ? LINK_TEMPO : TEMPO}
              value={mix.targetBpm}
              display={bpmText(mix.targetBpm)}
              onChange={(next) => mix.setTempo(Number(next.toFixed(2)))}
              editable
              showFill={false}
              width={44}
              label="Tempo"
              disabled={mix.editingGrid}
              title={
                mix.beats
                  ? 'The tempo the stems play at with warp on. The grid is where the beats are'
                  : 'Playback tempo with Warp on. To change the source timing, use Edit beat grid'
              }
            />
            {/* Bars are the grid's claim; the clock is what is true whatever
                tempo anybody decides on. Both, because a slice is placed in one
                and heard in the other. */}
            <span className="mf-clock">{position(mix.bar, mix.bars)}</span>
            <span className="mf-clock mf-clock-time">{clockOf(mix.position)}</span>
          </div>

          {/* Where a cut lands. Its own group and nothing else in it: it is not
              playback and it is not the beat map, it is the one setting that
              says what the pointer is allowed to do to the timeline. */}
          {!playView && <><div className="mf-group" role="group" aria-label="Snap">
            <span className="mf-group-label">snap</span>
            <Segmented
              items={SNAPS.map((s) => s.mark)}
              index={SNAPS.findIndex((s) => s.id === mix.snap)}
              onChange={(next) => mix.setSnap(SNAPS[next].id)}
              label="Snap"
              title={SNAPS.find((s) => s.id === mix.snap)?.says ?? ''}
              className="mf-snap"
            />
          </div>

          <div className="mf-group" role="group" aria-label="Grid">
            <Button onPress={mix.beginGridEdit} disabled={mix.editingGrid || !mix.playable} title="Check and correct the beat grid and the sections over the lanes: drag beats, set bar 1, find the beats again, keep or move the section cuts">Grid</Button>
            {/* The tempo the song runs at — a range where it moved — next to
                the button that opens the grid. How well the kit sits on it
                and which algorithm laid it are the debug workspace's
                questions; a person mixing asks only what tempo this is. A
                fit that found nothing says so rather than leaving a press
                with no answer. */}
            {mix.editingGrid ? <span className="mf-fit">Editing</span> : mix.beats ? (
              <span
                className="mf-fit"
                title={`The tempo the beats run at, read off their spacing${mix.detected ? `; ${Math.round(mix.detected.agreement * 100)}% of the kit on a line` : ''}${mix.madeByName ? `. Laid by ${mix.madeByName}` : ''}`}
              >
                {rangeText(mix.grid)}
              </span>
            ) : mix.fitFailed ? (
              <span className="mf-fit mf-fit-none" title="Nothing steady enough to fit a tempo to">
                no fit
              </span>
            ) : null}
            {/* Live's warp switch: on, every bar of the record plays in the
                time the tempo gives a bar. It needs the beat map to know where
                the record's bars are, and a stretcher to play them through,
                and it says which of those it is waiting on. It sits with the
                beat map rather than with playback because without one it can
                do nothing at all. */}
            <Toggle
              on={mix.warp || mix.linkAudio.enabled}
              onChange={mix.setWarp}
              label="Warp"
              title={
                mix.linkAudio.enabled ? 'Link keeps playback warped to the shared tempo'
                : !mix.beats
                  ? 'Warp: play the stems stretched to the tempo. Follow the beat first'
                  : mix.stretching === 'failed'
                    ? 'Warp: the stretcher could not be loaded, so the stems play as they were recorded'
                    : mix.stretching === 'loading'
                      ? 'Warp: loading the stretcher'
                      : 'Warp: play every bar of the record in the time the tempo gives it'
              }
              disabled={mix.linkAudio.enabled || !mix.beats || mix.stretching === 'failed'}
              width={38}
            >
              warp
            </Toggle>
          </div></>}
        </>
      )}

      {!playView && <Button
        onPress={() => mix.setExporting(true)}
        disabled={!live || mix.editingGrid}
        title={live ? 'Choose what to write out: the stems, and the full track with them' : song?.sources.length ? 'Return to the mix to export' : 'Separate the track first'}
      >
        Export
      </Button>}
      {playView && <span className="mf-play-status">Deck audio not connected</span>}

    </header>
  );
}
