import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../src/controls/Button.tsx';
import { Select } from '../src/controls/Select.tsx';
import { Toggle } from '../src/controls/Toggle.tsx';
import { inkOf, timeOf, xOf, type View } from '../src/debug/index.ts';
import { Facts } from '../src/debug/Facts.tsx';
import { Group, Harness, Shelf, Status, Toolbar } from '../src/debug/Harness.tsx';
import { Legend } from '../src/debug/Legend.tsx';
import { Plot } from '../src/debug/Plot.tsx';
import { Scope, ScopeRow } from '../src/debug/Scope.tsx';
import { Transport } from '../src/debug/Transport.tsx';
import { useAxis } from '../src/debug/useAxis.ts';
import { useRemembered } from '../src/debug/useRemembered.ts';

/**
 * A harness with nothing under it: a made-up signal, beats every half second,
 * a head that runs on the wall clock. Everything a real one has except a
 * subject, so the frame, the scope, the plots and the transport can be looked
 * at without an app around them.
 */
const SECONDS = 90;
const BPM = 120;
const BEAT = 60 / BPM;

export function DebugCase() {
  const axis = useAxis({ seconds: SECONDS, initial: { from: 0, to: 12 } });
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState(0);
  const [click, setClick] = useRemembered('bench-click', true);
  const [which, setWhich] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // The head runs from the cursor on the wall clock while playing.
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const from = axis.cursor;
    let frame = 0;
    const tick = () => {
      const at = from + (performance.now() - started) / 1000;
      if (at >= SECONDS) {
        setPlaying(false);
        return;
      }
      setHead(at);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, axis.cursor]);

  const drawRuler = useCallback((g: CanvasRenderingContext2D, v: View) => {
    const el = box.current;
    g.fillStyle = inkOf(el, 'caption');
    g.font = '9px system-ui';
    const step = v.to - v.from > 30 ? 10 : 1;
    for (let s = Math.ceil(v.from / step) * step; s <= v.to; s += step) {
      const x = Math.round(xOf(v, s)) + 0.5;
      g.fillRect(x, v.height - 6, 1, 6);
      g.fillText(`${s}s`, x + 2, v.height - 8);
    }
  }, []);

  const drawWave = useCallback((g: CanvasRenderingContext2D, v: View) => {
    g.strokeStyle = inkOf(box.current, 'cool');
    g.beginPath();
    for (let x = 0; x < v.width; x++) {
      const t = timeOf(v, x);
      const env = Math.exp(-((t % BEAT) / BEAT) * 4);
      const y = v.height / 2 + Math.sin(t * 220) * env * (v.height / 2 - 2);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }, []);

  const drawBeats = useCallback((g: CanvasRenderingContext2D, v: View) => {
    const el = box.current;
    for (let i = Math.ceil(v.from / BEAT); i * BEAT <= v.to; i++) {
      const x = Math.round(xOf(v, i * BEAT)) + 0.5;
      const down = i % 4 === 0;
      g.strokeStyle = inkOf(el, down ? 'strong' : 'good');
      g.beginPath();
      g.moveTo(x, down ? 0 : v.height / 2);
      g.lineTo(x, v.height);
      g.stroke();
    }
  }, []);

  const drawPlot = useCallback((g: CanvasRenderingContext2D, w: number, h: number, hover: number | null) => {
    const el = box.current;
    g.strokeStyle = inkOf(el, 'fill');
    g.beginPath();
    for (let x = 0; x < w; x++) {
      const bpm = 70 + (x / w) * 120;
      const y = h - 4 - (h - 8) * Math.exp(-Math.pow((bpm - BPM) / 6, 2));
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    if (hover !== null) {
      g.strokeStyle = inkOf(el, 'caption');
      g.beginPath();
      g.moveTo(hover + 0.5, 0);
      g.lineTo(hover + 0.5, h);
      g.stroke();
    }
  }, []);

  const facts = useMemo(
    () => [
      { name: 'tempo', value: `${BPM} bpm`, tone: 'good' as const },
      { name: 'beats', value: Math.floor(SECONDS / BEAT) },
      { name: 'agreement', value: '97%' },
      { name: 'arm', value: 'made up', tone: 'quiet' as const },
    ],
    [],
  );

  return (
    <div ref={box} style={{ height: 420, border: '1px solid var(--wdg-edge)' }}>
      <Harness
        title="scope"
        subject={<Select items={['a made-up signal', 'the same, again']} index={which} onChange={setWhich} width={140} label="subject" />}
        status={<Status tone="good">120 bpm from 1.1.1, straight</Status>}
      >
        <Toolbar>
          <Group caption="listen">
            <Transport playing={playing} onToggle={() => setPlaying((on) => !on)} at={playing ? head : axis.cursor} latency={0.012} />
            <Toggle on={click} onChange={setClick} width={40}>
              click
            </Toggle>
          </Group>
          <Group caption="view">
            <Button onPress={axis.whole}>whole</Button>
            <Button onPress={() => axis.setLoop(null)} disabled={!axis.loop}>
              clear loop
            </Button>
            <Button onPress={() => axis.loop && axis.frame(axis.loop)} disabled={!axis.loop}>
              frame loop
            </Button>
          </Group>
        </Toolbar>
        <Facts items={facts} />
        <Scope axis={axis} head={playing ? head : undefined}>
          <ScopeRow label="time" height={22} draw={drawRuler} ruler />
          <ScopeRow
            label="signal"
            height={70}
            draw={drawWave}
            legend={<Legend items={[{ kind: 'swatch', ink: 'var(--blue)', label: 'a decaying tone' }]} />}
          />
          <ScopeRow
            label="beats"
            height={36}
            draw={drawBeats}
            legend={
              <Legend
                items={[
                  { kind: 'line', ink: 'var(--green)', label: 'beat' },
                  { kind: 'tall', ink: 'var(--fg)', label: 'downbeat' },
                ]}
              />
            }
          />
        </Scope>
        <Shelf>
          <Plot title="tempo sweep" draw={drawPlot} caption={`bottom of the curve at ${BPM} bpm`} height={90} />
        </Shelf>
      </Harness>
    </div>
  );
}
