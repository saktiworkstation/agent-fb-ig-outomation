import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { runPost } from './modules/postGenerator';
import { pollAndReplyComments } from './modules/commentReplier';
import { fetchAndAlertMetrics } from './modules/adsManager';
import { getRecentPosts, getLatestAdMetrics } from './db/database';
import { fb } from './lib/facebook';
import { env } from './lib/config';
import { logEmitter } from './lib/logBroadcaster';
import { createLogger } from './lib/logger';

const logger = createLogger('Server');
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// SSE log streaming
const sseClients: Response[] = [];

logEmitter.on('log', (line: string) => {
  const payload = `data: ${JSON.stringify({ line })}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
});

app.get('/api/status', async (_req: Request, res: Response) => {
  let fbOk = false, pageName: string | null = null, pageId: string | null = null;
  try {
    const page = await fb.testAuth();
    fbOk = true; pageName = page.name; pageId = page.id;
  } catch { /* fb failed */ }

  let igOk = false, igUsername: string | null = null;
  if (env.IG_USER_ID) {
    try {
      const ig = await fb.testIGAuth();
      igOk = true;
      igUsername = ig.username || ig.name || ig.id;
    } catch { /* ig failed */ }
  }

  res.json({ fb: fbOk, pageName, pageId, ig: igOk, igUsername, igConfigured: !!env.IG_USER_ID });
});

app.get('/api/dashboard', (_req: Request, res: Response) => {
  const posts = getRecentPosts(20);
  const today = new Date().toISOString().slice(0, 10);
  const todayPosts = posts.filter(p => p.posted_at.startsWith(today));
  const metrics = getLatestAdMetrics(5);
  res.json({ todayPosts, recentPosts: posts.slice(0, 5), metrics });
});

app.post('/api/post-now', async (req: Request, res: Response) => {
  const { postType } = req.body as { postType?: string };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runPost(postType as any);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/check-comments', async (_req: Request, res: Response) => {
  try {
    await pollAndReplyComments();
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.get('/api/ads-status', async (_req: Request, res: Response) => {
  try {
    await fetchAndAlertMetrics();
    const metrics = getLatestAdMetrics(10);
    res.json({ success: true, metrics });
  } catch (err: unknown) {
    const metrics = getLatestAdMetrics(10);
    res.json({ success: false, error: (err as Error).message, metrics });
  }
});

// Returns pages accessible by the configured token — helps diagnose wrong page ID / user token
app.get('/api/fb-pages', async (_req: Request, res: Response) => {
  try {
    const pages = await fb.getMyPages();
    const configuredId = env.FB_PAGE_ID;
    const matched = pages.find(p => p.id === configuredId);
    res.json({
      success: true,
      configuredPageId: configuredId,
      configuredPageFound: !!matched,
      pages,
      hint: matched
        ? 'Page ID and token match. If posting still fails, update FB_ACCESS_TOKEN in .env with the access_token from this page.'
        : `Page ID "${configuredId}" not found in accessible pages. Update FB_PAGE_ID in .env to one of the IDs listed in "pages", and set FB_ACCESS_TOKEN to its access_token.`,
    });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: (err as Error).message,
      hint: 'If error mentions "OAuthException" or code 190, the token is expired — generate a new Page Access Token from Meta Graph API Explorer.',
    });
  }
});

app.get('/api/logs', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);
  res.write(`data: ${JSON.stringify({ line: '[Log stream connected]' })}\n\n`);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

app.get('/api/config', (_req: Request, res: Response) => {
  const cfgPath = path.join(process.cwd(), 'config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    res.json(cfg);
  } catch {
    res.status(404).json({ error: 'config.json not found' });
  }
});

app.post('/api/config', (req: Request, res: Response) => {
  const cfgPath = path.join(process.cwd(), 'config.json');
  try {
    fs.writeFileSync(cfgPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export function startServer(): void {
  app.listen(PORT, () => {
    logger.success(`Web UI running at http://localhost:${PORT}`);
  });
}
