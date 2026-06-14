import axios from 'axios';
import { env } from './config';
import { createLogger } from './logger';
import type { PostType } from '../modules/postGenerator';

const logger = createLogger('Cloudinary');
const CLOUD_NAME = 'dwwlavncc';

// ── Content-line detection (unchanged logic) ──────────────────────────────────

const PROMO_SAAS_SIGNALS = ['saas', 'software', 'manajemen', 'member', 'absensi', 'aplikasi', 'digitalisasi'];
const PROMO_EQUIPMENT_SIGNALS = ['alat', 'smith', 'leg', 'press', 'cable', 'bench', 'rack', 'dumbbell', 'barbell'];

function resolveContentLine(postType: PostType, content?: string): 'saas' | 'equipment' {
  if (postType === 'product_highlight') return 'equipment';
  if (postType === 'promo' && content) {
    const lower = content.toLowerCase();
    const isSaaS = PROMO_SAAS_SIGNALS.some(w => lower.includes(w));
    const isEquipment = PROMO_EQUIPMENT_SIGNALS.some(w => lower.includes(w));
    if (isEquipment && !isSaaS) return 'equipment';
  }
  return 'saas';
}

// ── Recent-use tracker (in-memory, max 5) ─────────────────────────────────────

const recentlyUsed: string[] = [];
const RECENT_LIMIT = 5;

function recordUsed(publicId: string): void {
  recentlyUsed.push(publicId);
  if (recentlyUsed.length > RECENT_LIMIT) recentlyUsed.shift();
}

function excludeRecent(resources: Array<{ public_id: string }>): Array<{ public_id: string }> {
  const filtered = resources.filter(r => !recentlyUsed.includes(r.public_id));
  // If everything has been recently used, ignore the filter
  return filtered.length > 0 ? filtered : resources;
}

// ── Image pickers ─────────────────────────────────────────────────────────────

const SAAS_KEYWORDS = ['gym-owner', 'gym-dashboard', 'member', 'trainer'];

const PROMO_SAAS_PRIORITY = [
  'gym-dashboard',
  'gym-owner-laporan',
  'gym-owner-management-akun-member',
  'member-gym-profil',
];
const PROMO_SAAS_BLOCKED = ['paket', 'harga', 'pembayaran'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickForSaaS(resources: Array<{ public_id: string }>): { public_id: string } {
  const available = excludeRecent(resources);

  // 1. Keyword match among non-recent images
  const keywordMatches = available.filter(r =>
    SAAS_KEYWORDS.some(k => r.public_id.toLowerCase().includes(k)),
  );
  if (keywordMatches.length > 0) return pickRandom(keywordMatches);

  // 2. Any image whose public_id contains "gym"
  const gymImages = available.filter(r => r.public_id.toLowerCase().includes('gym'));
  if (gymImages.length > 0) return pickRandom(gymImages);

  // 3. Random from all non-recent
  return pickRandom(available);
}

function pickForPromoSaaS(resources: Array<{ public_id: string }>): { public_id: string } {
  // Exclude blocked and recently used
  const allowed = excludeRecent(
    resources.filter(r => !PROMO_SAAS_BLOCKED.some(b => r.public_id.toLowerCase().includes(b))),
  );

  // Try priority list in order
  for (const id of PROMO_SAAS_PRIORITY) {
    const match = allowed.find(r => r.public_id.toLowerCase().includes(id.toLowerCase()));
    if (match) return match;
  }

  // Fall back to general SaaS picker on allowed pool
  return pickForSaaS(allowed.length > 0 ? allowed : excludeRecent(resources));
}

function pickForEquipment(resources: Array<{ public_id: string }>): { public_id: string } {
  return pickRandom(excludeRecent(resources));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function toIGImageUrl(cloudinaryUrl: string): string {
  return cloudinaryUrl.replace('/upload/', '/upload/c_fill,ar_1:1,w_1080,f_jpg,q_auto/');
}

export async function pickImageForPostType(postType: PostType, content?: string): Promise<string | null> {
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) {
    logger.warn('Cloudinary credentials not configured — skipping image selection');
    return null;
  }

  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const res = await axios.get(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image`,
      {
        headers: { Authorization: `Basic ${auth}` },
        params: { max_results: 100 },
        timeout: 10000,
      },
    );

    const resources: Array<{ public_id: string }> = res.data.resources || [];
    if (resources.length === 0) {
      logger.warn('No images found in Cloudinary');
      return null;
    }

    const line = resolveContentLine(postType, content);
    const chosen = line === 'equipment'
      ? pickForEquipment(resources)
      : postType === 'promo'
        ? pickForPromoSaaS(resources)
        : pickForSaaS(resources);

    recordUsed(chosen.public_id);

    const url = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${chosen.public_id}.jpg`;
    logger.info(`Cloudinary image selected: ${chosen.public_id} (line: ${line}, post type: ${postType})`);
    return url;
  } catch (err) {
    logger.warn('Failed to fetch Cloudinary images', err);
    return null;
  }
}
