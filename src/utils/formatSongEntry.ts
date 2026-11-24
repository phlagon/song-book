export interface NewSongInput {
  number: number;
  title: string;
  lyricist: string;
  lyrics: string;
}

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

/**
 * Inserts a new song entry into the INDEX section and appends the formatted
 * SONG X block ending with [END OF SONG X] to the bottom of songs.txt.
 */
export function appendSongToSongsTxt(existingContent: string, entry: NewSongInput): string {
  const normalized = existingContent.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cleanTitle = entry.title.replace(/[\r\n]+/g, ' ').trim();
  const cleanLyricist = (entry.lyricist.replace(/[\r\n]+/g, ' ').trim()) || 'Traditional';
  const cleanLyrics = entry.lyrics
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '');

  const newIndexLine = `${entry.number}. ${cleanTitle} - Lyricist: ${cleanLyricist}`;

  const newSongBlock = [
    `SONG ${entry.number}: ${cleanTitle}`,
    `Lyricist: ${cleanLyricist}`,
    '--------------------------------------------------------------------',
    '',
    cleanLyrics,
    '',
    `[END OF SONG ${entry.number}]`,
  ].join('\n');

  const lines = normalized.split('\n');

  // Find INDEX header line and the first SONG block line
  const indexHeaderIdx = lines.findIndex((line) => /^INDEX\s*$/i.test(line.trim()));
  const firstSongIdx = lines.findIndex((line) => /^SONG\s+\d+\s*:/i.test(line.trim()));
  const searchEnd = firstSongIdx >= 0 ? firstSongIdx : lines.length;

  let updatedText: string;

  if (indexHeaderIdx >= 0) {
    // Look for the closing ==== separator after the INDEX header (skipping an immediate underline right below INDEX)
    let closingSeparatorIdx = -1;
    for (let i = indexHeaderIdx + 1; i < searchEnd; i++) {
      const trimmed = lines[i].trim();
      if (/^={5,}$/.test(trimmed)) {
        // Skip separator directly underneath INDEX header (i === indexHeaderIdx + 1)
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
      // Insert just before the first song block with a clean separator
      let insertAt = firstSongIdx;
      while (insertAt > indexHeaderIdx + 1 && lines[insertAt - 1].trim() === '') {
        insertAt--;
      }
      lines.splice(insertAt, 0, newIndexLine);
    } else {
      lines.push(newIndexLine);
    }

    updatedText = lines.join('\n').trimEnd() + '\n\n\n' + newSongBlock + '\n';
  } else {
    // File was empty or had no INDEX header; initialize full songs.txt structure
    updatedText = [
      '====================================================================',
      'INDEX',
      '====================================================================',
      newIndexLine,
      '====================================================================',
      '',
      '',
      newSongBlock,
      '',
    ].join('\n');
  }

  return updatedText;
}
