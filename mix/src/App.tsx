import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Empty } from './components/Empty.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { Header } from './components/Header.tsx';
import { Idle } from './components/Idle.tsx';
import { Lanes } from './components/Lanes.tsx';
import { Library } from './components/Library.tsx';
import { Running } from './components/Running.tsx';
import { openflow, type Ready } from './openflow.ts';
import { useMix } from './state.ts';
import './App.css';

/**
 * mix[flow]: a library on the left, the open track to the right of it, and one
 * header across the top that says what is open and what can be done to it.
 *
 * The right rail is gone. What it carried has each found a better home — the
 * track's name is in the header, the mix summary is in the band above the
 * lanes, and the slice list is in the export dialog, which is the moment you
 * actually name slices. What is left is two columns instead of three, and a
 * lane that is nearly two hundred pixels wider for it.
 *
 * The middle is one of three things and never two: a track with no stems is a
 * choice of model, a track being separated is a progress report, and a track
 * with stems is the lanes. Nothing here is a tab, because they are states of
 * one track rather than views of it — you do not choose to be separating.
 *
 * **Nothing on screen is pretend any more except the slices.** The tracks come
 * from a folder on disk, pressing Generate runs Demucs against the file
 * (`docs/stems.md`), and the lanes draw — and the transport plays — the stems
 * that were written (`docs/playback.md`). The slices are still eight evenly
 * spaced spans with names, because nothing detects an arrangement yet, and
 * `mock.ts` says so where they are made.
 *
 * The window also remembers itself across a reload: the open track, the mix,
 * the head. `remember.ts` has what is kept and what deliberately is not.
 */
export function App() {
  const mix = useMix();
  const [ready, setReady] = useState<Ready | null>(null);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const bridge = openflow();
    if (!bridge) {
      setReady({ ok: false, built: false, says: 'no app around this page', where: '—' });
      return;
    }
    let live = true;
    void bridge.demucs().then((answer) => {
      if (live) setReady(answer);
    });
    return () => {
      live = false;
    };
  }, []);

  // Space is the one key a person expects to work in a window with a playhead
  // in it, and none of these may fire while they are naming a slice. Delete
  // folds the selected slice into the one before it, which is the keyboard's
  // version of dragging its cut back onto the last one, and Command-L loops
  // round it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        mix.setPlaying(!mix.playing);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && mix.activeSlice > 0) {
        e.preventDefault();
        mix.removeSlice(mix.activeSlice);
      } else if (e.key.toLowerCase() === 'l' && (e.metaKey || e.ctrlKey)) {
        // Command-L is Live's loop switch, and the section it means is the one
        // that is selected — click a slice, ask for the loop, and the two are
        // the same gesture.
        e.preventDefault();
        mix.loopSlice();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mix.playing, mix.setPlaying, mix.activeSlice, mix.removeSlice, mix.loopSlice]);

  const carriesFiles = (event: DragEvent): boolean =>
    Array.from(event.dataTransfer.types).includes('Files');

  const dragEnter = (event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (mix.library.root && !mix.importing) setDropping(true);
  };

  const dragOver = (event: DragEvent) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = mix.library.root && !mix.importing ? 'copy' : 'none';
  };

  const dragLeave = (_event: DragEvent) => {
    // Chromium may clear `dataTransfer.types` on the final leave. The depth is
    // already proof that this drag entered with files, and is the reliable way
    // to make sure the target cannot remain stuck on screen.
    if (dragDepth.current === 0) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };

  const drop = (event: DragEvent) => {
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    if (mix.library.root && !mix.importing) {
      void mix.importDropped(Array.from(event.dataTransfer.files));
    }
  };

  return (
    <div
      className="mf-app"
      onDragEnter={dragEnter}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
    >
      <Header mix={mix} ready={ready} />
      <main className="mf-body">
        <Library mix={mix} />
        <section className="mf-centre">
          {mix.phase === 'empty' && <Empty mix={mix} />}
          {mix.phase === 'idle' && <Idle mix={mix} ready={ready} />}
          {mix.phase === 'running' && <Running mix={mix} />}
          {mix.phase === 'ready' && <Lanes mix={mix} />}
        </section>
      </main>
      {mix.exporting && <ExportModal mix={mix} />}
      {dropping && (
        <div className="mf-drop" role="status">
          <span>Drop audio files to import</span>
        </div>
      )}
    </div>
  );
}
