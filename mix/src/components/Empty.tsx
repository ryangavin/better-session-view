import { Button } from '@openflow/widgets/controls/Button.tsx';
import type { Mix } from '../state.ts';
import './Idle.css';

/**
 * Before there is anything to look at: no library folder, or one with nothing
 * in it, or one with nothing chosen.
 *
 * Three sentences and the button that ends each of them. The first-run case
 * gets the most words because it is the one where a person has to make a
 * decision — where the library lives — and the consequences of that decision
 * are not obvious unless someone says them.
 */
export function Empty({ mix }: { mix: Mix }) {
  if (mix.loading) return <div className="mf-page" />;

  const { library } = mix;

  if (!library.root) {
    return (
      <div className="mf-page">
        <div className="mf-page-body">
          <p className="mf-eyebrow">no library yet</p>
          <h2 className="mf-page-title">Pick a folder to keep your tracks in</h2>
          <p className="mf-page-blurb">
            Everything you import is <strong>copied</strong> into it, beside a manifest
            that lists what is there. Nothing in that folder records where the folder is,
            so it travels: put it on a drive, carry it to the machine at the venue, and
            open it there.
          </p>
          <p className="mf-page-blurb">
            Somewhere with room is the only requirement. Stems are roughly the size of the
            track again, once per source.
          </p>
          <div className="mf-page-actions">
            <Button onPress={() => void mix.chooseFolder()} className="mf-primary">
              Choose a folder
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (library.problem) {
    return (
      <div className="mf-page">
        <div className="mf-page-body">
          <p className="mf-eyebrow">the library is not readable</p>
          <h2 className="mf-page-title">{library.problem}</h2>
          <p className="mf-page-blurb">
            Nothing has been changed. The folder is still where it was and so is anything
            in it — this is the app declining to guess, rather than a repair it can make.
          </p>
          <div className="mf-page-actions">
            <Button onPress={() => void mix.chooseFolder()} className="mf-primary">
              Choose another folder
            </Button>
            <span className="mf-estimate">{library.root}</span>
          </div>
        </div>
      </div>
    );
  }

  if (library.tracks.length === 0) {
    return (
      <div className="mf-page">
        <div className="mf-page-body">
          <p className="mf-eyebrow">the library is empty</p>
          <h2 className="mf-page-title">Import something to separate</h2>
          <p className="mf-page-blurb">
            WAV, FLAC, AIFF, MP3, M4A, OGG and Opus. Anything else in a selection is
            skipped rather than refused, so a folder with a stray PDF in it still imports.
          </p>
          <div className="mf-page-actions">
            <Button onPress={() => void mix.importTracks()} className="mf-primary">
              Import tracks
            </Button>
            <span className="mf-estimate">{library.root}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mf-page">
      <div className="mf-page-body">
        <p className="mf-eyebrow">{mix.total} tracks</p>
        <h2 className="mf-page-title">Pick one from the left</h2>
        <p className="mf-page-blurb">
          A track with no stems opens on a choice of model. One that has been separated
          opens on its lanes.
        </p>
      </div>
    </div>
  );
}
