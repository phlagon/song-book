import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { Header } from './components/Header';
import { MasterAdminView } from './components/MasterAdminView';
import { SongDetailView } from './components/SongDetailView';
import { SongIndexView } from './components/SongIndexView';
import { INITIAL_SONGS } from './data/songsData';
import type { Song as SongRecord } from './data/songsData';
import {
  fetchRawSongsFromGitHub,
  readSyncedSongs,
  writeSyncedSongs,
} from './utils/githubSync';
import { isNativeApp } from './utils/platform';
import { toViewSongs } from './utils/songsDataCodec';

const DEFAULT_FONT_SIZE = 20;
const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 34;
const FONT_STEP = 2;

type AppRoute =
  | { view: 'index' }
  | { view: 'song'; songNumber: number }
  | { view: 'master' };

function getRouteFromUrl(): AppRoute {
  const pathname = window.location.pathname;
  const hash = window.location.hash;

  if (/^\/master\/?$/.test(pathname) || /^#\/master\/?$/.test(hash)) {
    return { view: 'master' };
  }

  const pathMatch = pathname.match(/^\/song\/(\d+)\/?$/);
  if (pathMatch) {
    return { view: 'song', songNumber: parseInt(pathMatch[1], 10) };
  }
  const hashMatch = hash.match(/^#\/song\/(\d+)\/?$/);
  if (hashMatch) {
    return { view: 'song', songNumber: parseInt(hashMatch[1], 10) };
  }
  return { view: 'index' };
}

function getInitialTheme(): boolean {
  try {
    return localStorage.getItem('hymnal-theme') === 'dark';
  } catch {
    return false;
  }
}

function getInitialFontSize(): number {
  try {
    const raw = localStorage.getItem('hymnal-font-size');
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= MIN_FONT_SIZE && parsed <= MAX_FONT_SIZE) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_FONT_SIZE;
}

export default function App() {
  // Immediately hydrate synchronously from localStorage('synced_songs') or bundled INITIAL_SONGS (zero blank screen offline)
  const [songRecords, setSongRecords] = useState<SongRecord[]>(
    () => readSyncedSongs() ?? INITIAL_SONGS
  );
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromUrl());
  const [masterAuthToken, setMasterAuthToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState<boolean>(() => getInitialTheme());
  const [fontSize, setFontSize] = useState<number>(() => getInitialFontSize());

  const songs = useMemo(() => toViewSongs(songRecords), [songRecords]);
  const activeSongNumber = route.view === 'song' ? route.songNumber : null;

  const applySyncedSongs = useCallback((nextRecords: SongRecord[]) => {
    writeSyncedSongs(nextRecords);
    setSongRecords(nextRecords);
  }, []);

  // Silently fetch latest src/data/songsData.ts from GitHub Raw URL on startup and on 'online'
  const syncSongsFromGitHub = useCallback(async () => {
    const fetched = await fetchRawSongsFromGitHub();
    if (!fetched) {
      return;
    }

    const fetchedJson = JSON.stringify(fetched);
    const currentSynced = readSyncedSongs();
    const currentJson = JSON.stringify(currentSynced ?? INITIAL_SONGS);

    if (fetchedJson !== currentJson || !currentSynced) {
      writeSyncedSongs(fetched);
      if (fetchedJson !== currentJson) {
        setSongRecords(fetched);
      }
    }
  }, []);

  useEffect(() => {
    syncSongsFromGitHub();

    const handleOnline = () => {
      syncSongsFromGitHub();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncSongsFromGitHub]);

  // Keep Tailwind dark class and localStorage synced
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('hymnal-theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  // Persist font size choice
  useEffect(() => {
    try {
      localStorage.setItem('hymnal-font-size', String(fontSize));
    } catch {
      // ignore storage errors
    }
  }, [fontSize]);

  // Sync browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRouteFromUrl());
      window.scrollTo({ top: 0 });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToSong = useCallback((songNumber: number) => {
    const targetPath = `/song/${songNumber}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view: 'song', songNumber }, '', targetPath);
    }
    setRoute({ view: 'song', songNumber });
    window.scrollTo({ top: 0 });
  }, []);

  const navigateToIndex = useCallback((clearSearch = false) => {
    if (window.location.pathname !== '/' || window.location.hash) {
      window.history.pushState({ view: 'index' }, '', '/');
    }
    if (clearSearch) {
      setSearchQuery('');
    }
    setRoute({ view: 'index' });
    window.scrollTo({ top: 0 });
  }, []);

  const navigateToMaster = useCallback(() => {
    if (window.location.pathname !== '/master') {
      window.history.pushState({ view: 'master' }, '', '/master');
    }
    setRoute({ view: 'master' });
    window.scrollTo({ top: 0 });
  }, []);

  const showWebMasterLogin = useMemo(() => !isNativeApp(), []);

  const currentSongIndex = useMemo(() => {
    if (activeSongNumber === null) return -1;
    return songs.findIndex((s) => s.number === activeSongNumber);
  }, [songs, activeSongNumber]);

  const currentSong = currentSongIndex >= 0 ? songs[currentSongIndex] : null;
  const prevSong = currentSongIndex > 0 ? songs[currentSongIndex - 1] : null;
  const nextSong =
    currentSongIndex >= 0 && currentSongIndex < songs.length - 1
      ? songs[currentSongIndex + 1]
      : null;

  // Update browser tab title dynamically
  useEffect(() => {
    if (route.view === 'master') {
      document.title = 'Master Admin — Malayalam Christian Hymns';
    } else if (currentSong) {
      const shortTitle = currentSong.malayalamTitle || currentSong.title;
      document.title = `${currentSong.number}. ${shortTitle} — Malayalam Christian Hymns`;
    } else {
      document.title = 'Malayalam Christian Song Lyrics';
    }
  }, [route.view, currentSong]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F4] text-[#1C1917] dark:bg-[#111110] dark:text-[#F4F1EA]">
      <Header
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onNavigateHome={() => navigateToIndex(true)}
      />

      <div className="flex-1">
        {route.view === 'master' ? (
          <MasterAdminView
            songs={songs}
            songRecords={songRecords}
            authToken={masterAuthToken}
            onAuthTokenChange={setMasterAuthToken}
            onSongsUpdated={applySyncedSongs}
            onBackToIndex={() => navigateToIndex(false)}
            onOpenSong={navigateToSong}
          />
        ) : activeSongNumber !== null ? (
          currentSong ? (
            <SongDetailView
              song={currentSong}
              prevSong={prevSong}
              nextSong={nextSong}
              fontSize={fontSize}
              minFontSize={MIN_FONT_SIZE}
              maxFontSize={MAX_FONT_SIZE}
              onDecreaseFont={() =>
                setFontSize((s) => Math.max(MIN_FONT_SIZE, s - FONT_STEP))
              }
              onIncreaseFont={() =>
                setFontSize((s) => Math.min(MAX_FONT_SIZE, s + FONT_STEP))
              }
              onResetFont={() => setFontSize(DEFAULT_FONT_SIZE)}
              onNavigateSong={navigateToSong}
              onBackToIndex={() => navigateToIndex(false)}
            />
          ) : (
            <main className="max-w-3xl mx-auto px-5 sm:px-8 py-16">
              <h1 className="font-editorial text-2xl font-semibold text-[#1C1917] dark:text-[#F4F1EA]">
                Song {activeSongNumber} Not Found
              </h1>
              <p className="text-sm text-stone-600 dark:text-stone-400 mt-2">
                This song number is not currently listed in the songbook.
              </p>
              <button
                type="button"
                onClick={() => navigateToIndex(false)}
                className="mt-5 px-4 py-2 min-h-[40px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 cursor-pointer"
              >
                Back to Index
              </button>
            </main>
          )
        ) : (
          <SongIndexView
            songs={songs}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectSong={navigateToSong}
          />
        )}
      </div>

      <footer className="border-t border-stone-200 dark:border-stone-800 mt-12">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400">
          <span>Malayalam Christian Song Lyrics</span>
          {showWebMasterLogin && route.view !== 'master' && (
            <button
              type="button"
              onClick={navigateToMaster}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] text-xs font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white/70 dark:bg-[#1A1918] text-stone-700 dark:text-stone-300 hover:text-[#7C2D12] dark:hover:text-[#E2A856] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Master Login</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
