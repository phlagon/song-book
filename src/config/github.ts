export const GITHUB_OWNER = 'phlagon';
export const GITHUB_REPO = 'song-book';
export const GITHUB_BRANCH = 'main';
export const FILE_PATH = 'src/data/songsData.ts';

export const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${FILE_PATH}`;
export const CONTENTS_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;

const GITHUB_SLUG_REGEX = /^[A-Za-z0-9_.-]+$/;

export function isGitHubConfigured(): boolean {
  const owner = GITHUB_OWNER.trim();
  const repo = GITHUB_REPO.trim();
  return (
    owner.length > 0 &&
    repo.length > 0 &&
    owner !== 'YOUR_GITHUB_OWNER' &&
    repo !== 'YOUR_GITHUB_REPO' &&
    GITHUB_SLUG_REGEX.test(owner) &&
    GITHUB_SLUG_REGEX.test(repo)
  );
}
