import OpenAI from 'openai';
import { env, productContext } from './config';
import { createLogger } from './logger';

const logger = createLogger('OpenAI');

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';

function isRateLimitError(err: unknown): boolean {
  return err instanceof OpenAI.APIError && err.status === 429;
}

function parseRetryDelayMs(err: unknown): number {
  if (err instanceof OpenAI.APIError) {
    const retryAfter = err.headers?.['retry-after'];
    if (retryAfter) {
      const seconds = parseInt(String(retryAfter), 10);
      if (!isNaN(seconds)) return Math.min(seconds * 1000, 120_000);
    }
  }
  return 60_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generate(prompt: string): Promise<string> {
  const MAX_RETRIES = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
      });
      return response.choices[0].message.content?.trim() ?? '';
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err)) {
        const delayMs = parseRetryDelayMs(err);
        logger.warn(
          `Rate limit — waiting ${Math.round(delayMs / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}...`,
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

// ── Post Generation ──────────────────────────────────────────────────────────

export type PostType = 'promo' | 'testimonial' | 'product_highlight' | 'educational';

const postTypeInstructions: Record<PostType, string> = {
  promo:
    'Buat postingan promosi yang menarik dengan ajakan bertindak (call-to-action) yang jelas dan menciptakan rasa urgensi. Sertakan sudut pandang diskon atau penawaran terbatas.',
  testimonial:
    'Buat postingan yang terdengar seperti testimoni pelanggan atau kisah sukses. Buat terasa relatable, autentik, dan memotivasi.',
  product_highlight:
    'Buat postingan yang menyoroti satu fitur atau manfaat spesifik dari produk. Tetap fokus, energik, dan menarik perhatian.',
  educational:
    'Buat postingan edukatif/informatif yang memberikan nilai tambah terkait dunia fitness dan olahraga. Posisikan brand sebagai ahli yang terpercaya.',
};

const EQUIPMENT_POST_TYPES: PostType[] = ['product_highlight'];

function resolveUrlForPostType(postType: PostType): string {
  if (EQUIPMENT_POST_TYPES.includes(postType)) return productContext.lineUrls.equipment;
  return productContext.lineUrls.saas;
}

export async function generatePost(postType: PostType): Promise<string> {
  const hashtags = buildHashtags(postType);
  const uspText = productContext.usp.length > 0
    ? `Keunggulan produk: ${productContext.usp.join(', ')}.`
    : '';

  const writingStyle = (productContext as { writingStyle?: string }).writingStyle ?? '';

  const prompt = `STRICT RULES — NEVER VIOLATE:
1. NEVER mention any specific price or number in IDR (e.g. 99.000, 500.000, Rp X). Instead use "hubungi kami" or "dapatkan penawaran terbaik".
2. For equipment posts: always use URL https://ganesha-fitness-production.vercel.app/ — NEVER use ganeshafitness.id
3. For SaaS posts: always use URL https://ganeshafitness.id/ — NEVER use production URL
4. Do not repeat the same caption pattern as previous posts. Vary the opening, tone, and CTA each time.

Kamu adalah pakar social media marketing. ${postTypeInstructions[postType]}

Detail produk:
- Nama: ${productContext.name}
- Deskripsi: ${productContext.description}
- Harga: ${productContext.price} ${productContext.currency}
- URL Produk: ${resolveUrlForPostType(postType)}
${uspText}
- Target audiens: ${productContext.targetAudience}
- Gaya bahasa: ${productContext.toneOfVoice}
- Bahasa: ${productContext.language}
${writingStyle ? `- Panduan penulisan: ${writingStyle}` : ''}

Tulis postingan Facebook (maksimal 280 karakter untuk teks utama, tidak termasuk hashtag).
Akhiri dengan hashtag berikut di baris baru: ${hashtags}

Kembalikan HANYA teks postingan beserta hashtag. Tanpa penjelasan, tanpa tanda kutip di luar postingan.`;

  logger.info(`Generating ${postType} post...`);
  const text = await generate(prompt);
  return text;
}

function buildHashtags(postType: PostType): string {
  const groups = productContext.hashtagGroups as Record<string, string[]>;
  const general: string[] = groups?.general || [];
  const typeSpecific: string[] = groups?.[postType] || [];
  const all = [...new Set([...typeSpecific, ...general])].slice(0, productContext.maxHashtags);
  return all.join(' ');
}

// ── Comment Classification & Reply ───────────────────────────────────────────

export type CommentCategory = 'question' | 'compliment' | 'complaint' | 'spam' | 'other';

export interface CommentAnalysis {
  category: CommentCategory;
  reply: string;
  shouldReply: boolean;
}

export async function analyzeComment(commentText: string): Promise<CommentAnalysis> {
  const prompt = `Kamu adalah social media manager untuk brand "${productContext.name}" yang menjual alat fitness dan gym equipment di Indonesia.

Analisis komentar berikut dan balas dalam format JSON:
Komentar: "${commentText}"

Konteks produk:
- Nama: ${productContext.name}
- Deskripsi: ${productContext.description}
- Gaya bahasa: ${productContext.toneOfVoice}
- Bahasa balasan: ${productContext.language}

Klasifikasikan komentar dan buat balasan yang sesuai. Kembalikan HANYA JSON valid dengan struktur berikut:
{
  "category": "question" | "compliment" | "complaint" | "spam" | "other",
  "shouldReply": true | false,
  "reply": "teks balasan kamu di sini (string kosong jika shouldReply false)"
}

Aturan:
- question: pelanggan bertanya soal produk/layanan → balas dengan helpful dan informatif
- compliment: pujian atau feedback positif → ucapkan terima kasih dengan hangat dan semangat
- complaint: keluhan atau masalah → minta maaf dan tawarkan solusi, ajak DM untuk penanganan lebih lanjut
- spam: komentar tidak relevan, seperti bot, atau promosi → shouldReply: false
- other: netral atau tidak jelas → balas singkat dan ramah

Balasan maksimal 150 karakter. Sesuaikan dengan tone brand: ${productContext.toneOfVoice}. Gunakan Bahasa Indonesia yang energik dan motivasional.`;

  logger.info('Analyzing comment...', { text: commentText.substring(0, 50) });

  try {
    const raw = await generate(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in OpenAI response');
    const parsed = JSON.parse(jsonMatch[0]) as CommentAnalysis;
    return parsed;
  } catch (err) {
    logger.warn('Failed to parse OpenAI response, defaulting to safe reply', err);
    return {
      category: 'other',
      shouldReply: true,
      reply: `Makasih komentarnya! DM kami untuk info lebih lengkap tentang ${productContext.name}. 💪`,
    };
  }
}
