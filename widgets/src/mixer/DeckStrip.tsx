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
            {d.full ? <Toggle hint="Jumps this deck to that part of the song and keeps playing. It waits for the next bar unless launch timing is set to Now." title="Hot cue: jump to this section and continue playing" on={d.fullSection === section.id} label={`Deck ${index + 1}: launch ${section.name} full mix${d.fullQueued === section.id ? ', queued' : ''}`} onChange={() => commands.launch(d.id, section.id)}>{section.name}</Toggle> : <Button hint="Jumps every stem on this deck to that part of the song and keeps playing. It waits for the next bar unless launch timing is set to Now." label={`Deck ${index + 1}: launch ${section.name} all stems`} title="Hot cue: jump to this section and continue playing" onPress={() => commands.launch(d.id, section.id)}>{section.name}</Button>}
            {d.stems.map((stem, s) => {
              const active = stem.selected === section.id, queued = stem.queued === section.id;
              return <div className="play-cell" key={stem.id} data-active={active} data-queued={queued} style={{ '--stem-ink': theme.stems[stem.id] ?? theme.primary, '--stem-label': identityLabel(theme.stems[stem.id] ?? theme.primary) } as CSSProperties}>
                <Toggle disabled={d.full || d.status !== 'ready' || !stem.available} on={active} ink={theme.stems[stem.id] ?? theme.primary} hint={`Loops that part of the song on ${stem.name.toLowerCase()} alone. The deck's other stems stay wherever they are, which is how a part is built up piece by piece.`} title="Loop this section on this stem" width={34} label={`Deck ${index + 1}: ${section.name} ${stem.name}${queued ? ', queued' : active ? ', selected' : ''}`} onChange={() => commands.launch(d.id, section.id, stem.id)}>{queued ? '◷' : active ? '▶' : '▷'}</Toggle>
              </div>;
            })}
          </div>)}
          <Button label={`Deck ${index + 1}: stop all stems`} hint="Stops every stem on this deck at the next launch point. The other decks carry on." onPress={() => commands.launch(d.id, null)}>{(d.full ? d.fullQueued === null : d.stems.every(stem => stem.queued === null)) ? '◷ Stop' : 'Stop'}</Button>{d.stems.map((stem, i) => <Button disabled={d.full || d.status !== 'ready' || !stem.available} key={stem.id} hint={`Stops ${stem.name.toLowerCase()} on this deck and leaves its other stems playing.`} label={`Deck ${index + 1}: stop ${stem.name}`} width={34} onPress={() => commands.launch(d.id, null, stem.id)}>■</Button>)}
        </fieldset>
          <div className="play-deck-status">{d.message && <span role="status">{d.message}</span>}</div>
          <div className="play-deck-loops" role="group" aria-label={`Deck ${index + 1} loop`}>
            <Button disabled={d.status !== 'ready' || !d.playing || !commands.deckLoopIn} label={`Deck ${index + 1} loop in`} hint="Marks the start of a loop where this deck is playing now. Press Out to close it and the deck begins repeating." title="Mark loop start at this deck’s current position" onPress={() => commands.deckLoopIn?.(d.id)}>In</Button>
            <Button disabled={!d.canLoopOut || !commands.deckLoopOut} label={`Deck ${index + 1} loop out`} hint="Closes the loop here and starts it repeating." title="Mark loop end and repeat" onPress={() => commands.deckLoopOut?.(d.id)}>Out</Button>
            <Toggle disabled={d.status !== 'ready' || d.loop?.end == null || !commands.setDeckLoopEnabled} on={d.loop?.enabled ?? false} label={`Deck ${index + 1} loop enabled`} hint="Leaves the loop and plays on, or drops back into the loop this deck has saved. The loop is kept either way." title="Exit this deck’s loops, or re-engage its saved loop regions" onChange={on => commands.setDeckLoopEnabled?.(d.id,on)}>{d.loop?.enabled ? 'Exit loop' : d.loop?.start != null && d.loop.end == null ? 'Set Out…' : d.loop?.end != null ? 'Reloop' : 'Loop'}</Toggle>
          </div>

        </div>
        <div className="play-effects">
          <Knob ink="var(--amber)" name="FX A" hint="How much of this deck reaches the shared FX A effect. Taken after the fader, so it falls away as you fade the deck out." label={`Deck ${index + 1} effects send A`} param={SEND} value={d.sendA} onChange={value => commands.setDeck(d.id, 'sendA', value)} />
          <Knob ink="var(--amber)" name="Filter" hint="Sweeps a filter across this deck. Left takes the top off, right takes the bottom out, and the middle is untouched." label={`Deck ${index + 1} filter`} param={FILTER} value={d.filter} onChange={value => commands.setDeck(d.id, 'filter', value)} />
          <Knob ink="var(--amber)" name="FX B" hint="How much of this deck reaches the shared FX B effect. Taken after the fader, so it falls away as you fade the deck out." label={`Deck ${index + 1} effects send B`} param={SEND} value={d.sendB} onChange={value => commands.setDeck(d.id, 'sendB', value)} />
        </div>
        <div className="play-channel">
          <div className="play-eq-stack play-stem-levels" data-full={d.full}>
            {d.stems.map((stem, i) => <div key={stem.id} style={{ '--stem-label': identityLabel(theme.stems[stem.id] ?? theme.primary) } as CSSProperties}><Knob disabled={d.full || d.status !== 'ready' || !stem.available} name={stem.name} hint={`How loud ${stem.name.toLowerCase()} is inside this deck, before the deck fader. Turn it down to play the song without it.`} label={`Deck ${index + 1} ${stem.name} level`} param={params.stemLevel ?? LEVEL} value={stem.level} onChange={value => commands.setStemLevel(d.id, stem.id, value)} ink={theme.stems[stem.id] ?? theme.primary} /></div>)}
          </div>
          <div className="play-level-stack">
          <div className="play-channel-fader"><Slider name="" hint="This deck's level in the mix. The top of its travel is unity, so it only ever takes away — Trim is where a quiet track gets louder." label={`Deck ${index + 1} level`} param={LEVEL} value={d.gain} onChange={value => commands.setDeck(d.id, 'gain', value)} length={210} />
          <FrameMeter label={`Deck ${index + 1} output`} sample={() => readFrame().decks[d.id]?.level ?? 0} /></div></div>
          <div className="play-eq-stack">
            <Knob className="play-trim" ink="var(--amber)" name="Trim" hint="Lifts or cuts the deck before everything else, up to 12 dB either way. This is what matches a quiet record to a loud one, not the fader." label={`Deck ${index + 1} trim`} param={TRIM} value={d.trim} onChange={value => commands.setDeck(d.id, 'trim', value)} />
            {['High', 'Mid', 'Low'].map((name, e) => <Knob key={name} name={name} hint={`Lifts or cuts this deck's ${name.toLowerCase()} band. It rests at 0 dB, which is the record as it was, and cuts much further than it lifts.`} label={`Deck ${index + 1} ${name}`} param={EQ} origin="center" value={d.eq[e]} onChange={value => commands.setDeckEq(d.id, e, value)} />)}
          </div>
        </div>
        <div className="play-route"><Toggle on={d.cue} onChange={value => commands.setDeck(d.id, 'cue', value)} width={45} hint="Sends this deck to the headphones only. It is taken before the fader and the crossfader, so you can hear a deck the audience cannot." label={`Deck ${index + 1} headphone cue`}>Phones</Toggle><Segmented name="" hint="Which side of the crossfader this deck answers to. Thru takes it off the crossfader altogether, so it plays wherever the crossfader sits." label={`Deck ${index + 1} crossfade assignment`} items={ROUTE} index={d.route} onChange={value => commands.setDeck(d.id, 'route', value)} /><Toggle on={d.full} width={44} label={`Deck ${index + 1} original full mix`} hint="Plays the original recording instead of its separated stems. The stem controls go quiet, since there are no stems to move." title="Use the original unseparated track instead of stems" onChange={value => commands.setDeck(d.id, 'full', value)}>Full</Toggle></div>
        <div className="play-deck-transport" role="group" aria-label={`Deck ${index + 1} transport`}>
          <Toggle width={44} className="play-transport-button" on={d.playing ?? false} disabled={d.status !== 'ready' || !commands.setDeckPlaying} label={`Deck ${index + 1} play/pause`} hint="Plays or pauses this deck on its own, from where it left off. The header's play button moves every loaded deck at once." title={commands.setDeckPlaying ? 'Play / Pause' : 'Deck playback is not connected yet'} onChange={playing => commands.setDeckPlaying?.(d.id, d.cueHeld ? true : playing)}>{d.playing ? 'Ⅱ' : '▶'}</Toggle>
          <Toggle width={44} className="play-transport-button" momentary on={d.cueHeld ?? false} disabled={d.status !== 'ready' || !commands.cueDeck} label={`Deck ${index + 1} transport cue`} title={commands.cueDeck ? 'Return to cue; hold to audition' : 'Deck playback is not connected yet'} onChange={held => commands.cueDeck?.(d.id, held)}>Cue</Toggle>
          <Toggle width={44} className="play-transport-button" on={d.synced ?? false} disabled={d.status !== 'ready' || !commands.setDeckSync} label={`Deck ${index + 1} sync`} hint="Holds this deck to the shared tempo and to the beat the other decks are on. It needs a saved beat grid to know where its beats are; without one the deck plays at the speed it was recorded." title={commands.setDeckSync ? 'Sync deck to the shared tempo and beat' : 'Deck playback is not connected yet'} onChange={synced => commands.setDeckSync?.(d.id, synced)}>Sync</Toggle>
        </div>
      </div>;
}
