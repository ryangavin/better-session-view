import { useState, useSyncExternalStore, type DragEvent } from 'react';
import { MixerView } from '@openflow/widgets/mixer/MixerView.tsx';
import { useTheme } from '@openflow/widgets/theme/ThemeRoot.tsx';
import type { useMixerViewModel } from './useMixerViewModel.ts';
import { TRACK_DRAG } from './decks.ts';
import './play.css';

export function PlayView({ mixer }: { mixer: ReturnType<typeof useMixerViewModel> }) {
  const state = useSyncExternalStore(mixer.engine.subscribe, mixer.engine.snapshot);
  const {colors, deckPairs} = useTheme();
  const [hovered, setHovered] = useState<string | null>(null);
  const accepts = (event: DragEvent) => Array.from(event.dataTransfer.types).includes(TRACK_DRAG);
  return <div className="mf-play">
    <MixerView externalTransport {...mixer} state={state} theme={{primary:colors.primary, signal:colors.signal, stems:colors, decks:Object.fromEntries(state.decks.map((d,i) => [d.id,deckPairs[i]]))}}
      deckProps={id => ({
        'aria-label': `Deck ${id.slice(-1).toUpperCase()} — drop a library track`,
        // The deck as a whole, for the strip. Anything inside it that says
        // something more specific is nearer to the pointer and answers first.
        'data-hint': 'A deck. Drag a track here from the library to load it — loading never starts it playing.',
        className: hovered === id ? 'mf-deck-over' : '',
        onDragOver: event => { if (accepts(event)) {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect='copy'; setHovered(id);} },
        onDragLeave: event => { if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setHovered(null); },
        onDrop: event => { if (!accepts(event)) return; event.preventDefault(); event.stopPropagation(); setHovered(null); void mixer.load(id,event.dataTransfer.getData(TRACK_DRAG)); },
      })}
    />
  </div>;
}
