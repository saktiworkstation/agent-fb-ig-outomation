import cron from 'node-cron';
import { fb } from '../lib/facebook';
import { generatePost, PostType as GeminiPostType } from '../lib/gemini';

export type PostType = GeminiPostType;
import { insertPost } from '../db/database';
import { env, appConfig } from '../lib/config';
import { createLogger } from '../lib/logger';
import { pickImageForPostType, toIGImageUrl } from '../lib/cloudinary';

const logger = createLogger('PostGenerator');

const POST_TYPES: PostType[] = appConfig?.posting?.postTypes || [
  'promo',
  'testimonial',
  'product_highlight',
  'educational',
];

let postTypeIndex = 0;

function nextPostType(): PostType {
  const type = POST_TYPES[postTypeIndex % POST_TYPES.length];
  postTypeIndex++;
  return type;
}

// Matches Indonesian/general price patterns: Rp 99.000 / Rp99.000,- / IDR 1.500.000
const PRICE_REGEX = /(?:Rp\.?|IDR)\s*\d[\d.,]*\d\s*[-]?/gi;

function sanitizePrices(text: string): string {
  if (!PRICE_REGEX.test(text)) return text;
  PRICE_REGEX.lastIndex = 0;
  return text
    .replace(PRICE_REGEX, 'Hubungi kami untuk harga terbaik')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function runPost(postType?: GeminiPostType, imageUrl?: string): Promise<void> {
  const type = postType || nextPostType();
  logger.info(`Running post generator — type: ${type}`);

  try {
    const message = sanitizePrices(await generatePost(type));
    logger.info('Generated post content', { preview: message.substring(0, 80) + '...' });

    // Resolve image: use caller-supplied URL or auto-pick from Cloudinary
    const resolvedImageUrl = imageUrl ?? await pickImageForPostType(type, message);

    let fbPostId: string;
    if (resolvedImageUrl) {
      const result = await fb.publishPhotoPost(message, resolvedImageUrl);
      fbPostId = result.id;
      logger.success(`Photo post published to Facebook! FB Post ID: ${fbPostId}`);
    } else {
      const result = await fb.publishPost(message);
      fbPostId = result.id;
      logger.success(`Post published! FB Post ID: ${fbPostId}`);
    }

    if (env.IG_USER_ID) {
      if (resolvedImageUrl) {
        try {
          const igResult = await fb.publishIGPost(message, toIGImageUrl(resolvedImageUrl));
          logger.success(`Post published to Instagram! IG Post ID: ${igResult.id}`);
        } catch (igErr) {
          logger.warn('Instagram post failed', igErr);
        }
      } else {
        logger.info('Instagram posting skipped — no image URL provided (Instagram requires an image)');
      }
    }

    insertPost(fbPostId, type, message);
    logger.info('Post saved to database');
  } catch (err) {
    logger.error('Failed to publish post', err);
    throw err;
  }
}

export function startPostScheduler(): void {
  const schedule = env.POST_SCHEDULE;
  logger.info(`Starting post scheduler with schedule: "${schedule}"`);

  if (!cron.validate(schedule)) {
    logger.error(`Invalid cron schedule: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    logger.info('Scheduled post triggered');
    try {
      await runPost();
    } catch (err) {
      logger.error('Scheduled post failed', err);
    }
  });

  logger.success('Post scheduler started');
}
