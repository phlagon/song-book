export interface Song {
  number: number;
  title: string;
  malayalamTitle: string;
  transliterationTitle: string;
  lyricist: string;
  lyrics: string;
  stanzas: string[][];
}

export interface IndexEntry {
  number: number;
  title: string;
  lyricist: string;
}

export interface ParsedSongFile {
  indexEntries: IndexEntry[];
  songs: Song[];
}

export interface SongSearchResult {
  song: Song;
  matchType: 'number' | 'title' | 'lyricist' | 'lyrics';
  matchedLine?: string;
}
