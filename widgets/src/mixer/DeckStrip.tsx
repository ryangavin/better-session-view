import { Momentary } from './Momentary.tsx';
import { identityLabel } from '../theme/resolve.ts';
import { type CSSProperties } from 'react';
import { Button } from '../controls/Button.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Knob } from '../controls/Knob.tsx';
import { Slider } from '../controls/Slider.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import type { MixerDeck, MixerViewProps } from './model.ts';
import { FrameMeter } from './frames.tsx';

export function DeckStrip({ deck: d, index, commands, readFrame, theme, params, deckProps }: Pick<MixerViewProps, 'commands' | 'readFrame' | 'theme' | 'params' | 'deckProps'> & { deck: MixerDeck; index: number }) {
  const { level: LEVEL, trim: TRIM, send: SEND, eq: EQ, filter: FILTER } = params;
  const ROUTE = ['A', 'Thru', 'B'];
  const hostProps = deckProps?.(d.id);
  return <div {...hostProps} className={`play-deck ${hostProps?.className ?? ''}`} style={{ ...hostProps?.style, '--play-stems': d.stems.length, '--deck-ink': theme.decks[d.id]?.ink ?? theme.primary } as CSSProperties}>
        <div className="play-track"><b className="play-letter">{d.letter}</b><div><h3>{d.track?.title ?? 'Empty deck'}</h3><p>{d.track?.artist ?? d.message ?? d.status}</p></div><span>{d.track ? `${d.track.bpm === null ? '—' : Math.round(d.track.bpm)} BPM` : '—'}<br />{d.track?.key ?? ''}</span></div>

        <div className="play-performance">
          <fieldset className="play-grid" data-full={d.full} disabled={d.status !== 'ready'}>
          <span className="play-axis">Section</span>{d.stems.map((stem, i) => <span className="play-stem-name" style={{ '--stem-ink': theme.stems[stem.id] ?? theme.primary, '--stem-label': identityLabel(theme.stems[stem.id] ?? theme.primary) } as CSSProperties} key={stem.id}>{stem.name}</span>)}
          {d.sections.map(section => <div className="play-launch-row" key={section.id}>
            {d.full ? <Toggle title="Hot cue: jump to this section and continue playing" on={d.fullSection === section.id} label={`Deck ${index + 1}: launch ${section.name} full mix${d.fullQueued === section.id ? ', queued' : ''}`} onChange={() => commands.launch(d.id, section.id)}>{section.name}</Toggle> : <Button label={`Deck ${index + 1}: launch ${section.name} all stems`} title="Hot cue: jump to this section and continue playing" onPress={() => commands.launch(d.id, section.id)}>{section.name}</Button>}
            {d.stems.map((stem, s) => {
              const active = stem.selected === section.id, queued = stem.queued === section.id;
              return <div className="play-cell" key={stem.id} data-active={active} data-queued={queued} style={{ '--stem-ink': theme.stems[stem.id] ?? theme.primary, '--stem-label': identityLabel(theme.stems[stem.id] ?? theme.primary) } as CSSProperties}>
                <Toggle disabled={d.full || d.status !== 'ready' || !stem.available} on={active} ink={theme.stems[stem.id] ?? theme.primary} title="Loop this section on this stem" width={34} label={`Deck ${index + 1}: ${section.name} ${stem.name}${queued ? ', queued' : active ? ', selected' : ''}`} onChange={() => commands.launch(d.id, section.id, stem.id)}>{queued ? '◷' : active ? '▶' : '▷'}</Toggle>
              </div>;
            })}
          </div>)}
          <Button label={`Deck ${index + 1}: stop all stems`} onPress={() => commands.launch(d.id, null)}>{(d.full ? d.fullQueued === null : d.stems.every(stem => stem.queued === null)) ? '◷ Stop' : 'Stop'}</Button>{d.stems.map((stem, i) => <Button disabled={d.full || d.status !== 'ready' || !stem.available} key={stem.id} label={`Deck ${index + 1}: stop ${stem.name}`} width={34} onPress={() => commands.launch(d.id, null, stem.id)}>■</Button>)}
        </fieldset>
          <div className="play-deck-status">{d.message && <span role="status">{d.message}</span>}</div>
          {commands.setDeckTiming && <div className="play-dj-timing">
            <label>Q <select aria-label={`Deck ${index+1} marker quantize`} value={d.quantize ?? 0} disabled={!d.gridAvailable} onChange={e=>commands.setDeckTiming?.(d.id,'quantize',Number(e.target.value))}>{[0,.125,.25,.5,1,4].map(n=><option key={n} value={n}>{n?`${n} beat`:'Off'}</option>)}</select></label>
            <label>Launch <select aria-label={`Deck ${index+1} launch timing`} value={d.launchBeats ?? 0} disabled={!d.gridAvailable} onChange={e=>commands.setDeckTiming?.(d.id,'launchBeats',Number(e.target.value))}>{[0,1,4].map(n=><option key={n} value={n}>{n===0?'Now':n===4?'Next bar':'Next beat'}</option>)}</select></label>
            {commands.setSlip && <button aria-label={`Deck ${index+1} Slip loops`} aria-pressed={d.slip ?? false} onClick={()=>commands.setSlip?.(d.id,!d.slip)}>Slip loops {d.slip?'on':'off'}</button>}
            <label>Loops <select aria-label={`Deck ${index+1} loop target`} disabled={d.loop?.start!=null && d.loop.end===null} value={d.loopFocus?'focus':'deck'} onChange={e=>commands.setLoopFocus?.(d.id,e.target.value==='focus')}><option value="deck">Active stems</option><option value="focus">Focus only</option></select></label>
          </div>}
          <div className="play-deck-loops" role="group" aria-label={`Deck ${index + 1} loop`}>
            <Button disabled={d.status !== 'ready' || !commands.deckLoopIn} label={`Deck ${index + 1} loop in`} title="Mark loop start at this deck’s current position" onPress={() => commands.deckLoopIn?.(d.id)}>In</Button>
            <Button disabled={!d.canLoopOut || !commands.deckLoopOut} label={`Deck ${index + 1} loop out`} title="Mark loop end and repeat" onPress={() => commands.deckLoopOut?.(d.id)}>Out</Button>
            <Toggle disabled={d.status !== 'ready' || d.loop?.end == null || !commands.setDeckLoopEnabled} on={d.loop?.enabled ?? false} label={`Deck ${index + 1} loop enabled`} title="Exit this deck’s loops, or re-engage its saved loop regions" onChange={on => commands.setDeckLoopEnabled?.(d.id,on)}>{d.loop?.enabled ? 'Exit loop' : d.loop?.start != null && d.loop.end == null ? 'Set Out…' : d.loop?.end != null ? 'Reloop' : 'Loop'}</Toggle>
          </div>
          {commands.quickLoop && <div className="play-dj-timing" role="group" aria-label={`Deck ${index+1} quick loops`}>
            <select aria-label={`Deck ${index+1} loop length`} value={d.loopBeats ?? 16} disabled={!d.gridAvailable} onChange={e=>commands.setDeckTiming?.(d.id,'loopBeats',Number(e.target.value))}>{[.25,.5,1,2,4,8,16,32,64].map(n=><option key={n} value={n}>{n} beats{n===16?' · 4 bars (4/4)':''}</option>)}</select>
            <button disabled={!d.gridAvailable} onClick={()=>commands.quickLoop?.(d.id)}>{d.loop?.enabled?'Exit quick loop':'Quick loop'}</button>
            <button disabled={!d.loop?.enabled || !d.gridAvailable} aria-label={`Deck ${index+1} halve loop`} onClick={()=>commands.resizeLoop?.(d.id,.5)}>½</button><button disabled={!d.loop?.enabled || !d.gridAvailable} aria-label={`Deck ${index+1} double loop`} onClick={()=>commands.resizeLoop?.(d.id,2)}>2×</button>
            <button disabled={!d.loop?.enabled || !d.gridAvailable} aria-label={`Deck ${index+1} move loop back`} onClick={()=>commands.moveLoop?.(d.id,-1)}>← beat</button><button disabled={!d.loop?.enabled || !d.gridAvailable} aria-label={`Deck ${index+1} move loop ahead`} onClick={()=>commands.moveLoop?.(d.id,1)}>beat →</button>
            {(['in','out'] as const).map(boundary=><span key={boundary}>{boundary.toUpperCase()} <button disabled={!d.loop?.enabled || !d.gridAvailable} aria-label={`Deck ${index+1} ${boundary} earlier`} onClick={()=>commands.adjustLoop?.(d.id,boundary,-(d.quantize || .125))}>−</button><button disabled={!d.loop?.enabled || !d.gridAvailable} aria-label={`Deck ${index+1} ${boundary} later`} onClick={()=>commands.adjustLoop?.(d.id,boundary,d.quantize || .125)}>+</button></span>)}
          </div>}


        </div>
        <div className="play-effects">
          <Knob ink="var(--amber)" name="FX A" label={`Deck ${index + 1} effects send A`} param={SEND} value={d.sendA} onChange={value => commands.setDeck(d.id, 'sendA', value)} />
          <Knob ink="var(--amber)" name="Filter" label={`Deck ${index + 1} filter`} param={FILTER} value={d.filter} onChange={value => commands.setDeck(d.id, 'filter', value)} />
          <Knob ink="var(--amber)" name="FX B" label={`Deck ${index + 1} effects send B`} param={SEND} value={d.sendB} onChange={value => commands.setDeck(d.id, 'sendB', value)} />
        </div>
        <div className="play-channel">
          <div className="play-eq-stack play-stem-levels" data-full={d.full}>
            {d.stems.map((stem, i) => <div key={stem.id} style={{ '--stem-label': identityLabel(theme.stems[stem.id] ?? theme.primary) } as CSSProperties}><Knob disabled={d.full || d.status !== 'ready' || !stem.available} name={stem.name} label={`Deck ${index + 1} ${stem.name} level`} param={params.stemLevel ?? LEVEL} value={stem.level} onChange={value => commands.setStemLevel(d.id, stem.id, value)} ink={theme.stems[stem.id] ?? theme.primary} /></div>)}
          </div>
          <div className="play-level-stack">
          <div className="play-channel-fader"><Slider name="" label={`Deck ${index + 1} level`} param={LEVEL} value={d.gain} onChange={value => commands.setDeck(d.id, 'gain', value)} length={210} />
          <FrameMeter label={`Deck ${index + 1} output`} sample={() => readFrame().decks[d.id]?.level ?? 0} /></div></div>
          <div className="play-eq-stack">
            <Knob className="play-trim" ink="var(--amber)" name="Trim" label={`Deck ${index + 1} trim`} param={TRIM} value={d.trim} onChange={value => commands.setDeck(d.id, 'trim', value)} />
            {['High', 'Mid', 'Low'].map((name, e) => <Knob key={name} name={name} label={`Deck ${index + 1} ${name}`} param={EQ} origin="center" value={d.eq[e]} onChange={value => commands.setDeckEq(d.id, e, value)} />)}
          </div>
        </div>
        <div className="play-route"><Toggle on={d.cue} onChange={value => commands.setDeck(d.id, 'cue', value)} width={45} label={`Deck ${index + 1} headphone cue`}>Phones</Toggle><Segmented name="" label={`Deck ${index + 1} crossfade assignment`} items={ROUTE} index={d.route} onChange={value => commands.setDeck(d.id, 'route', value)} /><Toggle on={d.full} width={44} label={`Deck ${index + 1} original full mix`} title="Use the original unseparated track instead of stems" onChange={value => commands.setDeck(d.id, 'full', value)}>Full</Toggle></div>
        <div className="play-deck-transport" role="group" aria-label={`Deck ${index + 1} transport`}>
          <Toggle width={44} className="play-transport-button" on={d.playing ?? false} disabled={d.status !== 'ready' || !commands.setDeckPlaying} label={`Deck ${index + 1} play/pause`} title={commands.setDeckPlaying ? 'Play / Pause' : 'Deck playback is not connected yet'} onChange={playing => commands.setDeckPlaying?.(d.id, d.cueHeld ? true : playing)}>{d.playing ? 'Ⅱ' : '▶'}</Toggle>
          <Momentary held={d.cueHeld ?? false} disabled={d.status !== 'ready' || !commands.cueDeck} label={`Deck ${index + 1} transport cue`} onHold={held => commands.cueDeck?.(d.id, held)} onTakeover={()=>commands.setDeckPlaying?.(d.id,true)}>Cue deck</Momentary>
          <Toggle width={44} className="play-transport-button" on={d.synced ?? false} disabled={d.status !== 'ready' || !commands.setDeckSync} label={`Deck ${index + 1} sync`} title={commands.setDeckSync ? 'Sync deck to the shared tempo and beat' : 'Deck playback is not connected yet'} onChange={synced => commands.setDeckSync?.(d.id, synced)}>Sync</Toggle>
        </div>
      </div>;
}
