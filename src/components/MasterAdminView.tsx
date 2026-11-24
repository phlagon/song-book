import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  KeyRound,
  Lock,
  LogOut,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react';
import {
  FILE_PATH,
  GITHUB_BRANCH,
  GITHUB_OWNER,
  GITHUB_REPO,
  isGitHubConfigured,
} from '../config/github';
import type { Song as SongRecord } from '../data/songsData';
import type { Song } from '../types/song';
import { extractDefaultTitleFromLyrics } from '../utils/formatSongEntry';
import {
  commitSongsDataToGitHub,
  fetchGitHubSongsFile,
  readStoredGitHubToken,
  writeStoredGitHubToken,
} from '../utils/githubSync';
import {
  extractSongsFromTsFile,
  generateSongsDataTs,
  reindexSongs,
  sanitizeSongRecord,
} from '../utils/songsDataCodec';

interface MasterAdminViewProps {
  songs: Song[];
  songRecords: SongRecord[];
  authToken: string | null;
  onAuthTokenChange: (token: string | null) => void;
  onSongsUpdated: (updatedRecords: SongRecord[]) => void;
  onBackToIndex: () => void;
  onOpenSong: (songNumber: number) => void;
}

type AuthMode = 'checking' | 'setup' | 'login' | 'authenticated' | 'static-ready';

