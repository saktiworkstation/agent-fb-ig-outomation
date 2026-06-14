import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function loadAppConfig() {
  const configPath = path.resolve(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return null;
}

export const appConfig = loadAppConfig();

export const env = {
  FB_PAGE_ID: requireEnv('FB_PAGE_ID'),
  FB_ACCESS_TOKEN: requireEnv('FB_ACCESS_TOKEN'),
  FB_AD_ACCOUNT_ID: process.env.FB_AD_ACCOUNT_ID || '',
  IG_USER_ID: process.env.IG_USER_ID || '',
  OPENAI_API_KEY: requireEnv('OPENAI_API_KEY'),
  POST_SCHEDULE: process.env.POST_SCHEDULE || '0 8,18 * * *',
  COMMENT_POLL_INTERVAL_MINUTES: parseInt(process.env.COMMENT_POLL_INTERVAL_MINUTES || '15', 10),
  DAILY_AD_BUDGET_USD: parseFloat(process.env.DAILY_AD_BUDGET_USD || '5.00'),
  AD_SPEND_ALERT_THRESHOLD_USD: parseFloat(process.env.AD_SPEND_ALERT_THRESHOLD_USD || '10.00'),
  AD_CTR_DROP_ALERT_THRESHOLD: parseFloat(process.env.AD_CTR_DROP_ALERT_THRESHOLD || '0.01'),
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
};

export const productContext = {
  name: appConfig?.product?.name || process.env.PRODUCT_NAME || 'My Product',
  description: appConfig?.product?.description || process.env.PRODUCT_DESCRIPTION || '',
  price: appConfig?.product?.price || process.env.PRODUCT_PRICE || '',
  currency: appConfig?.product?.currency || 'USD',
  url: appConfig?.product?.url || process.env.PRODUCT_URL || '',
  lineUrls: {
    saas: appConfig?.product?.lines?.saas?.url || appConfig?.product?.url || '',
    equipment: appConfig?.product?.lines?.equipment?.url || appConfig?.product?.url || '',
  },
  usp: appConfig?.product?.usp || [],
  toneOfVoice: appConfig?.brand?.toneOfVoice || 'casual',
  language: appConfig?.brand?.language || 'English',
  targetAudience: appConfig?.brand?.targetAudience || '',
  brandValues: appConfig?.brand?.brandValues || [],
  hashtagGroups: appConfig?.posting?.hashtagGroups || {},
  maxHashtags: appConfig?.posting?.maxHashtags || 10,
};
