import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Check, Download, Lock, LogOut, Save } from 'lucide-react';
import type { Song } from '../types/song';
import {
  appendSongToSongsTxt,
  extractDefaultTitleFromLyrics,
  getNextSongNumber,
} from '../utils/formatSongEntry';

interface MasterAdminViewProps {
  songs: Song[];
  authToken: string | null;
  onAuthTokenChange: (token: string | null) => void;
  onSongSaved: () => Promise<void>;
  onBackToIndex: () => void;
  onOpenSong: (songNumber: number) => void;
}

type AuthMode = 'checking' | 'setup' | 'login' | 'authenticated' | 'static-fallback';

export function MasterAdminView({
  songs,
  authToken,
  onAuthTokenChange,
  onSongSaved,
  onBackToIndex,
  onOpenSong,
}: MasterAdminViewProps) {
  const [authMode, setAuthMode] = useState<AuthMode>(authToken ? 'authenticated' : 'checking');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [lyrics, setLyrics] = useState('');
  const [title, setTitle] = useState('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [lyricist, setLyricist] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSong, setSavedSong] = useState<{ number: number; title: string } | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const nextSongNumber = useMemo(
    () => getNextSongNumber(songs.map((s) => s.number)),
    [songs]
  );

  // Check server auth configuration & validate existing in-memory session token
  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const headers: Record<string, string> = {};
        if (authToken) {
          headers.Authorization = `Bearer ${authToken}`;
        }
        const res = await fetch('/api/master/status', {
          cache: 'no-store',
          headers,
        });

        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          if (!cancelled) {
            setAuthMode('static-fallback');
          }
          return;
        }

        const data = (await res.json()) as {
          configured: boolean;
          authenticated: boolean;
        };

        if (cancelled) return;

        if (data.authenticated) {
          setAuthMode('authenticated');
        } else {
          if (authToken) {
            onAuthTokenChange(null);
          }
          setAuthMode(data.configured ? 'login' : 'setup');
        }
      } catch {
        if (!cancelled) {
          setAuthMode('static-fallback');
        }
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [authToken, onAuthTokenChange]);

  const handleLyricsChange = (nextLyrics: string) => {
    setLyrics(nextLyrics);
    setSaveError(null);
    if (!titleManuallyEdited) {
      setTitle(extractDefaultTitleFromLyrics(nextLyrics));
    }
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    setSaveError(null);
    setTitleManuallyEdited(nextTitle.trim().length > 0);
  };

  const handleSetupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmed = passwordInput.trim();
    if (trimmed.length < 6) {
      setAuthError('Please enter a password with at least 6 characters.');
      return;
    }
    if (trimmed !== confirmPasswordInput.trim()) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/master/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: trimmed }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Could not set up admin password.');
        return;
      }
      setPasswordInput('');
      setConfirmPasswordInput('');
      onAuthTokenChange(data.token);
      setAuthMode('authenticated');
    } catch {
      setAuthError('Unable to reach server. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmed = passwordInput.trim();
    if (!trimmed) {
      setAuthError('Please enter the admin password.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/master/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: trimmed }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Incorrect password.');
        return;
      }
      setPasswordInput('');
      onAuthTokenChange(data.token);
      setAuthMode('authenticated');
    } catch {
      setAuthError('Unable to reach server. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (authToken) {
      await fetch('/api/master/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => undefined);
    }
    onAuthTokenChange(null);
    setAuthMode('login');
  };

  const handleSaveSong = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSavedSong(null);

    const effectiveTitle = (title.trim() || extractDefaultTitleFromLyrics(lyrics)).trim();
    const effectiveLyricist = lyricist.trim() || 'Traditional';
    const effectiveLyrics = lyrics.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');

    if (!effectiveLyrics) {
      setSaveError('Please enter the song lyrics.');
      return;
    }

    if (!effectiveTitle) {
      setSaveError('Please enter a song title.');
      return;
    }

    if (authMode === 'static-fallback') {
      setSaveError(
        'Direct server saving is unavailable on static hosting. Use "Download songs.txt" below to save a copy with this song included.'
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          title: effectiveTitle,
          lyricist: effectiveLyricist,
          lyrics: effectiveLyrics,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setSaveError(
          'Save endpoint is unavailable in this environment. Use "Download songs.txt" below as a backup.'
        );
        return;
      }

      const data = (await res.json()) as {
        song?: { number: number; title: string; lyricist: string };
        error?: string;
      };

      if (res.status === 401) {
        onAuthTokenChange(null);
        setAuthMode('login');
        setAuthError(data.error || 'Session expired. Please sign in again.');
        return;
      }

      if (!res.ok || !data.song) {
        setSaveError(data.error || 'Could not save the song to songs.txt.');
        return;
      }

      await onSongSaved();
      setSavedSong({ number: data.song.number, title: data.song.title });
      setLyrics('');
      setTitle('');
      setTitleManuallyEdited(false);
      setLyricist('');
    } catch {
      setSaveError(
        'Could not reach /api/songs. You can use "Download songs.txt" below as a static backup.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadNotice(null);
    setSaveError(null);

    try {
      const res = await fetch('/songs.txt', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Could not read current songs.txt.');
      }
      const currentText = await res.text();

      const draftLyrics = lyrics.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
      const draftTitle = (title.trim() || extractDefaultTitleFromLyrics(draftLyrics)).trim();

      let contentToDownload = currentText;
      let message = 'Downloaded current songs.txt.';

      if (draftLyrics && draftTitle) {
        contentToDownload = appendSongToSongsTxt(currentText, {
          number: nextSongNumber,
          title: draftTitle,
          lyricist: lyricist.trim() || 'Traditional',
          lyrics: draftLyrics,
        });
        message = `Downloaded songs.txt with draft Song ${nextSongNumber} included.`;
      }

      const blob = new Blob([contentToDownload], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'songs.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadNotice(message);
    } catch {
      setSaveError('Failed to generate songs.txt download.');
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-5 sm:px-8 py-6 sm:py-10">
      <div className="flex items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-stone-800">
        <a
          href="/"
          onClick={(e) => {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onBackToIndex();
            }
          }}
          className="inline-flex items-center gap-2 py-2 pr-2 min-h-[40px] text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-[#7C2D12] dark:hover:text-[#E2A856] transition-colors duration-150 whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to Index</span>
        </a>

        {authMode === 'authenticated' && (
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Lock Panel</span>
          </button>
        )}
      </div>

      {authMode === 'checking' && (
        <div className="py-12">
          <p className="text-sm text-stone-500 dark:text-stone-400">Checking admin access…</p>
        </div>
      )}

      {(authMode === 'setup' || authMode === 'login') && (
        <section className="max-w-md py-10">
          <div className="flex items-center gap-2.5 text-[#7C2D12] dark:text-[#E2A856]">
            <Lock className="w-5 h-5" aria-hidden="true" />
            <h1 className="font-editorial text-2xl font-semibold text-[#1C1917] dark:text-[#F4F1EA]">
              {authMode === 'setup' ? 'Set Master Password' : 'Master Admin'}
            </h1>
          </div>

          <p className="text-sm text-stone-600 dark:text-stone-400 mt-2 leading-relaxed">
            {authMode === 'setup'
              ? 'No MASTER_ADMIN_PASSWORD secret is configured yet. Create an admin password for this session to unlock song publishing.'
              : 'Enter the admin password to add new Malayalam songs directly to songs.txt.'}
          </p>

          <form
            onSubmit={authMode === 'setup' ? handleSetupSubmit : handleLoginSubmit}
            className="mt-6 space-y-4"
          >
            <div>
              <label
                htmlFor="master-password"
                className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] mb-1.5"
              >
                {authMode === 'setup' ? 'New Admin Password' : 'Password'}
              </label>
              <input
                id="master-password"
                type="password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setAuthError(null);
                }}
                autoFocus
                autoComplete={authMode === 'setup' ? 'new-password' : 'current-password'}
                placeholder={authMode === 'setup' ? 'Minimum 6 characters' : 'Enter password'}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] placeholder:text-stone-400 dark:placeholder:text-stone-500"
              />
            </div>

            {authMode === 'setup' && (
              <div>
                <label
                  htmlFor="master-password-confirm"
                  className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] mb-1.5"
                >
                  Confirm Password
                </label>
                <input
                  id="master-password-confirm"
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => {
                    setConfirmPasswordInput(e.target.value);
                    setAuthError(null);
                  }}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-base rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] placeholder:text-stone-400 dark:placeholder:text-stone-500"
                />
              </div>
            )}

            {authError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] text-sm font-medium rounded-md bg-[#7C2D12] hover:bg-[#66240E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white dark:text-[#111110] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap cursor-pointer"
            >
              {authSubmitting
                ? 'Please wait…'
                : authMode === 'setup'
                  ? 'Set Password & Unlock'
                  : 'Unlock Admin Panel'}
            </button>
          </form>
        </section>
      )}

      {(authMode === 'authenticated' || authMode === 'static-fallback') && (
        <section className="pt-8">
          <div className="pb-6 border-b border-stone-200 dark:border-stone-800">
            <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#1C1917] dark:text-[#F4F1EA]">
              Add New Song
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 tabular-nums">
              Currently {songs.length} {songs.length === 1 ? 'song' : 'songs'} in songs.txt
            </p>
          </div>

          {authMode === 'static-fallback' && (
            <p className="mt-5 text-sm text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-800 rounded-md px-4 py-3 bg-white/60 dark:bg-[#1A1918]">
              Static hosting detected: direct server writes to <code className="font-mono">songs.txt</code> are unavailable. Fill out the song below and click <strong>Download songs.txt</strong> to get the updated file.
            </p>
          )}

          {savedSong && (
            <div
              role="status"
              className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200"
            >
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Saved <strong>Song {savedSong.number}</strong> ({savedSong.title}) to songs.txt.
                </span>
              </span>
              <a
                href={`/song/${savedSong.number}`}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    onOpenSong(savedSong.number);
                  }
                }}
                className="font-medium underline underline-offset-4 hover:opacity-80 whitespace-nowrap"
              >
                View Song {savedSong.number}
              </a>
            </div>
          )}

          {downloadNotice && (
            <p
              role="status"
              className="mt-4 text-sm text-stone-700 dark:text-stone-300"
            >
              {downloadNotice}
            </p>
          )}

          <form onSubmit={handleSaveSong} className="mt-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="song-number"
                  className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] mb-1.5"
                >
                  Song Number
                </label>
                <input
                  id="song-number"
                  type="text"
                  readOnly
                  value={nextSongNumber}
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-base tabular-nums rounded-md border border-stone-200 dark:border-stone-800 bg-stone-100/80 dark:bg-stone-900/70 text-stone-600 dark:text-stone-400 cursor-default"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="song-lyricist"
                  className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] mb-1.5"
                >
                  Lyricist <span className="font-normal text-stone-500 dark:text-stone-400">(optional)</span>
                </label>
                <input
                  id="song-lyricist"
                  type="text"
                  value={lyricist}
                  onChange={(e) => setLyricist(e.target.value)}
                  placeholder="Traditional"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-base rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] placeholder:text-stone-400 dark:placeholder:text-stone-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label
                  htmlFor="song-title"
                  className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA]"
                >
                  Song Title
                </label>
                {titleManuallyEdited && lyrics.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleManuallyEdited(false);
                      setTitle(extractDefaultTitleFromLyrics(lyrics));
                    }}
                    className="text-xs text-[#7C2D12] dark:text-[#E2A856] hover:underline underline-offset-4 cursor-pointer"
                  >
                    Auto-fill from lyrics
                  </button>
                )}
              </div>
              <input
                id="song-title"
                type="text"
                lang="ml"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Auto-fills from first lyric line (skips പല്ലവി)"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base font-malayalam rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] placeholder:text-stone-400 dark:placeholder:text-stone-500"
              />
            </div>

            <div>
              <label
                htmlFor="song-lyrics"
                className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] mb-1.5"
              >
                Lyrics (Malayalam Unicode)
              </label>
              <textarea
                id="song-lyrics"
                lang="ml"
                rows={12}
                value={lyrics}
                onChange={(e) => handleLyricsChange(e.target.value)}
                placeholder={'പല്ലവി\nയേശുവിൻ നാമം എത്ര മധുരം…\n\n1 ...'}
                className="w-full px-3.5 py-3 text-base font-malayalam leading-relaxed rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] placeholder:text-stone-400 dark:placeholder:text-stone-500 resize-y"
              />
            </div>

            {saveError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {saveError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-medium rounded-md bg-[#7C2D12] hover:bg-[#66240E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white dark:text-[#111110] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap cursor-pointer"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                <span>{saving ? 'Saving to songs.txt…' : `Save Song ${nextSongNumber}`}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4 text-stone-500 dark:text-stone-400" aria-hidden="true" />
                <span>Download songs.txt</span>
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
