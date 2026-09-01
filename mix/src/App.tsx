import { useEffect, useState } from 'react';
import { Detail } from './components/Detail.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { Header } from './components/Header.tsx';
import { Idle } from './components/Idle.tsx';
import { Lanes } from './components/Lanes.tsx';
import { Library } from './components/Library.tsx';
import { Running } from './components/Running.tsx';
import { Status } from './components/Status.tsx';
import { openflow, type Ready } from './openflow.ts';
import { useMix } from './state.ts';
import './App.css';

/**
 * mix[flow]: a library on the left, the open track in the middle, what will be
 * written on the right.
 *
 * The middle is one of three things and never two: a track with no stems is a
 * choice of model, a track being separated is a progress report, and a track
 * with stems is the lanes. Nothing here is a tab, because they are states of
 * one track rather than views of it — you do not choose to be separating.
 *
 * **The lanes are a mockup and say so in the status bar.** The library, the
 * waveforms and the slices are invented in `mock.ts` and `peaks.ts`; the only
 * fact on screen that is real is whether this machine could separate anything,
 * which comes over the context bridge from `electron/demucs.ts`.
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
      <Header mix={mix} />
      <main className="mf-body">
        <Library mix={mix} />
        <section className="mf-centre">
          {mix.phase === 'idle' && <Idle mix={mix} />}
          {mix.phase === 'running' && <Running mix={mix} />}
          {mix.phase === 'ready' && <Lanes mix={mix} />}
        </section>
        <Detail mix={mix} />
      </main>
      <Status mix={mix} ready={ready} />
      {mix.exporting && <ExportModal mix={mix} />}
    </div>
  );
}