export function MasterAdminView({
  songs,
  songRecords,
  authToken,
  onAuthTokenChange,
  onSongsUpdated,
  onBackToIndex,
  onOpenSong,
}: MasterAdminViewProps) {
  const [authMode, setAuthMode] = useState<AuthMode>(authToken ? 'authenticated' : 'checking');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [githubToken, setGithubToken] = useState<string>(() => readStoredGitHubToken());
  const [editingSongId, setEditingSongId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [lyrics, setLyrics] = useState('');
  const [title, setTitle] = useState('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [lyricist, setLyricist] = useState('');

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    songNumber?: number;
  } | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const repoConfigured = isGitHubConfigured();

  const nextSongNumber = useMemo(() => songRecords.length + 1, [songRecords.length]);
  const displaySongNumber = editingSongId ?? nextSongNumber;

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
            setAuthMode('static-ready');
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
          setAuthMode('static-ready');
        }
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [authToken, onAuthTokenChange]);

  const handleGitHubTokenChange = (value: string) => {
    setGithubToken(value);
    writeStoredGitHubToken(value);
    setActionError(null);
  };

  const resetForm = () => {
    setEditingSongId(null);
    setLyrics('');
    setTitle('');
    setTitleManuallyEdited(false);
    setLyricist('');
    setActionError(null);
  };

  const handleStartEdit = (song: Song) => {
    setEditingSongId(song.number);
    setTitle(song.title);
    setTitleManuallyEdited(true);
    setLyricist(song.lyricist);
    setLyrics(song.lyrics);
    setConfirmDeleteId(null);
    setActionError(null);
    setStatusMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLyricsChange = (nextLyrics: string) => {
    setLyrics(nextLyrics);
    setActionError(null);
    if (!titleManuallyEdited && editingSongId === null) {
      setTitle(extractDefaultTitleFromLyrics(nextLyrics));
    }
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    setActionError(null);
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
    setActionError(null);
    setStatusMessage(null);
    setDownloadNotice(null);

    const effectiveLyrics = lyrics.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
    const effectiveTitle = (title.trim() || extractDefaultTitleFromLyrics(effectiveLyrics))
      .replace(/[\r\n]+/g, ' ')
      .trim();
    const effectiveLyricist = lyricist.replace(/[\r\n]+/g, ' ').trim() || 'Traditional';

    if (!effectiveLyrics) {
      setActionError('Please enter the song lyrics.');
      return;
    }
    if (!effectiveTitle) {
      setActionError('Please enter a song title.');
      return;
    }

    setBusy(true);
    try {
      const snapshot = await fetchGitHubSongsFile(githubToken);
      const remoteSongs = snapshot.content
        ? extractSongsFromTsFile(snapshot.content)
        : null;

      if (snapshot.content && !remoteSongs) {
        throw new Error(
          'Could not parse INITIAL_SONGS from src/data/songsData.ts on GitHub. Check file syntax before committing.'
        );
      }

      const baseSongs = remoteSongs ?? songRecords;
      let nextList: SongRecord[];
      let targetNumber: number;
      let commitMessage: string;

      if (editingSongId !== null) {
        targetNumber = editingSongId;
        let updatedExisting = false;
        const mapped = baseSongs.map((item) => {
          if (item.id === editingSongId) {
            updatedExisting = true;
            return sanitizeSongRecord({
              id: editingSongId,
              title: effectiveTitle,
              lyricist: effectiveLyricist,
              lyrics: effectiveLyrics,
            });
          }
          return item;
        });

        if (!updatedExisting) {
          mapped.push(
            sanitizeSongRecord({
              id: editingSongId,
              title: effectiveTitle,
              lyricist: effectiveLyricist,
              lyrics: effectiveLyrics,
            })
          );
        }

        nextList = reindexSongs(mapped);
        targetNumber =
          nextList.find(
            (s) => s.title === effectiveTitle && s.lyrics === effectiveLyrics
          )?.id ?? editingSongId;
        commitMessage = `Update Song ${targetNumber}: ${effectiveTitle}`;
      } else {
        const reindexedBase = reindexSongs(baseSongs);
        targetNumber = reindexedBase.length + 1;
        nextList = [
          ...reindexedBase,
          sanitizeSongRecord({
            id: targetNumber,
            title: effectiveTitle,
            lyricist: effectiveLyricist,
            lyrics: effectiveLyrics,
          }),
        ];
        commitMessage = `Add Song ${targetNumber}: ${effectiveTitle}`;
      }

      const updatedTsContent = generateSongsDataTs(nextList);

      await commitSongsDataToGitHub({
        token: githubToken,
        content: updatedTsContent,
        sha: snapshot.sha,
        message: commitMessage,
      });

      onSongsUpdated(nextList);
      setStatusMessage({
        text: `Saved & Pushed to GitHub — Song ${targetNumber} (${effectiveTitle})`,
        songNumber: targetNumber,
      });
      resetForm();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Failed to push changes to GitHub. You can use "Download songsData.ts" as a fallback.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSong = async (song: Song) => {
    setActionError(null);
    setStatusMessage(null);
    setDownloadNotice(null);
    setBusy(true);

    try {
      const snapshot = await fetchGitHubSongsFile(githubToken);
      const remoteSongs = snapshot.content
        ? extractSongsFromTsFile(snapshot.content)
        : null;

      if (snapshot.content && !remoteSongs) {
        throw new Error(
          'Could not parse INITIAL_SONGS from src/data/songsData.ts on GitHub.'
        );
      }

      const baseSongs = remoteSongs ?? songRecords;
      const remaining = reindexSongs(baseSongs.filter((item) => item.id !== song.number));
      const updatedTsContent = generateSongsDataTs(remaining);

      await commitSongsDataToGitHub({
        token: githubToken,
        content: updatedTsContent,
        sha: snapshot.sha,
        message: `Delete Song ${song.number}: ${song.title}`,
      });

      onSongsUpdated(remaining);
      setConfirmDeleteId(null);
      if (editingSongId === song.number) {
        resetForm();
      }
      setStatusMessage({
        text: `Saved & Pushed to GitHub — Deleted Song ${song.number} and re-indexed songs`,
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to delete song on GitHub.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadBackup = () => {
    setDownloadNotice(null);
    setActionError(null);

    try {
      const draftLyrics = lyrics.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
      const draftTitle = (title.trim() || extractDefaultTitleFromLyrics(draftLyrics)).trim();

      let recordsToExport = reindexSongs(songRecords);
      let message = 'Downloaded current src/data/songsData.ts.';

      if (draftLyrics && draftTitle) {
        if (editingSongId !== null) {
          recordsToExport = reindexSongs(
            songRecords.map((item) =>
              item.id === editingSongId
                ? sanitizeSongRecord({
                    id: editingSongId,
                    title: draftTitle,
                    lyricist: lyricist.trim() || 'Traditional',
                    lyrics: draftLyrics,
                  })
                : item
            )
          );
          message = `Downloaded songsData.ts with edited Song ${editingSongId} included.`;
        } else {
          recordsToExport = [
            ...recordsToExport,
            sanitizeSongRecord({
              id: recordsToExport.length + 1,
              title: draftTitle,
              lyricist: lyricist.trim() || 'Traditional',
              lyrics: draftLyrics,
            }),
          ];
          message = `Downloaded songsData.ts with draft Song ${recordsToExport.length} included.`;
        }
      }

      const tsContent = generateSongsDataTs(recordsToExport);
      const blob = new Blob([tsContent], { type: 'text/typescript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'songsData.ts';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadNotice(message);
    } catch {
      setActionError('Failed to generate songsData.ts download.');
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
              : 'Enter the admin password to add, edit, or delete songs in src/data/songsData.ts on GitHub.'}
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

      {(authMode === 'authenticated' || authMode === 'static-ready') && (
        <section className="pt-8">
          <div className="pb-6 border-b border-stone-200 dark:border-stone-800">
            <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#1C1917] dark:text-[#F4F1EA]">
              {editingSongId !== null ? `Edit Song ${editingSongId}` : 'Add New Song'}
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 tabular-nums">
              {songs.length} {songs.length === 1 ? 'song' : 'songs'} loaded
              <span aria-hidden="true" className="mx-2">·</span>
              <span className="font-mono text-xs">
                {GITHUB_OWNER}/{GITHUB_REPO} ({GITHUB_BRANCH}) · {FILE_PATH}
              </span>
            </p>
          </div>

          {!repoConfigured && (
            <p className="mt-5 text-sm text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700 rounded-md px-4 py-3 bg-white/70 dark:bg-[#1A1918]">
              Set <code className="font-mono">GITHUB_OWNER</code> and{' '}
              <code className="font-mono">GITHUB_REPO</code> in{' '}
              <code className="font-mono">src/config/github.ts</code> to enable direct GitHub commits.
            </p>
          )}

          <div className="mt-6 pb-6 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <label
                htmlFor="github-token"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA]"
              >
                <KeyRound className="w-4 h-4 text-stone-500 dark:text-stone-400" aria-hidden="true" />
                <span>GitHub Token</span>
              </label>
              {githubToken.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => handleGitHubTokenChange('')}
                  className="text-xs text-stone-500 dark:text-stone-400 hover:text-[#7C2D12] dark:hover:text-[#E2A856] underline underline-offset-4 cursor-pointer"
                >
                  Clear saved token
                </button>
              )}
            </div>
            <input
              id="github-token"
              type="password"
              value={githubToken}
              onChange={(e) => handleGitHubTokenChange(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a fine-grained GitHub token with Contents read/write access"
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm font-mono rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] placeholder:text-stone-400 dark:placeholder:text-stone-500 placeholder:font-sans"
            />
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5">
              Saved locally in this browser so you only enter it once.
            </p>
          </div>

          {statusMessage && (
            <div
              role="status"
              className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200"
            >
              <span className="inline-flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{statusMessage.text}</span>
              </span>
              {statusMessage.songNumber !== undefined && (
                <a
                  href={`/song/${statusMessage.songNumber}`}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      onOpenSong(statusMessage.songNumber!);
                    }
                  }}
                  className="font-medium underline underline-offset-4 hover:opacity-80 whitespace-nowrap"
                >
                  View Song {statusMessage.songNumber}
                </a>
              )}
            </div>
          )}

          {downloadNotice && (
            <p role="status" className="mt-4 text-sm text-stone-700 dark:text-stone-300">
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
                  value={displaySongNumber}
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-base tabular-nums rounded-md border border-stone-200 dark:border-stone-800 bg-stone-100/80 dark:bg-stone-900/70 text-stone-600 dark:text-stone-400 cursor-default"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="song-lyricist"
                  className="block text-sm font-medium text-[#1C1917] dark:text-[#F4F1EA] mb-1.5"
                >
                  Lyricist{' '}
                  <span className="font-normal text-stone-500 dark:text-stone-400">(optional)</span>
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

            {actionError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {actionError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-medium rounded-md bg-[#7C2D12] hover:bg-[#66240E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white dark:text-[#111110] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap cursor-pointer"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                <span>
                  {busy
                    ? 'Pushing to GitHub…'
                    : editingSongId !== null
                      ? `Update Song ${editingSongId} on GitHub`
                      : `Save Song ${nextSongNumber} to GitHub`}
                </span>
              </button>

              {editingSongId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={busy}
                  className="inline-flex items-center px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4 text-stone-500 dark:text-stone-400" aria-hidden="true" />
                <span>Download songsData.ts</span>
              </button>
            </div>
          </form>

          {songs.length > 0 && (
            <div className="mt-12 pt-8 border-t border-stone-200 dark:border-stone-800">
              <h2 className="font-editorial text-xl font-semibold text-[#1C1917] dark:text-[#F4F1EA]">
                Manage Existing Songs
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                Edit or delete a song and push the updated songsData.ts directly to GitHub.
              </p>

              <ul className="mt-4 border-y border-stone-200 dark:border-stone-800 divide-y divide-stone-200/90 dark:divide-stone-800/90">
                {songs.map((song) => {
                  const isDeletingThis = confirmDeleteId === song.number;
                  return (
                    <li
                      key={song.number}
                      className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-medium text-[#1C1917] dark:text-[#F4F1EA] truncate">
                          <span className="tabular-nums text-[#7C2D12] dark:text-[#E2A856] mr-2">
                            {song.number}.
                          </span>
                          {song.malayalamTitle || song.title}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                          {song.lyricist}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isDeletingThis ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeleteSong(song)}
                              className="px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md bg-red-700 hover:bg-red-800 text-white disabled:opacity-50 transition-colors duration-150 whitespace-nowrap cursor-pointer"
                            >
                              {busy ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors duration-150 whitespace-nowrap cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleStartEdit(song)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-[#1C1917] dark:text-[#F4F1EA] hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDeleteId(song.number)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1A1918] text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors duration-150 whitespace-nowrap cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
