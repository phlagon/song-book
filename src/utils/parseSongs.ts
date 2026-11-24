import type { IndexEntry, ParsedSongFile, Song, SongSearchResult } from '../types/song';

const MALAYALAM_RANGE_REGEX = /[\u0D00-\u0D7F]/;

/**
 * Normalizes Malayalam Unicode (including legacy chillu representations using ZWJ)
 * and Latin case/whitespace so search works reliably across all keyboards.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFC')
    .replace(/ണ\u0D4D\u200D/g, 'ൺ')
    .replace(/ന\u0D4D\u200D/g, 'ൻ')
    .replace(/ര\u0D4D\u200D/g, 'ർ')
    .replace(/ല\u0D4D\u200D/g, 'ൽ')
    .replace(/ള\u0D4D\u200D/g, 'ൾ')
    .replace(/ക\u0D4D\u200D/g, 'ൿ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a combined title such as:
 * "Yeshuvinte Naamame (യേശുവിന്റെ നാമമേ)" or "യേശുവിന്റെ നാമമേ (Yeshuvinte Naamame)"
 * into clean Malayalam and English transliteration parts for display.
 */
export function splitSongTitle(rawTitle: string): {
  malayalamTitle: string;
  transliterationTitle: string;
} {
  const cleaned = rawTitle.trim();
  const parenMatch = cleaned.match(/^(.*?)\s*\(([^)]+)\)\s*$/);

  if (parenMatch) {
    const outer = parenMatch[1].trim();
    const inner = parenMatch[2].trim();
    const outerHasMl = MALAYALAM_RANGE_REGEX.test(outer);
    const innerHasMl = MALAYALAM_RANGE_REGEX.test(inner);

    if (innerHasMl && !outerHasMl) {
      return { malayalamTitle: inner, transliterationTitle: outer };
    }
    if (outerHasMl && !innerHasMl) {
      return { malayalamTitle: outer, transliterationTitle: inner };
    }
  }

  if (MALAYALAM_RANGE_REGEX.test(cleaned)) {
    return { malayalamTitle: cleaned, transliterationTitle: '' };
  }

  return { malayalamTitle: '', transliterationTitle: cleaned };
}

/**
 * Parses the top INDEX section (if present) as a metadata reference.
 * Supports both:
 *  - "1. Song Title – Lyricist Name"
 *  - "1. Song Title - Lyricist: Lyricist Name"
 */
function parseIndexSection(indexText: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const lines = indexText.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^={5,}$/.test(line) || /^-{5,}$/.test(line) || /^INDEX$/i.test(line)) {
      continue;
    }

    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match) continue;

    const number = parseInt(match[1], 10);
    const rest = match[2].trim();

    let title = rest;
    let lyricist = '';

    // Format A: "Title - Lyricist: Name" or "Title – Lyricist: Name"
    const explicitLyricist = rest.match(/^(.*?)\s*[-–—]\s*Lyricist\s*:\s*(.+)$/i);
    if (explicitLyricist) {
      title = explicitLyricist[1].trim();
      lyricist = explicitLyricist[2].trim();
    } else {
      // Format B: "Title – Lyricist Name" (en-dash / em-dash / spaced hyphen)
      const dashSplit = rest.match(/^(.*?)\s+[–—-]\s+(.+)$/);
      if (dashSplit) {
        title = dashSplit[1].trim();
        lyricist = dashSplit[2].trim();
      }
    }

    entries.push({ number, title, lyricist });
  }

  return entries;
}

/**
 * Splits raw lyrics text into stanzas (arrays of non-empty lines),
 * preserving intentional stanza breaks while collapsing extra blank lines cleanly.
 */
