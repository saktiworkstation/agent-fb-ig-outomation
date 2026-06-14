import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../lib/logger';

const logger = createLogger('Database');
const DB_PATH = path.resolve(process.cwd(), 'data', 'agent.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fb_post_id  TEXT    NOT NULL UNIQUE,
    post_type   TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    posted_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    promoted    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS comments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id   TEXT    NOT NULL UNIQUE,
    post_id      TEXT    NOT NULL,
    message      TEXT    NOT NULL,
    author_name  TEXT,
    author_id    TEXT,
    category     TEXT,
    replied      INTEGER NOT NULL DEFAULT 0,
    reply_text   TEXT,
    replied_at   TEXT,
    seen_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ad_campaigns (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id     TEXT NOT NULL UNIQUE,
    ad_set_id       TEXT,
    ad_id           TEXT,
    fb_post_id      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    status          TEXT NOT NULL DEFAULT 'active',
    daily_budget    REAL,
    duration_days   INTEGER
  );

  CREATE TABLE IF NOT EXISTS ad_metrics (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id  TEXT NOT NULL,
    date         TEXT NOT NULL,
    impressions  INTEGER,
    reach        INTEGER,
    clicks       INTEGER,
    spend        REAL,
    ctr          REAL,
    fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

logger.info(`Database initialized at ${DB_PATH}`);

// ── Posts ─────────────────────────────────────────────────────────────────────

export interface PostRecord {
  id: number;
  fb_post_id: string;
  post_type: string;
  message: string;
  posted_at: string;
  promoted: number;
}

export function insertPost(fbPostId: string, postType: string, message: string): void {
  db.prepare(`
    INSERT INTO posts (fb_post_id, post_type, message) VALUES (?, ?, ?)
  `).run(fbPostId, postType, message);
}

export function getRecentPosts(limit = 20): PostRecord[] {
  return db.prepare(`SELECT * FROM posts ORDER BY posted_at DESC LIMIT ?`).all(limit) as PostRecord[];
}

export function markPostPromoted(fbPostId: string): void {
  db.prepare(`UPDATE posts SET promoted = 1 WHERE fb_post_id = ?`).run(fbPostId);
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface CommentRecord {
  id: number;
  comment_id: string;
  post_id: string;
  message: string;
  author_name: string | null;
  author_id: string | null;
  category: string | null;
  replied: number;
  reply_text: string | null;
  replied_at: string | null;
  seen_at: string;
}

export function commentExists(commentId: string): boolean {
  const row = db.prepare(`SELECT id FROM comments WHERE comment_id = ?`).get(commentId);
  return !!row;
}

export function insertComment(
  commentId: string,
  postId: string,
  message: string,
  authorName?: string,
  authorId?: string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO comments (comment_id, post_id, message, author_name, author_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(commentId, postId, message, authorName || null, authorId || null);
}

export function markCommentReplied(commentId: string, replyText: string, category: string): void {
  db.prepare(`
    UPDATE comments
    SET replied = 1, reply_text = ?, category = ?, replied_at = datetime('now')
    WHERE comment_id = ?
  `).run(replyText, category, commentId);
}

export function getUnrepliedComments(): CommentRecord[] {
  return db.prepare(`
    SELECT * FROM comments WHERE replied = 0 ORDER BY seen_at ASC
  `).all() as CommentRecord[];
}

// ── Ad Campaigns ─────────────────────────────────────────────────────────────

export function insertCampaign(
  campaignId: string,
  adSetId: string,
  adId: string,
  fbPostId: string,
  dailyBudget: number,
  durationDays: number,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO ad_campaigns (campaign_id, ad_set_id, ad_id, fb_post_id, daily_budget, duration_days)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(campaignId, adSetId, adId, fbPostId, dailyBudget, durationDays);
}

export function insertAdMetrics(
  campaignId: string,
  date: string,
  impressions: number,
  reach: number,
  clicks: number,
  spend: number,
  ctr: number,
): void {
  db.prepare(`
    INSERT INTO ad_metrics (campaign_id, date, impressions, reach, clicks, spend, ctr)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(campaignId, date, impressions, reach, clicks, spend, ctr);
}

export function getLatestAdMetrics(limit = 10) {
  return db.prepare(`
    SELECT * FROM ad_metrics ORDER BY fetched_at DESC LIMIT ?
  `).all(limit);
}

export type { DatabaseType };
export default db;
