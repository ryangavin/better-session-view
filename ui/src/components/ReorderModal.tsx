import { useMemo, useState, type DragEvent } from 'react';
import { songKey, type Derivation, type DerivedSong } from '../../../core/src/derive.js';
import { songFacts } from '../../../core/src/songRows.js';
import { orderScenes } from '../../../core/src/songOrder.js';
import {
  describeMove,
  planSceneReorder,
  type SceneMovePlan,
} from '../../../core/src/sceneMove.js';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js';

interface Props {
  derivation: Derivation;
  snapshot: BSV.Snapshot;
  busy: boolean;
  /** Write the new order to Live. The one call in the app with no undo. */
  onApply: (plan: SceneMovePlan) => void;
  onClose: () => void;
}

/** Move `key` to a gap in `list`, where gap `i` is "above the song at `i`". */
function moveTo(list: readonly string[], key: string, gap: number): string[] {
  const from = list.indexOf(key);
  if (from < 0) return [...list];
  const out = [...list];
  out.splice(from, 1);
  out.splice(gap > from ? gap - 1 : gap, 0, key);
  return out;
}

/** Swap the song at `i` with its neighbour, or return the list unchanged. */
function nudge(list: readonly string[], i: number, by: -1 | 1): string[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/**
 * Reordering the whole set as a running order, then writing it once.
 *
 * Dragging a song header in the grid does this a song at a time, and each drag
 * is its own create/copy/delete pass in Live plus its own re-snapshot. That cost
 * is what stops anyone *trying* an order: you don't reorder a set list once, you
 * shuffle it until it flows. So the draft is free and only Apply is expensive.
 *
 * **A song is one row here, however many runs it has in the set.** That's the
 * unit a running order is written in, and it means applying one *gathers* a song
 * found in two places — a real change, so the row says how many runs it has and
 * the summary says it out loud before anything is written.
 *
 * Nothing here writes until Apply. The plan is rebuilt on every change and the
 * cost is on the button, for the same reason the grid's drop indicator carries
 * it: this is the one write no undo of ours can reverse, so what it will do has
 * to be readable before it runs rather than in the log afterwards.
 */
export function ReorderModal({ derivation, snapshot, busy, onApply, onClose }: Props) {
  useCloseOnEscape(onClose);

  const setOrder = useMemo(() => derivation.songs.map((s) => songKey(s.name)), [derivation]);
  const [draft, setDraft] = useState<string[]>(setOrder);
  const [dragKey, setDragKey] = useState<string | null>(null);
  /** The gap the drop would land in, as an index into the rendered list. */
  const [dropAt, setDropAt] = useState<number | null>(null);

  const songs = useMemo(() => {
    const at = new Map<string, DerivedSong>();
    for (const song of derivation.songs) at.set(songKey(song.name), song);
    return at;
  }, [derivation]);

  /**
   * The scenes, with the song each one carries. Rebuilt from the derivation
   * rather than held, so a snapshot arriving while this is open can't leave the
   * list describing a set that no longer exists.
   */
  const scenes = useMemo(
    () =>
      derivation.scenes.map((sc) => ({
        s: sc.s,
        songKey: sc.song === null ? null : songKey(sc.song),
      })),
    [derivation],
  );

  // `orderScenes` reconciles the draft against the set — a song the draft has
  // never heard of lands at the end rather than going missing — so what it
  // returns, not the draft, is what the list renders and what a drag moves.
  const ordering = useMemo(() => orderScenes(scenes, draft), [scenes, draft]);
  const shown = ordering.placements;

  /**
   * The plan, or why there isn't one.
   *
   * `planSceneReorder` throws on an order that isn't the whole set, which can
   * only be our own bug — but it would throw *during a render*, and a blank app
   * is a worse way to find out than a disabled button and a line saying so.
   */
  const { plan, planError } = useMemo(() => {
    try {
      return {
        plan: planSceneReorder({
          order: ordering.order,
          clips: snapshot.clips,
          tracks: snapshot.tracks,
        }),
        planError: '',
      };
    } catch (e) {
      return { plan: null, planError: e instanceof Error ? e.message : String(e) };
    }
  }, [ordering, snapshot]);

  const gathering = shown.filter((p) => (songs.get(p.songKey)?.blocks.length ?? 1) > 1);
  const travelling = shown.reduce((n, p) => n + p.trailing.length, 0);
  // Against what's on screen, not against the draft: reconciliation can have
  // moved a song the draft never mentioned, and Reset puts the *list* back.
  const dirty = shown.some((p, i) => p.songKey !== setOrder[i]);

  const drop = (gap: number) => {
    if (dragKey !== null) setDraft(moveTo(shown.map((p) => p.songKey), dragKey, gap));
    setDragKey(null);
    setDropAt(null);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Reorder songs — {shown.length}</div>
        <div className="hint">
          Drag to set the running order, then <b>Apply</b> to write it. Nothing
          reaches Live until you do, so an order costs nothing to try.
        </div>

        {shown.length === 0 ? (
          <div className="hint">No scene name matched the pattern, so there are no songs to order.</div>
        ) : (
          <div className="order-rows">
            {shown.map((p, i) => {
              const song = songs.get(p.songKey);
              const facts = song ? songFacts(song) : { bpm: '', key: '' };
              const runs = song?.blocks.length ?? 1;
              return (
                <div
                  key={p.songKey}
                  className={[
                    'order-row',
                    dragKey === p.songKey ? 'dragging' : '',
                    dropAt === i ? 'drop-above' : '',
                    dropAt === shown.length && i === shown.length - 1 ? 'drop-below' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable
                  onDragStart={(e: DragEvent<HTMLDivElement>) => {
                    // Firefox refuses to start a drag unless something is set.
                    e.dataTransfer.setData('text/plain', p.songKey);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragKey(p.songKey);
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    setDropAt(null);
                  }}
                  // Which half of the row the pointer is in decides which side of
                  // it the song lands on — the same idiom as the grid's headers,
                  // and the one every list-reorder UI uses.
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const box = e.currentTarget.getBoundingClientRect();
                    const gap = e.clientY > box.top + box.height / 2 ? i + 1 : i;
                    setDropAt((prev) => (prev === gap ? prev : gap));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const box = e.currentTarget.getBoundingClientRect();
                    drop(e.clientY > box.top + box.height / 2 ? i + 1 : i);
                  }}
                >
                  <span className="grip" aria-hidden>
                    ≡
                  </span>
                  <span className="pos">{i + 1}</span>
                  {/* The same slots the grid's header uses, in the same order,
                      so a song reads the same in both places. */}
                  <span className="facts">
                    <span className={`bpm${facts.bpm === '' ? ' none' : ''}`}>
                      {facts.bpm || '---'}
                    </span>
                    <span className={`key${facts.key === '' ? ' none' : ''}`}>
                      {facts.key || '--'}
                    </span>
                  </span>
                  <span className="song">{song?.name ?? p.songKey}</span>
                  <span className="count">
                    {p.scenes.length} scene{p.scenes.length === 1 ? '' : 's'}
                  </span>
                  {runs > 1 && (
                    <span
                      className="flag"
                      title={`This song sits in ${runs} runs. Applying collects them into one.`}
                    >
                      {runs} runs → 1
                    </span>
                  )}
                  {p.trailing.length > 0 && (
                    <span
                      className="dim"
                      title="Scenes the pattern couldn't read a song out of. They sit after this song and move with it."
                    >
                      +{p.trailing.length} unmapped
                    </span>
                  )}
                  <button
                    type="button"
                    className="x"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => setDraft(nudge(shown.map((s) => s.songKey), i, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="x"
                    title="Move down"
                    disabled={i === shown.length - 1}
                    onClick={() => setDraft(nudge(shown.map((s) => s.songKey), i, 1))}
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Everything the write will do that the list doesn't already show. A
            gathered reprise and a travelling unmapped scene are both changes
            nobody dragged, so neither may be found out about afterwards. */}
        {gathering.length > 0 && (
          <div className="warn">
            {gathering
              .map((p) => songs.get(p.songKey)?.name ?? p.songKey)
              .slice(0, 3)
              .join(', ')}
            {gathering.length > 3 ? ` and ${gathering.length - 3} more` : ''} sit
            {gathering.length === 1 ? 's' : ''} in more than one run, and applying
            collects each into one.
          </div>
        )}
        {/* Scenes no song owns can't be placed by a running order, so say where
            they end up rather than letting them turn up somewhere. */}
        {(travelling > 0 || ordering.head.length > 0) && (
          <div className="hint">
            {travelling > 0 &&
              `${travelling} scene${travelling === 1 ? '' : 's'} the pattern couldn't read ` +
                `${travelling === 1 ? 'travels' : 'travel'} with the song ` +
                `${travelling === 1 ? 'it sits' : 'they sit'} after. `}
            {ordering.head.length > 0 &&
              `${ordering.head.length} unmapped scene${ordering.head.length === 1 ? '' : 's'} ` +
                `above the first song ${ordering.head.length === 1 ? 'stays' : 'stay'} at the top.`}
          </div>
        )}
        {planError !== '' && <div className="warn">Could not plan this order — {planError}</div>}

        <div className="warn">
          There is no undo for this. It creates and deletes scenes, and no
          snapshot can rebuild a deleted one — Live's own ⌘Z is the only way back,
          and only if Live agrees to group the move.
        </div>

        <div className="modal-actions">
          <button
            type="button"
            disabled={!dirty}
            title="Put the list back the way the set has it"
            onClick={() => setDraft(setOrder)}
          >
            Reset
          </button>
          <div className="hint">{plan ? describeMove(plan) : 'nothing to move'}</div>
          <div className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || plan === null}
            title={
              plan === null
                ? 'The set is already in this order'
                : 'Write this order to Live'
            }
            onClick={() => plan && onApply(plan)}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
