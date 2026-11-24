import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import type { Song } from '../types/song';

interface SongDetailViewProps {
  song: Song;
  prevSong: Song | null;
  nextSong: Song | null;
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  onResetFont: () => void;
  onNavigateSong: (songNumber: number) => void;
  onBackToIndex: () => void;
}

const SECTION_LABEL_REGEX = /^(പല്ലവി|അനുപല്ലവി|ചരണങ്ങൾ|ചരണം|കോറസ്|Chorus|Pallavi|Anupallavi|Stanzas?)$/i;

const FONT_SIZE_CLASS_MAP: Record<number, string> = {
  16: 'text-[16px] leading-[1.95]',
  18: 'text-[18px] leading-[1.95]',
  20: 'text-[20px] leading-[1.95]',
  22: 'text-[22px] leading-[1.95]',
  24: 'text-[24px] leading-[1.95]',
  26: 'text-[26px] leading-[1.95]',
  28: 'text-[28px] leading-[1.95]',
  30: 'text-[30px] leading-[1.95]',
  32: 'text-[32px] leading-[1.95]',
  34: 'text-[34px] leading-[1.95]',
};

export function SongDetailView({
  song,
  prevSong,
  nextSong,
  fontSize,
  minFontSize,
  maxFontSize,
  onDecreaseFont,
  onIncreaseFont,
  onResetFont,
  onNavigateSong,
  onBackToIndex,
}: SongDetailViewProps) {
  const [copied, setCopied] = useState(false);

  // Reset copied state when switching songs
  useEffect(() => {
    setCopied(false);
  }, [song.number]);

  // Keyboard shortcuts for fast church/stage navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft' && prevSong) {
        onNavigateSong(prevSong.number);
      } else if (e.key === 'ArrowRight' && nextSong) {
        onNavigateSong(nextSong.number);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevSong, nextSong, onNavigateSong]);

  const handleCopyLyrics = async () => {
    const formatted = [
      `Song ${song.number}: ${song.title}`,
      `Lyricist: ${song.lyricist}`,
      '',
      song.lyrics,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy via temporary textarea
      const textarea = document.createElement('textarea');
      textarea.value = formatted;
      textarea.setAttribute('readonly', '');
      textarea.className = 'fixed opacity-0 pointer-events-none';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const primaryTitle = song.malayalamTitle || song.title;
  const secondaryTitle = song.malayalamTitle ? song.transliterationTitle : '';
  const lyricsFontClass = FONT_SIZE_CLASS_MAP[fontSize] ?? 'text-[20px] leading-[1.95]';

  return (
    <main className="max-w-3xl mx-auto px-5 sm:px-8 py-6 sm:py-10">
      {/* Top Action & Reading Utility Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-stone-200 dark:border-stone-800">
        <a
          href="/"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onBackToIndex();
            }
          }}
          className="inline-flex items-center gap-2 py-2 pr-2 min-h-[40px] text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-[#7C2D12] dark:hover:text-[#E2A856] transition-colors duration-150 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Index</span>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Font Size Controls */}
          <div
            role="group"
            aria-label="Adjust lyrics font size"
            className="inline-flex items-center rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] divide-x divide-stone-300 dark:divide-stone-700"
          >
            <button
              type="button"
              onClick={onDecreaseFont}
              disabled={fontSize <= minFontSize}
              aria-label="Decrease font size"
              className="px-3 min-h-[40px] min-w-[42px] text-sm font-semibold text-[#1C1917] dark:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150 whitespace-nowrap cursor-pointer rounded-l-md"
            >
              A-
            </button>
            <button
              type="button"
              onClick={onResetFont}
              title="Reset font size to default"
              aria-label={`Current font size ${fontSize} pixels. Click to reset.`}
              className="px-2.5 min-h-[40px] text-xs font-medium tabular-nums text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap cursor-pointer"
            >
              {fontSize}px
            </button>
            <button
              type="button"
              onClick={onIncreaseFont}
              disabled={fontSize >= maxFontSize}
              aria-label="Increase font size"
              className="px-3 min-h-[40px] min-w-[42px] text-sm font-semibold text-[#1C1917] dark:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150 whitespace-nowrap cursor-pointer rounded-r-md"
            >
              A+
            </button>
          </div>

          {/* Copy Lyrics Button */}
          <button
            type="button"
            onClick={handleCopyLyrics}
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-stone-500 dark:text-stone-400" aria-hidden="true" />
                <span>Copy Lyrics</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Song Header */}
      <article className="pt-8 pb-10">
        <header className="pb-7 border-b border-stone-200 dark:border-stone-800">
          <p className="font-editorial text-sm sm:text-base font-semibold tabular-nums text-[#7C2D12] dark:text-[#E2A856]">
            Song {song.number}
          </p>

          <h1 className="text-2xl sm:text-3xl font-bold leading-snug text-balance text-[#1C1917] dark:text-[#F4F1EA] mt-1.5">
            {primaryTitle}
          </h1>

          {secondaryTitle && (
            <p className="font-editorial text-base sm:text-lg text-stone-600 dark:text-stone-300 mt-1.5 leading-snug">
              {secondaryTitle}
            </p>
          )}

          <p className="text-sm text-stone-500 dark:text-stone-400 mt-3">
            Lyricist: {song.lyricist}
          </p>
        </header>

        {/* Lyrics Body with Preserved Stanza Spacing */}
        <div
          lang="ml"
          className={`font-malayalam pt-8 sm:pt-10 space-y-8 text-[#1C1917] dark:text-[#F4F1EA] tabular-nums ${lyricsFontClass}`}
        >
          {song.stanzas.map((stanza, stanzaIdx) => (
            <section key={stanzaIdx} className="space-y-1.5">
              {stanza.map((line, lineIdx) => {
                const trimmed = line.trim();
                const isSectionHeading = SECTION_LABEL_REGEX.test(trimmed);

                if (isSectionHeading) {
                  return (
                    <p
                      key={lineIdx}
                      className="text-[0.82em] font-semibold text-stone-500 dark:text-stone-400 pt-1"
                    >
                      {trimmed}
                    </p>
                  );
                }

                return (
                  <p key={lineIdx} className="break-words">
                    {line}
                  </p>
                );
              })}
            </section>
          ))}
        </div>
      </article>

      {/* Bottom Song Navigation */}
      <nav
        aria-label="Song navigation"
        className="pt-6 border-t border-stone-200 dark:border-stone-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch"
      >
        {prevSong ? (
          <a
            href={`/song/${prevSong.number}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                onNavigateSong(prevSong.number);
              }
            }}
            className="flex items-center gap-2.5 px-4 py-3 min-h-[52px] rounded-lg border border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-[#1A1918] hover:border-stone-300 dark:hover:border-stone-700 hover:bg-stone-100/80 dark:hover:bg-stone-800/70 transition-colors duration-150 min-w-0"
          >
            <ChevronLeft className="w-4 h-4 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
            <div className="min-w-0 text-left">
              <span className="block text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
                Previous Song
              </span>
              <span className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] truncate tabular-nums">
                {prevSong.number}. {prevSong.malayalamTitle || prevSong.title}
              </span>
            </div>
          </a>
        ) : (
          <div
            aria-disabled="true"
            className="flex items-center gap-2.5 px-4 py-3 min-h-[52px] rounded-lg border border-stone-200/60 dark:border-stone-800/60 text-stone-400 dark:text-stone-600 select-none"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="text-sm whitespace-nowrap">Previous Song</span>
          </div>
        )}

        <a
          href="/"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onBackToIndex();
            }
          }}
          className="flex items-center justify-center px-4 py-3 min-h-[52px] text-sm font-medium rounded-lg border border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] hover:border-stone-300 dark:hover:border-stone-700 hover:bg-stone-100/80 dark:hover:bg-stone-800/70 transition-colors duration-150 whitespace-nowrap"
        >
          Back to Index
        </a>

        {nextSong ? (
          <a
            href={`/song/${nextSong.number}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                onNavigateSong(nextSong.number);
              }
            }}
            className="flex items-center justify-end gap-2.5 px-4 py-3 min-h-[52px] rounded-lg border border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-[#1A1918] hover:border-stone-300 dark:hover:border-stone-700 hover:bg-stone-100/80 dark:hover:bg-stone-800/70 transition-colors duration-150 min-w-0"
          >
            <div className="min-w-0 text-right">
              <span className="block text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
                Next Song
              </span>
              <span className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] truncate tabular-nums">
                {nextSong.number}. {nextSong.malayalamTitle || nextSong.title}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
          </a>
        ) : (
          <div
            aria-disabled="true"
            className="flex items-center justify-end gap-2.5 px-4 py-3 min-h-[52px] rounded-lg border border-stone-200/60 dark:border-stone-800/60 text-stone-400 dark:text-stone-600 select-none"
          >
            <span className="text-sm whitespace-nowrap">Next Song</span>
            <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          </div>
        )}
      </nav>
    </main>
  );
}
