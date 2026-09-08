import { DebugModal } from './components/DebugButton.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { HintFooter } from '@openflow/widgets/chrome/HintFooter.tsx';
import { PlayView } from './play/PlayView.tsx';
import { useMixerViewModel } from './play/useMixerViewModel.ts';
import { isViewShortcut } from './play/decks.ts';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Empty } from './components/Empty.tsx';
import { DetailsModal } from './components/DetailsModal.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { Header } from './components/Header.tsx';
import { TrackAnalysis } from './components/TrackAnalysis.tsx';
import { Lanes } from './components/Lanes.tsx';
import { Library } from './components/Library.tsx';
import { Running } from './components/Running.tsx';
import { openflow, type Ready } from './openflow.ts';
import { useMix } from './state.ts';
import './App.css';
import { carriesImport, droppedYoutube } from './libraryDrop.ts';

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
 * A new track opens on its setup: details, a model, Generate stems. Once it
 * has stems it opens on the lanes and stays there — the grid is checked and
 * corrected in a mode over them, and the details come back as a dialog.
 * Running separation remains a derived job state.
 *
 * **Nothing on screen is pretend any more except the slices.** The tracks come
 * from a folder on disk, pressing Generate runs Demucs against the file
 * (`docs/stems.md`), and the lanes draw — and the transport plays — the stems
 * that were written (`docs/playback.md`). The slices are still eight evenly
 * spaced spans with names, because nothing detects an arrangement yet, and
 * `mock.ts` says so where they are made.
 *
 * Along the bottom of the main column, level with the library's footer and
 * under Prep and Play alike, a `HintFooter` says what the pointer or the focus
 * ring is on. Nothing had to
 * be annotated for it: it reads a control's `title` where there is no
 * `data-hint`, and the app was already full of titles. `docs/window.md`.
 *
 * The window also remembers itself across a reload: the open track, the mix,
 * the head. `remember.ts` has what is kept and what deliberately is not.
 */
export function App() {
  const mix = useMix();
  const [playView, setPlayView] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mixer = useMixerViewModel(mix.library.tracks, mix.library.root);
  const previousMode = useRef(playView);
  useEffect(() => {
    if (previousMode.current === playView) return;
    if (playView) { mix.pauseForView(); mix.setLinkAudio(false); }
    else { void mixer.engine.running(false, false); mixer.engine.setLinkAudio(false); }
    previousMode.current = playView;
  }, [playView, mix.pauseForView, mix.setLinkAudio, mixer.engine]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (isViewShortcut(event)) { event.preventDefault(); setPlayView(view => !view); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
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
      if (playView && e.code === 'Space' && !e.defaultPrevented && !target?.closest('input, textarea, select, button, [role=slider], [role=combobox], [role=dialog]')) { e.preventDefault(); mixer.commands.setRunning(!mixer.state.running); return; }
      if (playView || mix.phase !== 'ready' || e.defaultPrevented || target?.closest('input, textarea, select, button, [role=dialog]')) return;
      if (e.key === ' ') {
        // With the grid open, Space is the click audition, and the grid
        // editor answers it: it holds the player and the drums.
        if (mix.editingGrid) return;
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
  }, [playView, mixer.commands, mixer.state.running, mix.editingGrid, mix.phase, mix.playing, mix.setPlaying, mix.activeSlice, mix.removeSlice, mix.loopSlice]);

  const carriesLibraryImport = (event: DragEvent): boolean => carriesImport(Array.from(event.dataTransfer.types));

  const dragEnter = (event: DragEvent) => {
    if (!carriesLibraryImport(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (mix.library.root && !mix.importing) setDropping(true);
  };

  const dragOver = (event: DragEvent) => {
    if (!carriesLibraryImport(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = mix.library.root && !mix.importing ? 'copy' : 'none';
  };

  const dragLeave = (_event: DragEvent) => {
    // Chromium may clear `dataTransfer.types` on the final leave. The depth is
    // already proof that this drag entered with import data, and is the reliable way
    // to make sure the target cannot remain stuck on screen.
    if (dragDepth.current === 0) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };

  const drop = (event: DragEvent) => {
    if (!carriesLibraryImport(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    if (mix.library.root && !mix.importing) {
      if(event.dataTransfer.files.length) void mix.importDropped(Array.from(event.dataTransfer.files));
      else {
        const video=droppedYoutube(event.dataTransfer);
        if(video) void mix.importYoutube(video);
      }
    }
  };

  return (
    <div
      className="mf-app"
      onDragEnter={dragEnter}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDropCapture={() => { dragDepth.current = 0; setDropping(false); }}
      onDragEnd={() => { dragDepth.current = 0; setDropping(false); }}
      onDrop={drop}
    >
      <Header onSettings={() => setSettingsOpen(true)} mixer={mixer.engine} mix={mix} ready={ready} playView={playView} onSelectView={setPlayView} />
      <main className="mf-body">
        <Library mix={mix} />
        {/* Prep and Play are the same column, so the strip along its bottom
            explains both. It used to live inside the Prep section, which left
            the four-deck mixer — the part of the app with the fewest labels on
            it — as the one place nothing explained itself. */}
        <div className="mf-main">
          {playView && <PlayView mixer={mixer} />}
          <section className="mf-centre" hidden={playView}>
            {mix.phase === 'empty' && <Empty mix={mix} />}
            {mix.phase === 'idle' && <TrackAnalysis key={mix.song?.id} mix={mix} ready={ready} />}
            {mix.phase === 'running' && <Running mix={mix} />}
            {mix.phase === 'ready' && <Lanes mix={mix} />}
          </section>
          <HintFooter resting="Point at anything to read what it does." />
        </div>
      </main>
      <DebugModal mix={mix} />
      {settingsOpen && <SettingsModal mix={mix} mixer={mixer.engine} playView={playView} onClose={() => setSettingsOpen(false)} />}
      {mix.exporting && <ExportModal mix={mix} />}
      {mix.details && <DetailsModal mix={mix} ready={ready} />}
      {dropping && (
        <div className="mf-drop" role="status">
          <span>Drop audio files or a YouTube video link to import</span>
        </div>
      )}
    </div>
  );
}
