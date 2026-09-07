import { useState, type DragEvent } from 'react';
import { MixerView } from '@openflow/widgets/mixer/MixerView.tsx';
import { useTheme } from '@openflow/widgets/theme/ThemeRoot.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import type { Track } from '../openflow.ts';
import type { useMixerViewModel } from './useMixerViewModel.ts';
import { TRACK_DRAG } from './decks.ts';
import './play.css';

export function PlayView({ mixer, tracks }: { mixer: ReturnType<typeof useMixerViewModel>; tracks: readonly Track[] }) {
  const {colors, deckPairs} = useTheme();
  const [hovered, setHovered] = useState<string | null>(null);
  const accepts = (event: DragEvent) => Array.from(event.dataTransfer.types).includes(TRACK_DRAG);
  return <div className="mf-play">
    <MixerView {...mixer} theme={{primary:colors.primary, signal:colors.signal, stems:colors, decks:Object.fromEntries(mixer.state.decks.map((d,i) => [d.id,deckPairs[i]]))}}
      deckProps={id => ({
        'aria-label': `Deck ${id.slice(-1).toUpperCase()} — drop a library track`,
        className: hovered === id ? 'mf-deck-over' : '',
        onDragOver: event => { if (accepts(event)) {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect='copy'; setHovered(id);} },
        onDragLeave: event => { if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setHovered(null); },
        onDrop: event => { if (!accepts(event)) return; event.preventDefault(); event.stopPropagation(); setHovered(null); void mixer.load(id,event.dataTransfer.getData(TRACK_DRAG)); },
      })}
      deckLoadControl={id => <Select label={`Load track into deck ${id.slice(-1).toUpperCase()}`} items={['Load track…', ...tracks.map(t => t.title)]} index={0} width={100} onChange={i => {if (tracks[i-1]) void mixer.load(id,tracks[i-1].id);}} />}
    />
  </div>;
}
