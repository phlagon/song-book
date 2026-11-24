import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { appendSongToSongsTxt, getNextSongNumber } from './src/utils/formatSongEntry.ts';
import { parseSongsFile } from './src/utils/parseSongs.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const SONGS_FILE_PATH = path.resolve(PUBLIC_DIR, 'songs.txt');

if (!SONGS_FILE_PATH.startsWith(PUBLIC_DIR + path.sep)) {
  throw new Error('Invalid songs.txt path configuration.');
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15; // 15 minutes
const MAX_FAILED_ATTEMPTS = 10;

// In-memory server auth state
const activeSessions = new Map<string, number>();
const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();
let claimedAdminHash: { salt: string; hash: string } | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

function getEnvMasterPassword(): string {
  return (process.env.MASTER_ADMIN_PASSWORD ?? '').trim();
}

function isMasterConfigured(): boolean {
  return getEnvMasterPassword().length > 0 || claimedAdminHash !== null;
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(candidate: string): boolean {
  const envPassword = getEnvMasterPassword();
  if (envPassword.length > 0) {
    return crypto.timingSafeEqual(sha256Buffer(candidate), sha256Buffer(envPassword));
  }

  if (!claimedAdminHash) {
    return false;
  }

  const derived = crypto.scryptSync(candidate, claimedAdminHash.salt, 64);
  const expected = Buffer.from(claimedAdminHash.hash, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

function createSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function isValidSessionToken(token: string | null): boolean {
  if (!token) return false;
  const expiresAt = activeSessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function getClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function isRateLimited(clientKey: string): boolean {
  const record = failedLoginAttempts.get(clientKey);
  if (!record) return false;
  if (Date.now() > record.resetAt) {
    failedLoginAttempts.delete(clientKey);
    return false;
  }
  return record.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(clientKey: string): void {
  const now = Date.now();
  const existing = failedLoginAttempts.get(clientKey);
  if (!existing || now > existing.resetAt) {
    failedLoginAttempts.set(clientKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

function clearFailedAttempts(clientKey: string): void {
  failedLoginAttempts.delete(clientKey);
}

function requireMasterAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!isValidSessionToken(token)) {
    res.status(401).json({ error: 'Authentication required. Please sign in at /master.' });
    return;
  }
  next();
}

function enqueueSongsWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Serve live public/songs.txt directly with no-store caching in both dev and production
  app.get('/songs.txt', async (_req: Request, res: Response) => {
    try {
      const content = await fs.readFile(SONGS_FILE_PATH, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.status(200).send(content);
    } catch {
      res.status(404).type('text/plain').send('songs.txt not found');
    }
  });

  // Master admin status (checks if password is configured & if caller's token is valid)
  app.get('/api/master/status', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    res.json({
      configured: isMasterConfigured(),
      usesEnvSecret: getEnvMasterPassword().length > 0,
      authenticated: isValidSessionToken(token),
    });
  });

  // First-run one-time admin password setup (only available when MASTER_ADMIN_PASSWORD is unset and not yet claimed)
  app.post('/api/master/setup', (req: Request, res: Response) => {
    if (isMasterConfigured()) {
      res.status(409).json({ error: 'Admin password is already configured. Please sign in.' });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
      return;
    }

    claimedAdminHash = hashPassword(password);
    const token = createSessionToken();
    res.status(201).json({ token });
  });

  // Master admin login
  app.post('/api/master/login', (req: Request, res: Response) => {
    if (!isMasterConfigured()) {
      res.status(400).json({ error: 'Admin password has not been set up yet.' });
      return;
    }

    const clientKey = getClientKey(req);
    if (isRateLimited(clientKey)) {
      res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
    if (!password || !verifyPassword(password)) {
      recordFailedAttempt(clientKey);
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    clearFailedAttempts(clientKey);
    const token = createSessionToken();
    res.json({ token });
  });

  // Master admin logout
  app.post('/api/master/logout', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (token) {
      activeSessions.delete(token);
    }
    res.json({ ok: true });
  });

  // Authenticated endpoint to append a new song directly to public/songs.txt (UTF-8)
  app.post('/api/songs', requireMasterAuth, async (req: Request, res: Response) => {
    const rawTitle = typeof req.body?.title === 'string' ? req.body.title : '';
    const rawLyricist = typeof req.body?.lyricist === 'string' ? req.body.lyricist : '';
    const rawLyrics = typeof req.body?.lyrics === 'string' ? req.body.lyrics : '';

    const title = rawTitle.replace(/[\r\n]+/g, ' ').trim();
    const lyricist = rawLyricist.replace(/[\r\n]+/g, ' ').trim() || 'Traditional';
    const lyrics = rawLyrics.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');

    if (!title || title.length > 300) {
      res.status(400).json({ error: 'Song title is required (maximum 300 characters).' });
      return;
    }

    if (lyricist.length > 200) {
      res.status(400).json({ error: 'Lyricist name must be 200 characters or fewer.' });
      return;
    }

    if (!lyrics || lyrics.length > 50000) {
      res.status(400).json({ error: 'Song lyrics are required (maximum 50,000 characters).' });
      return;
    }

    if (/^\s*\*{0,3}\[\s*END\s+OF\s+SONG\s+\d+\s*\]\*{0,3}\s*$/im.test(lyrics)) {
      res.status(400).json({
        error: 'Lyrics must not contain an [END OF SONG X] marker; it is added automatically.',
      });
      return;
    }

    try {
      const result = await enqueueSongsWrite(async () => {
        let existingContent = '';
        try {
          existingContent = await fs.readFile(SONGS_FILE_PATH, 'utf8');
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw err;
          }
        }

        const parsed = parseSongsFile(existingContent);
        const nextNumber = getNextSongNumber(parsed.songs.map((s) => s.number));
        const updatedContent = appendSongToSongsTxt(existingContent, {
          number: nextNumber,
          title,
          lyricist,
          lyrics,
        });

        await fs.mkdir(PUBLIC_DIR, { recursive: true });
        await fs.writeFile(SONGS_FILE_PATH, updatedContent, 'utf8');

        // Also update dist/songs.txt if production build exists on disk
        if (IS_PRODUCTION) {
          const distSongsPath = path.resolve(DIST_DIR, 'songs.txt');
          if (distSongsPath.startsWith(DIST_DIR + path.sep)) {
            await fs.writeFile(distSongsPath, updatedContent, 'utf8').catch(() => undefined);
          }
        }

        return {
          number: nextNumber,
          title,
          lyricist,
        };
      });

      res.status(201).json({ song: result });
    } catch (err) {
      console.error('Failed to save song to public/songs.txt:', err);
      res.status(500).json({ error: 'Failed to save song to songs.txt.' });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
