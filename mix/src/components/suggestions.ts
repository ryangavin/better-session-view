import { useEffect, useState } from 'react';
import { measure } from '../debug/waveforms/measure.ts';
import { sectionSuggestions, type SectionSuggestion } from '../sections.ts';
import type { Mix } from '../state.ts';
import type { Beats } from '../warp.ts';

const channelsOf = (buffer: AudioBuffer) => Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/**
 * Where the song seems to change, for the ruler to offer as cuts while the
 * grid is open: the stems measured once per track, and the suggestions read
 * off that measurement against whatever grid is being edited, so they move
 * with a beat that is dragged. Nothing until the mode is open — the
 * measurement is a walk of every stem, and it is only wanted then.
 */
export function useSuggestions(mix: Mix, grid: Beats, active: boolean): SectionSuggestion[] {
  const [measured, setMeasured] = useState<{ track: string; data: Awaited<ReturnType<typeof measure>> } | null>(null);
  const song = mix.song;
  const audioOf = mix.audioOf;
  useEffect(() => {
    if (!active || !song || !mix.playable || measured?.track === song.id) return;
    const abort = new AbortController();
    const inputs = song.sources.flatMap((id) => {
      const buffer = audioOf(id);
      return buffer ? [{ id, channels: channelsOf(buffer) }] : [];
    });
    void measure(inputs, mix.rate, abort.signal)
      .then((data) => setMeasured({ track: song.id, data }))
      .catch(() => undefined);
    return () => abort.abort();
  }, [active, song, mix.playable, mix.rate, audioOf, measured?.track]);
  if (!active || !measured || measured.track !== song?.id) return [];
  return sectionSuggestions(measured.data, grid);
}
