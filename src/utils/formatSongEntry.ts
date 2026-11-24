import type { Song } from '../types/song';
import { parseSongsFile } from './parseSongs';

export interface NewSongInput {
  number: number;
  title: string;
  lyricist: string;
  lyrics: string;
}

const INDEX_RULE = '====================================================================';
const SONG_RULE = '--------------------------------------------------------------------';

/**
 * Extracts a default title from the first non-empty line of the lyrics,
 * skipping the standalone Malayalam word "പല്ലവി" if it appears alone on line 1.
 */
export function extractDefaultTitleFromLyrics(lyrics: string): string {
  const nonEmptyLines = lyrics
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (nonEmptyLines.length === 0) {
    return '';
  }

  if (/^പല്ലവി\s*:?$/.test(nonEmptyLines[0])) {
    return nonEmptyLines[1] ?? '';
  }

  return nonEmptyLines[0];
}

/**
 * Computes the next song number based on existing parsed songs.
 * Uses totalSongs + 1, stepping past any higher existing number to prevent duplicates.
 */
export function getNextSongNumber(existingNumbers: number[]): number {
  const byCount = existingNumbers.length + 1;
  const maxExisting = existingNumbers.reduce((max, n) => (n > max ? n : max), 0);
  return Math.max(byCount, maxExisting + 1);
}

function sanitizeSongFields(entry: NewSongInput): NewSongInput {
  return {
    number: entry.number,
    title: entry.title.replace(/[\r\n]+/g, ' ').trim(),
    lyricist: entry.lyricist.replace(/[\r\n]+/g, ' ').trim() || 'Traditional',
    lyrics: entry.lyrics.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, ''),
  };
}

function formatIndexLine(entry: Pick<NewSongInput, 'number' | 'title' | 'lyricist'>): string {
  return `${entry.number}. ${entry.title} - Lyricist: ${entry.lyricist}`;
}

function formatSongBlock(entry: NewSongInput): string {
  return [
    `SONG ${entry.number}: ${entry.title}`,
    `Lyricist: ${entry.lyricist}`,
    SONG_RULE,
    '',
    entry.lyrics,
    '',
    `[END OF SONG ${entry.number}]`,
  ].join('\n');
}

/**
 * Serializes a complete list of songs cleanly into the canonical songs.txt format
 * with INDEX at top and SONG X blocks ending with [END OF SONG X].
 */
export function serializeSongsToTxt(
  songs: Array<Pick<Song, 'number' | 'title' | 'lyricist' | 'lyrics'>>
): string {
  const sorted = [...songs]
    .map((s) => sanitizeSongFields(s))
    .sort((a, b) => a.number - b.number);

  const indexLines = sorted.map((s) => formatIndexLine(s));
  const songBlocks = sorted.map((s) => formatSongBlock(s));

  const header = [
    INDEX_RULE,
    'INDEX',
    INDEX_RULE,
    ...indexLines,
    INDEX_RULE,
  ].join('\n');

  if (songBlocks.length === 0) {
    return `${header}\n`;
  }

  return `${header}\n\n\n${songBlocks.join('\n\n\n')}\n`;
}

/**
 * Inserts a new song entry into the INDEX section and appends the formatted
 * SONG X block ending with [END OF SONG X] to the bottom of songs.txt.
 */
export function appendSongToSongsTxt(existingContent: string, entry: NewSongInput): string {
  const normalized = existingContent.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const clean = sanitizeSongFields(entry);

  const newIndexLine = formatIndexLine(clean);
  const newSongBlock = formatSongBlock(clean);

  const lines = normalized.split('\n');

  const indexHeaderIdx = lines.findIndex((line) => /^INDEX\s*$/i.test(line.trim()));
  const firstSongIdx = lines.findIndex((line) => /^SONG\s+\d+\s*:/i.test(line.trim()));
  const searchEnd = firstSongIdx >= 0 ? firstSongIdx : lines.length;

  if (indexHeaderIdx >= 0) {
    let closingSeparatorIdx = -1;
    for (let i = indexHeaderIdx + 1; i < searchEnd; i++) {
      const trimmed = lines[i].trim();
      if (/^={5,}$/.test(trimmed)) {
        if (i === indexHeaderIdx + 1) {
          continue;
        }
        closingSeparatorIdx = i;
        break;
      }
    }

    if (closingSeparatorIdx >= 0) {
      lines.splice(closingSeparatorIdx, 0, newIndexLine);
    } else if (firstSongIdx >= 0) {
      let insertAt = firstSongIdx;
      while (insertAt > indexHeaderIdx + 1 && lines[insertAt - 1].trim() === '') {
        insertAt--;
      }
      lines.splice(insertAt, 0, newIndexLine);
    } else {
      lines.push(newIndexLine);
    }

    return lines.join('\n').trimEnd() + '\n\n\n' + newSongBlock + '\n';
  }

  return serializeSongsToTxt([clean]);
}

/**
 * Updates an existing song by number in songs.txt, keeping INDEX and SONG blocks cleanly aligned.
 */
export function updateSongInSongsTxt(existingContent: string, updated: NewSongInput): string {
  const parsed = parseSongsFile(existingContent);
  const clean = sanitizeSongFields(updated);
  let found = false;

  const nextSongs = parsed.songs.map((song) => {
    if (song.number === clean.number) {
      found = true;
      return clean;
    }
    return {
      number: song.number,
      title: song.title,
      lyricist: song.lyricist,
      lyrics: song.lyrics,
    };
  });

  if (!found) {
    nextSongs.push(clean);
  }

  return serializeSongsToTxt(nextSongs);
}

/**
 * Deletes a song by number from both the INDEX and SONG blocks in songs.txt.
 */
export function deleteSongFromSongsTxt(existingContent: string, songNumber: number): string {
  const parsed = parseSongsFile(existingContent);
  const remaining = parsed.songs
    .filter((song) => song.number !== songNumber)
    .map((song) => ({
      number: song.number,
      title: song.title,
      lyricist: song.lyricist,
      lyrics: song.lyrics,
    }));

  return serializeSongsToTxt(remaining);
}
