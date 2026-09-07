/**
 * The models this app will run, pinned, with everything a job needs to run one.
 *
 * A registry rather than three ids in a dropdown, because a model is not just a
 * name: it declares which sources it emits, which engine runs it, what it costs
 * against the clock, and what — if anything — has to be installed before it
 * will work at all. `demucs/README.md` puts a registry second on its list of
 * what an engine needs, and the reason is that the answer to "why did this
 * track come out with four stems when I asked for six" has to be a lookup
 * rather than an investigation.
 *
 * **The inference settings are pinned here and not offered to anybody.** That
 * is a measurement, not an aesthetic: `shifts` and `overlap` at thirteen times
 * the compute moved the result by 0.02 dB. They govern chunk seams and memory.
 * A settings UI around them would spend a musician's afternoon on a number that
 * does not move.
 *
 * No `electron` import, so this is reachable from a test and from the renderer's
 * side of the bridge alike.
 */

/** Which worker runs it. One today; `demucs/README.md`'s hybrid is the second. */
export type Engine = 'demucs';

export interface Model {
  id: string;
  /** What the window calls it. */
  label: string;
  engine: Engine;
  /** The checkpoint name the engine is handed. Not always the id, once there are two engines. */
  checkpoint: string;
  /** What it emits, in this app's order rather than the model's. */
  sources: readonly string[];
  /**
   * Seconds of audio separated per second of wall clock, on Apple silicon.
   *
   * The separation phase only. Measured through this worker on a four-minute
   * track and checked against a twenty-second one, which is how the two agree
   * to within a few percent — the figures in `demucs/README.md` are
   * cold-process on a twenty-second clip, so they fold a fixed four seconds of
   * startup into a rate and come out four times too pessimistic.
   */
  realtime: number;
  /**
   * Seconds before separation begins: starting Python, importing torch, and
   * reading the checkpoints off disk.
   *
   * A fixed cost, held apart from `realtime` because it does not scale with the
   * track. A first run of a model also downloads it, which this does not cover
   * and nothing could — hence the stage line that says the model is loading.
   */
  load: number;
  /** `~9× realtime`, derived so the number and the words cannot disagree. */
  speed: string;
  /**
   * How clean the stems come out, one to five, against the others here. Not
   * an SDR figure: a rank a card can draw as a bar, the way a game draws a
   * stat, next to the speed drawn the same way.
   */
  quality: number;
  /**
   * The uv extra a workspace needs before this model will run, if any.
   *
   * Empty for everything shipped today, and the field exists because the model
   * worth adding next needs one: the RoFormer checkpoints arrive through
   * `audio-separator`, which is `--extra roformer` and about 3.4 GB.
   */
  needs: readonly string[];
}

/** Demucs's four, and the two more a six-source model splits out of the residual. */
const FOUR = ['vocals', 'drums', 'bass', 'other'] as const;
const SIX = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'] as const;

const speed = (realtime: number): string => `~${realtime}× realtime`;

const model = (m: Omit<Model, 'speed'>): Model => ({ ...m, speed: speed(m.realtime) });

/**
 * The quality is a rank rather than a score.
 *
 * A model's SDR figure is not something anybody can act on standing at a
 * laptop. Five pips against the others here is: the fine-tuned four is the
 * cleanest, the base four is close behind, and the six loses two because
 * its piano bleeds and wants checking before it is trusted. The card draws
 * that beside the speed and the stems it makes, and nothing else to read.
 */
export const MODELS: readonly Model[] = [
  model({
    id: 'htdemucs_ft',
    label: 'demucs ft · 4',
    engine: 'demucs',
    checkpoint: 'htdemucs_ft',
    sources: FOUR,
    realtime: 2.7,
    load: 5,
    quality: 5,
    needs: [],
  }),
  model({
    id: 'htdemucs',
    label: 'demucs · 4',
    engine: 'demucs',
    checkpoint: 'htdemucs',
    sources: FOUR,
    realtime: 9,
    load: 4,
    quality: 4,
    needs: [],
  }),
  model({
    id: 'htdemucs_6s',
    label: 'demucs · 6',
    engine: 'demucs',
    checkpoint: 'htdemucs_6s',
    sources: SIX,
    realtime: 8.5,
    load: 4,
    quality: 3,
    needs: [],
  }),
];

export const DEFAULT_MODEL = 'htdemucs_ft';

/**
 * A model by id, or nothing.
 *
 * Deliberately not falling back to the default: a job asking for a model that
 * is not here is a bug or a manifest from a newer version, and separating with
 * something other than what was asked for would record the wrong answer in the
 * sidecar.
 */
export const modelOf = (id: string): Model | null => MODELS.find((m) => m.id === id) ?? null;