function splitIntoStanzas(lyricsText: string): string[][] {
  const lines = lyricsText.split('\n');
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

/**
 * Parses songs.txt strictly following the specified structure:
 * - Top INDEX section followed by ====== separator
 * - Song blocks starting with `SONG [Number]: [Title]`
 * - Optional `Lyricist: [Name]`
 * - Optional `Lyrics:` header and/or `------` separator line
 * - Malayalam lyrics across stanzas
 * - Strictly terminated by `[END OF SONG X]` or `***[END OF SONG X]***`
 */
export function parseSongsFile(rawContent: string): ParsedSongFile {
  const content = rawContent.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  // Locate where the first SONG block begins to isolate the INDEX section cleanly
  const firstSongMatch = content.match(/^SONG\s+\d+\s*:/im);
  const indexRaw = firstSongMatch && firstSongMatch.index !== undefined
    ? content.slice(0, firstSongMatch.index)
    : content;

  const indexEntries = parseIndexSection(indexRaw);
  const indexMap = new Map<number, IndexEntry>();
  for (const entry of indexEntries) {
    indexMap.set(entry.number, entry);
  }

  const songs: Song[] = [];
  const songStartRegex = /^SONG\s+(\d+)\s*:\s*(.+)$/gim;
  const startMatches = Array.from(content.matchAll(songStartRegex));

  for (let i = 0; i < startMatches.length; i++) {
    const match = startMatches[i];
    const songNumber = parseInt(match[1], 10);
    const rawTitle = match[2].trim();
    const blockStart = (match.index ?? 0) + match[0].length;
    const nextBlockStart =
      i + 1 < startMatches.length && startMatches[i + 1].index !== undefined
        ? startMatches[i + 1].index!
        : content.length;

    const rawSlice = content.slice(blockStart, nextBlockStart);

    // Find strict end marker `[END OF SONG X]` (with optional surrounding `***`)
    const endMarkerRegex = new RegExp(
      `^\\s*\\*{0,3}\\[\\s*END\\s+OF\\s+SONG\\s+${songNumber}\\s*\\]\\*{0,3}\\s*$`,
      'im'
    );
    const genericEndMarkerRegex = /^\s*\*{0,3}\[\s*END\s+OF\s+SONG\s+\d+\s*\]\*{0,3}\s*$/im;

    const endMatch = rawSlice.match(endMarkerRegex) ?? rawSlice.match(genericEndMarkerRegex);
    const blockBody =
      endMatch && endMatch.index !== undefined
        ? rawSlice.slice(0, endMatch.index)
        : rawSlice;

    const lines = blockBody.split('\n');
    let lineIdx = 0;

    // Skip leading blank lines right after `SONG X: Title`
    while (lineIdx < lines.length && lines[lineIdx].trim() === '') {
      lineIdx++;
    }

    let lyricist = indexMap.get(songNumber)?.lyricist ?? '';

    // Parse header metadata lines (Lyricist, Lyrics:, horizontal rules) before the lyrics begin
    while (lineIdx < lines.length) {
      const current = lines[lineIdx].trim();

      if (current === '') {
        lineIdx++;
        continue;
      }

      const lyricistMatch = current.match(/^Lyricist\s*:\s*(.*)$/i);
      if (lyricistMatch) {
        lyricist = lyricistMatch[1].trim();
        lineIdx++;
        continue;
      }

      if (/^Lyrics\s*:?\s*$/i.test(current)) {
        lineIdx++;
        continue;
      }

      if (/^[-=─_]{4,}$/.test(current)) {
        lineIdx++;
        continue;
      }

      // First actual lyric line reached
      break;
    }

    const lyricsLines = lines.slice(lineIdx);
    // Trim leading & trailing empty lines while strictly preserving internal stanza blank lines
    while (lyricsLines.length > 0 && lyricsLines[0].trim() === '') {
      lyricsLines.shift();
    }
    while (lyricsLines.length > 0 && lyricsLines[lyricsLines.length - 1].trim() === '') {
      lyricsLines.pop();
    }

    const lyrics = lyricsLines.map((l) => l.trimEnd()).join('\n');
    const stanzas = splitIntoStanzas(lyrics);
    const effectiveTitle = rawTitle || indexMap.get(songNumber)?.title || `Song ${songNumber}`;
    const { malayalamTitle, transliterationTitle } = splitSongTitle(effectiveTitle);

    songs.push({
      number: songNumber,
      title: effectiveTitle,
      malayalamTitle,
      transliterationTitle,
      lyricist: lyricist || 'Traditional',
      lyrics,
      stanzas,
    });
  }

  songs.sort((a, b) => a.number - b.number);

  return { indexEntries, songs };
}

/**
 * Dynamically searches songs by:
 * 1. Song Number (exact or partial, supporting "#2" or "song 2")
 * 2. First letters or any substring inside the song title (Malayalam & English transliteration)
 * 3. Lyricist name
 * 4. Any words or phrases inside the full lyrics
 */
export function searchSongs(songs: Song[], rawQuery: string): SongSearchResult[] {
  const query = normalizeForSearch(rawQuery);
  if (!query) {
    return songs.map((song) => ({ song, matchType: 'title' }));
  }

  const numericQuery = query.replace(/^(song\s+|#)/i, '').trim();
  const isPureNumber = /^\d+$/.test(numericQuery);

  const ranked: Array<{ result: SongSearchResult; score: number }> = [];

  for (const song of songs) {
    const numberStr = String(song.number);
    const normTitle = normalizeForSearch(song.title);
    const normMalayalam = normalizeForSearch(song.malayalamTitle);
    const normTranslit = normalizeForSearch(song.transliterationTitle);
    const normLyricist = normalizeForSearch(song.lyricist);

    // 1. Song Number match (when query is purely numeric, match only song numbers to avoid false hits on verse numbers)
    if (isPureNumber) {
      if (numberStr === numericQuery) {
        ranked.push({ result: { song, matchType: 'number' }, score: 100 });
      } else if (numberStr.includes(numericQuery)) {
        ranked.push({ result: { song, matchType: 'number' }, score: 85 });
      }
      continue;
    }

    // 2. Title match (startsWith ranked higher than substring)
    if (
      normTitle.startsWith(query) ||
      (normMalayalam && normMalayalam.startsWith(query)) ||
      (normTranslit && normTranslit.startsWith(query))
    ) {
      ranked.push({ result: { song, matchType: 'title' }, score: 90 });
      continue;
    }

    if (normTitle.includes(query)) {
      ranked.push({ result: { song, matchType: 'title' }, score: 75 });
      continue;
    }

    // 3. Lyricist match
    if (normLyricist.includes(query)) {
      ranked.push({ result: { song, matchType: 'lyricist' }, score: 60 });
      continue;
    }

    // 4. Full lyrics match (line-by-line or multi-line phrase)
    let matchedLine: string | undefined;
    for (const stanza of song.stanzas) {
      for (const line of stanza) {
        if (normalizeForSearch(line).includes(query)) {
          matchedLine = line.trim();
          break;
        }
      }
      if (matchedLine) break;
    }

    if (matchedLine) {
      ranked.push({
        result: { song, matchType: 'lyrics', matchedLine },
        score: 50,
      });
      continue;
    }

    // Also match across stanza line breaks (e.g. searching words spanning two lines)
    if (normalizeForSearch(song.lyrics).includes(query)) {
      const firstLine = song.stanzas[0]?.[0]?.trim();
      ranked.push({
        result: { song, matchType: 'lyrics', matchedLine: firstLine },
        score: 45,
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.result.song.number - b.result.song.number);
  return ranked.map((item) => item.result);
}
