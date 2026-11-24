import {
  CONTENTS_API_URL,
  GITHUB_BRANCH,
  RAW_URL,
  isGitHubConfigured,
} from '../config/github';
import type { Song as SongRecord } from '../data/songsData';
import { extractSongsFromTsFile, isValidSongRecordList } from './songsDataCodec';

export const SYNCED_SONGS_KEY = 'synced_songs';
export const GITHUB_TOKEN_KEY = 'github_pat_token';

/**
 * Encodes UTF-8 text (including Malayalam Unicode) to Base64 using TextEncoder.
 */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/**
 * Decodes a Base64 string returned by the GitHub Contents API into UTF-8 text.
 */
export function base64ToUtf8(base64: string): string {
  const cleaned = base64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder('utf-8').decode(bytes);
}

export function readSyncedSongs(): SongRecord[] | null {
  try {
    const raw = localStorage.getItem(SYNCED_SONGS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidSongRecordList(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSyncedSongs(songs: SongRecord[]): void {
  try {
    localStorage.setItem(SYNCED_SONGS_KEY, JSON.stringify(songs));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function readStoredGitHubToken(): string {
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeStoredGitHubToken(token: string): void {
  try {
    const trimmed = token.trim();
    if (trimmed) {
      localStorage.setItem(GITHUB_TOKEN_KEY, trimmed);
    } else {
      localStorage.removeItem(GITHUB_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Silently fetches src/data/songsData.ts from GitHub Raw URL and extracts INITIAL_SONGS.
 * Returns null silently when offline or if parsing fails.
 */
export async function fetchRawSongsFromGitHub(): Promise<SongRecord[] | null> {
  if (!isGitHubConfigured()) {
    return null;
  }

  try {
    const response = await fetch(`${RAW_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const tsText = await response.text();
    return extractSongsFromTsFile(tsText);
  } catch {
    return null;
  }
}

export interface GitHubFileSnapshot {
  sha: string | null;
  content: string;
}

/**
 * Fetches the latest SHA and UTF-8 content of src/data/songsData.ts from GitHub Contents API.
 */
export async function fetchGitHubSongsFile(token: string): Promise<GitHubFileSnapshot> {
  if (!isGitHubConfigured()) {
    throw new Error(
      'GitHub repository is not configured. Set GITHUB_OWNER and GITHUB_REPO in src/config/github.ts.'
    );
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new Error('Please enter your GitHub Token first.');
  }

  const url = `${CONTENTS_API_URL}?ref=${encodeURIComponent(GITHUB_BRANCH)}&t=${Date.now()}`;
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${trimmedToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (response.status === 404) {
    return { sha: null, content: '' };
  }

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { message?: string };
    if (response.status === 401) {
      throw new Error('GitHub authentication failed. Check that your GitHub Token is valid.');
    }
    if (response.status === 403) {
      throw new Error(
        errBody.message ||
          'GitHub denied access. Ensure your token has Contents read/write permission for this repo.'
      );
    }
    throw new Error(errBody.message || `GitHub API returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as {
    sha?: string;
    content?: string;
  };

  const decodedContent =
    typeof data.content === 'string' && data.content.length > 0
      ? base64ToUtf8(data.content)
      : '';

  return {
    sha: typeof data.sha === 'string' ? data.sha : null,
    content: decodedContent,
  };
}

/**
 * Commits updated src/data/songsData.ts directly to GitHub via PUT with UTF-8 Base64 encoding.
 */
export async function commitSongsToGitHub(params: {
  token: string;
  content: string;
  sha: string | null;
  message: string;
}): Promise<{ commitSha?: string }> {
  if (!isGitHubConfigured()) {
    throw new Error(
      'GitHub repository is not configured. Set GITHUB_OWNER and GITHUB_REPO in src/config/github.ts.'
    );
  }

  const trimmedToken = params.token.trim();
  if (!trimmedToken) {
    throw new Error('Please enter your GitHub Token first.');
  }

  const payload: {
    message: string;
    content: string;
    branch: string;
    sha?: string;
  } = {
    message: params.message,
    content: utf8ToBase64(params.content),
    branch: GITHUB_BRANCH,
  };

  if (params.sha) {
    payload.sha = params.sha;
  }

  const response = await fetch(CONTENTS_API_URL, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${trimmedToken}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { message?: string };
    if (response.status === 409) {
      throw new Error(
        'Conflict: src/data/songsData.ts was updated elsewhere on GitHub. Please try saving again.'
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        errBody.message ||
          'GitHub rejected the push. Verify your token has Contents read & write permission.'
      );
    }
    throw new Error(errBody.message || `Failed to push to GitHub (HTTP ${response.status}).`);
  }

  const data = (await response.json().catch(() => ({}))) as {
    commit?: { sha?: string };
  };

  return { commitSha: data.commit?.sha };
}

export const commitSongsTxtToGitHub = commitSongsToGitHub;
export const commitSongsDataToGitHub = commitSongsToGitHub;
