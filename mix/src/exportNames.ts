/**
 * What an export is called on disk, shared by the main process that writes
 * it and the dialog that says where it is going — so the dialog never names
 * a folder the export does not write.
 */

/** A file name Finder and Live will both take: no separators, no colons, one line. */
export const tidy = (text: string): string => text.replace(/[/\\:]+/g, '-').replace(/\s+/g, ' ').trim() || 'untitled';

/** `128`, or `128.055` for a tempo that was kept exact. */
export const tempoLabel = (bpm: number): string => (Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(3));

/** `Some Chords 128bpm`: the folder a track's stems go out under, named for the tempo so Live reads it off the file. */
export const folderOf = (title: string, to: number): string => `${tidy(title)} ${tempoLabel(to)}bpm`;
