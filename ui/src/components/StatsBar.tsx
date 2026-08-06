import { LAUNCH_KEY } from '../lib/keys.js';
import { IconGitHub } from './Icon.js';
import { Stat } from './Stat.js';
import './StatsBar.css';

const REPOSITORY_URL = 'https://github.com/ryangavin/better-session-view';

interface Props {
  snapshot: BSV.Snapshot | null;
  songCount: number;
  unmappedCount: number;
  selectedCount: number;
  /** Opens the songs modal — the Songs and Unmapped tiles both lead there. */
  onOpenSongs: () => void;
}

/** The status strip along the bottom: the stat tiles, and the key-hint line. */
export function StatsBar({
  snapshot,
  songCount,
  unmappedCount,
  selectedCount,
  onOpenSongs,
}: Props) {
  return (
    <div className="stats">
      <Stat k="Tracks" v={snapshot?.trackCount} />
      <Stat k="Scenes" v={snapshot?.sceneCount} />
      <Stat k="Clips" v={snapshot?.clipCount} />
      <Stat
        k="Songs"
        v={snapshot ? songCount : undefined}
        onClick={snapshot ? onOpenSongs : undefined}
      />
      <Stat
        k="Unmapped"
        v={snapshot ? unmappedCount : undefined}
        warn={unmappedCount > 0}
        onClick={snapshot ? onOpenSongs : undefined}
      />
      <Stat k="LOM walk" v={snapshot ? `${snapshot.ms}ms` : undefined} />
      <Stat k="Slot scan" v={snapshot ? `${snapshot.timings.slots}ms` : undefined} />
      <Stat k="Selected" v={selectedCount} />
      <div className="spacer" />
      <div className="keyhint">
        <b>{LAUNCH_KEY}</b>-click / <b>{LAUNCH_KEY}</b>-↑↓ fires · <b>⇧</b> extends ·{' '}
        <b>⌥</b> adds · <b>esc</b> stops clips · <b>{LAUNCH_KEY}Z</b> undoes
      </div>
      <a
        className="repository-link"
        href={REPOSITORY_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="View Better Session View on GitHub"
        title="View source on GitHub"
      >
        <IconGitHub />
      </a>
    </div>
  );
}
