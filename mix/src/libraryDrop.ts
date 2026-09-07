import { normaliseYoutubeUrl } from './youtubeUrl.ts';
import { TRACK_DRAG } from './play/decks.ts';
const LINK_TYPES = ['text/uri-list', 'text/x-moz-url', 'text/plain'];
export function carriesImport(types: readonly string[]): boolean {
  return !types.includes(TRACK_DRAG) && (types.includes('Files') || LINK_TYPES.some(type=>types.includes(type)));
}
/** URI lists may contain comments; Firefox pairs each URL with its title. Prefer URI data over text. */
export function droppedYoutube(data: Pick<DataTransfer, 'getData'>): string | null {
  for (const type of LINK_TYPES) {
    for (const line of data.getData(type).split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue;
      const video=normaliseYoutubeUrl(line);
      if(video) return video;
    }
  }
  return null;
}
