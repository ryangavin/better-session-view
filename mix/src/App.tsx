import { useEffect, useState } from 'react';
import { openflow, type Ready } from './openflow.ts';

/**
 * The window, as far as it goes.
 *
 * mix[flow] separates a mix into stems, and none of that is here yet. What is
 * here is the one thing the app can already answer honestly — whether this
 * machine could do it — asked over the same path a separation will use: the
 * renderer asks, the preload carries it, the main process runs a process, and
 * the answer comes back. When the job runner lands it replaces this call, not
 * the plumbing under it.
 */
export function App() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [asking, setAsking] = useState(true);

  useEffect(() => {
    const bridge = openflow();
    if (!bridge) {
      // A browser, not the app. Say so rather than reporting a machine that
      // cannot separate anything.
      setReady({ ok: false, says: 'no app around this page', workspace: '—' });
      setAsking(false);
      return;
    }
    let live = true;
    void bridge.demucs().then((answer) => {
      if (!live) return;
      setReady(answer);
      setAsking(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className="shell">
      <header>
        <h1>mix[flow]</h1>
        <p>A mix in, four parts out.</p>
      </header>

      <section className="status" data-state={asking ? 'asking' : ready?.ok ? 'ready' : 'missing'}>
        <span className="dot" aria-hidden="true" />
        <div>
          <p className="says">{asking ? 'looking for demucs…' : (ready?.says ?? '')}</p>
          {!asking && <p className="where">{ready?.workspace}</p>}
        </div>
      </section>

      <footer>
        <p>Separation is not wired up yet — see mix/docs/demucs.md.</p>
      </footer>
    </main>
  );
}
