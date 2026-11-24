import type { Song as SongRecord } from '../data/songsData';
import type { Song as ViewSong } from '../types/song';
import { splitSongTitle } from './parseSongs';

function splitIntoStanzas(lyricsText: string): string[][] {
  const lines = lyricsText.replace(/\r\n?/g, '\n').split('\n');
  const stanzas: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const trimmedRight = rawLine.trimEnd();
    if (trimmedRight.trim() === '') {
      if (current.length > 0) {
        stanzas.push(current);
        current = [];
      }
    } else {
      current.push(trimmedRight);
    }
  }

  if (current.length > 0) {
    stanzas.push(current);
  }

  return stanzas;
}

export function sanitizeSongRecord(input: SongRecord): SongRecord {
  return {
    id: input.id,
    title: input.title.replace(/[\r\n]+/g, ' ').trim(),
    lyricist: input.lyricist.replace(/[\r\n]+/g, ' ').trim() || 'Traditional',
    lyrics: input.lyrics.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, ''),
  };
}

export function toViewSong(record: SongRecord): ViewSong {
  const clean = sanitizeSongRecord(record);
  const { malayalamTitle, transliterationTitle } = splitSongTitle(clean.title);

  return {
    number: clean.id,
    title: clean.title,
    malayalamTitle,
    transliterationTitle,
    lyricist: clean.lyricist,
    lyrics: clean.lyrics,
    stanzas: splitIntoStanzas(clean.lyrics),
  };
}

export function toViewSongs(records: SongRecord[]): ViewSong[] {
  return [...records].sort((a, b) => a.id - b.id).map(toViewSong);
}

export function isValidSongRecordList(value: unknown): value is SongRecord[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as SongRecord).id === 'number' &&
      Number.isFinite((item as SongRecord).id) &&
      typeof (item as SongRecord).title === 'string' &&
      typeof (item as SongRecord).lyricist === 'string' &&
      typeof (item as SongRecord).lyrics === 'string'
  );
}

/**
 * Extracts the JSON array assigned to INITIAL_SONGS in src/data/songsData.ts.
 * Uses strict JSON.parse (no eval) and validates every entry.
 */
export function extractSongsFromTsFile(tsContent: string): SongRecord[] | null {
  const cleaned = tsContent.replace(/^\uFEFF/, '');
  const match = cleaned.match(
    /export\s+const\s+INITIAL_SONGS(?:\s*:\s*Song\[\])?\s*=\s*(\[[\s\S]*\])\s*;?/
  );
  if (!match) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!isValidSongRecordList(parsed)) {
      return null;
    }
    return parsed.map(sanitizeSongRecord).sort((a, b) => a.id - b.id);
  } catch {
    return null;
  }
}

/**
 * Re-indexes songs sequentially (1..N) and generates clean src/data/songsData.ts source.
 */
export function reindexSongs(songs: SongRecord[]): SongRecord[] {
  return [...songs]
    .sort((a, b) => a.id - b.id)
    .map((song, idx) => sanitizeSongRecord({ ...song, id: idx + 1 }));
}

export function generateSongsDataTs(songs: SongRecord[]): string {
  const normalized = songs.map(sanitizeSongRecord).sort((a, b) => a.id - b.id);
  return [
    'export interface Song {',
    '  id: number;',
    '  title: string;',
    '  lyricist: string;',
    '  lyrics: string;',
    '}',
    '',
    `export const INITIAL_SONGS: Song[] = ${JSON.stringify(normalized, null, 2)};`,
    '',
  ].join('\n');
}
