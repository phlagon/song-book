import { useMemo, useRef } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import type { Song } from '../types/song';
import { searchSongs } from '../utils/parseSongs';

interface SongIndexViewProps {
  songs: Song[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectSong: (songNumber: number) => void;
}

export function SongIndexView({
  songs,
  searchQuery,
  onSearchChange,
  onSelectSong,
}: SongIndexViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchSongs(songs, searchQuery), [songs, searchQuery]);
  const isFiltering = searchQuery.trim().length > 0;

  const handleClear = () => {
    onSearchChange('');
    inputRef.current?.focus();
  };

  return (
    <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 pb-6">
        <div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C1917] dark:text-[#F4F1EA]">
            Song Index
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            ക്രിസ്തീയ ഗീതങ്ങൾ
            <span aria-hidden="true" className="mx-2">·</span>
            <span className="tabular-nums">
              {isFiltering
                ? `Showing ${results.length} of ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`
                : `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`}
            </span>
          </p>
        </div>
      </div>

      {/* Prominent Instant Search Bar */}
      <div className="mb-8">
        <label htmlFor="song-search" className="sr-only">
          Search songs by number, title, lyrics, or lyricist
        </label>
        <div className="relative flex items-center">
          <Search
            className="w-5 h-5 text-stone-400 dark:text-stone-500 absolute left-4 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id="song-search"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && isFiltering) {
                e.preventDefault();
                handleClear();
              }
            }}
            placeholder="Search by song number, title, Malayalam lyrics, or lyricist…"
            autoComplete="off"
            spellCheck={false}
            className="w-full min-h-[50px] pl-12 pr-24 py-3 text-base rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-[#7C2D12] dark:focus:border-[#D97706] transition-colors duration-150"
          />
          {isFiltering && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute right-2.5 inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md text-stone-600 dark:text-stone-300 hover:text-[#1C1917] dark:hover:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Song Index List */}
      {results.length === 0 ? (
        <div className="py-14 text-center border-y border-stone-200 dark:border-stone-800">
          <p className="text-base text-stone-700 dark:text-stone-300">
            No songs found matching <span className="font-semibold">“{searchQuery.trim()}”</span>.
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1.5">
            Try searching by song number, a word in Malayalam or English, or a lyricist name.
          </p>
          {isFiltering && (
            <button
              type="button"
              onClick={handleClear}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 text-[#1C1917] dark:text-[#F4F1EA] bg-white dark:bg-[#1A1918] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 cursor-pointer"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <ol
          aria-label="Song index"
          className="border-y border-stone-200 dark:border-stone-800 divide-y divide-stone-200/90 dark:divide-stone-800/90"
        >
          {results.map(({ song, matchType, matchedLine }) => {
            const primaryTitle = song.malayalamTitle || song.title;
            const secondaryTitle = song.malayalamTitle ? song.transliterationTitle : '';

            return (
              <li key={song.number}>
                <a
                  href={`/song/${song.number}`}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      onSelectSong(song.number);
                    }
                  }}
                  className="group flex items-start gap-4 sm:gap-6 py-5 px-2 sm:px-3 -mx-2 sm:-mx-3 rounded-lg hover:bg-stone-200/45 dark:hover:bg-stone-800/55 transition-colors duration-150"
                >
                  <span
                    className="w-9 sm:w-11 shrink-0 pt-0.5 text-right font-editorial text-lg sm:text-xl font-semibold tabular-nums text-[#7C2D12] dark:text-[#E2A856]"
                    aria-hidden="true"
                  >
                    {song.number}.
                  </span>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-[1.22rem] font-semibold leading-snug text-[#1C1917] dark:text-[#F4F1EA] group-hover:text-[#7C2D12] dark:group-hover:text-[#E2A856] transition-colors duration-150">
                      {primaryTitle}
                    </h2>

                    {secondaryTitle && (
                      <p className="text-sm sm:text-[0.95rem] text-stone-600 dark:text-stone-300 mt-0.5 leading-snug">
                        {secondaryTitle}
                      </p>
                    )}

                    <p className="text-xs sm:text-[13px] text-stone-500 dark:text-stone-400 mt-1.5">
                      {song.lyricist}
                    </p>

                    {isFiltering && matchType === 'lyrics' && matchedLine && (
                      <p className="text-sm text-[#7C2D12] dark:text-[#E2A856] mt-2 leading-relaxed">
                        Lyrics match: “{matchedLine}”
                      </p>
                    )}
                  </div>

                  <ChevronRight
                    className="w-5 h-5 shrink-0 mt-1 text-stone-400 dark:text-stone-500 group-hover:text-[#7C2D12] dark:group-hover:text-[#E2A856] group-hover:translate-x-0.5 transition-all duration-150"
                    aria-hidden="true"
                  />
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
