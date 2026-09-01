import { useEffect, useState } from 'react';
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
 * **The library and the separation are real; the waveforms are not.** The tracks
 * come from a folder on disk through `electron/library.ts`, and pressing
 * Generate runs Demucs against the file and writes stems back into that folder
 * — `docs/stems.md`. What is still invented is `peaks.ts`, because nothing here
 * has decoded the stems that were written: the lanes draw an envelope with the
 * shape of real audio rather than the audio itself. So are the slices. Which of
 * those is which is marked at every point it matters.
 */
export function App() {
  const mix = useMix();
  const [ready, setReady] = useState<Ready | null>(null);

  useEffect(() => {
    const bridge = openflow();
    if (!bridge) {
      setReady({ ok: false, says: 'no app around this page', workspace: '—' });
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
  // in it, and it must not fire while they are naming a slice.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== ' ' || target?.tagName === 'INPUT') return;
      e.preventDefault();
      mix.setPlaying(!mix.playing);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [mix.playing, mix.setPlaying]);

  return (
    <div className="mf-app">
      <Header mix={mix} ready={ready} />
      <main className="mf-body">
        <Library mix={mix} />
        <section className="mf-centre">
          {mix.phase === 'empty' && <Empty mix={mix} />}
          {mix.phase === 'idle' && <Idle mix={mix} />}
          {mix.phase === 'running' && <Running mix={mix} />}
          {mix.phase === 'ready' && <Lanes mix={mix} />}
        </section>
      </main>
      {mix.exporting && <ExportModal mix={mix} />}
    </div>
  );
}
