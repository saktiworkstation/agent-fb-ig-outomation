import cron from 'node-cron';
import { fb } from '../lib/facebook';
import { env, appConfig } from '../lib/config';
import {
  insertCampaign,
  insertAdMetrics,
  getLatestAdMetrics,
  getRecentPosts,
  markPostPromoted,
} from '../db/database';
import { createLogger } from '../lib/logger';

const logger = createLogger('AdsManager');

const adsConfig = appConfig?.ads || {};

export interface CreateAdOptions {
  fbPostId?: string;       // Use existing post; if omitted, uses most recent unpromoted post
  dailyBudgetUSD?: number;
  durationDays?: number;
  campaignName?: string;
}

export async function createAdFromPost(options: CreateAdOptions = {}): Promise<void> {
  const adAccountId = env.FB_AD_ACCOUNT_ID;
  if (!adAccountId) {
    logger.error('FB_AD_ACCOUNT_ID not set — skipping ad creation');
    return;
  }

  // Resolve post ID
  let fbPostId = options.fbPostId;
  if (!fbPostId) {
    const posts = getRecentPosts(5);
    const unpromoted = posts.find(p => p.promoted === 0);
    if (!unpromoted) {
      logger.warn('No unpromoted posts found — publish a post first');
      return;
    }
    fbPostId = unpromoted.fb_post_id;
    logger.info(`Using most recent unpromoted post: ${fbPostId}`);
  }

  const dailyBudgetUSD = options.dailyBudgetUSD ?? env.DAILY_AD_BUDGET_USD;
  const dailyBudgetCents = Math.round(dailyBudgetUSD * 100);
  const durationDays = options.durationDays ?? adsConfig.defaultDurationDays ?? 7;
  const campaignName = options.campaignName ?? `Campaign - ${new Date().toISOString().split('T')[0]}`;

  logger.info(`Creating ad campaign`, {
    campaignName,
    fbPostId,
    dailyBudgetUSD,
    durationDays,
  });

  try {
    // 1. Create campaign
    const campaign = await fb.createCampaign(campaignName);
    logger.success(`Campaign created: ${campaign.id}`);

    // 2. Create ad set
    const audienceConfig = adsConfig.defaultAudience || {};
    const targeting = {
      age_min: audienceConfig.ageMin ?? 25,
      age_max: audienceConfig.ageMax ?? 45,
      genders: audienceConfig.genders ?? [1, 2],
      geo_locations: { countries: audienceConfig.countries ?? ['US'] },
    };

    const adSet = await fb.createAdSet(
      campaign.id,
      `${campaignName} - Ad Set`,
      dailyBudgetCents,
      targeting,
      durationDays,
      adsConfig.optimizationGoal ?? 'REACH',
      adsConfig.billingEvent ?? 'IMPRESSIONS',
    );
    logger.success(`Ad set created: ${adSet.id}`);

    // 3. Create ad creative from post
    const creative = await fb.createAdCreativeFromPost(fbPostId);
    logger.success(`Ad creative created: ${creative.id}`);

    // 4. Create ad
    const ad = await fb.createAd(adSet.id, creative.id, `${campaignName} - Ad`);
    logger.success(`Ad created and activated: ${ad.id}`);

    // 5. Save to DB
    insertCampaign(campaign.id, adSet.id, ad.id, fbPostId, dailyBudgetUSD, durationDays);
    markPostPromoted(fbPostId);

    logger.success('Ad campaign fully created and saved to database', {
      campaignId: campaign.id,
      adSetId: adSet.id,
      adId: ad.id,
    });
  } catch (err) {
    logger.error('Failed to create ad campaign', err);
    throw err;
  }
}

export async function fetchAndAlertMetrics(): Promise<void> {
  const adAccountId = env.FB_AD_ACCOUNT_ID;
  if (!adAccountId) {
    logger.warn('FB_AD_ACCOUNT_ID not set — skipping metrics fetch');
    return;
  }

  logger.info('Fetching daily ad metrics...');

  try {
    const insights = await fb.getAdInsights(adAccountId, 'today');

    if (insights.length === 0) {
      logger.info('No ad insights available for today');
      return;
    }

    for (const insight of insights) {
      const spend = parseFloat(insight.spend || '0');
      const ctr = parseFloat(insight.ctr || '0');
      const impressions = parseInt(insight.impressions || '0', 10);
      const reach = parseInt(insight.reach || '0', 10);
      const clicks = parseInt(insight.clicks || '0', 10);

      logger.info('Daily Ad Metrics', {
        date: insight.date_start,
        impressions,
        reach,
        clicks,
        spend: `$${spend.toFixed(2)}`,
        ctr: `${(ctr * 100).toFixed(2)}%`,
      });

      // Save metrics
      insertAdMetrics(adAccountId, insight.date_start, impressions, reach, clicks, spend, ctr);

      // Alerts
      if (spend > env.AD_SPEND_ALERT_THRESHOLD_USD) {
        logger.warn(`ALERT: Daily spend $${spend.toFixed(2)} exceeds threshold $${env.AD_SPEND_ALERT_THRESHOLD_USD}`);
      }

      if (ctr > 0 && ctr < env.AD_CTR_DROP_ALERT_THRESHOLD) {
        logger.warn(`ALERT: CTR ${(ctr * 100).toFixed(2)}% is below threshold ${(env.AD_CTR_DROP_ALERT_THRESHOLD * 100).toFixed(2)}%`);
      }
    }
  } catch (err) {
    logger.error('Failed to fetch ad metrics', err);
  }
}

export function startAdsMonitor(): void {
  // Check metrics daily at 9am
  const schedule = '0 9 * * *';
  logger.info('Starting ads monitor — daily at 9:00 AM');

  cron.schedule(schedule, async () => {
    logger.info('Ads metrics check triggered');
    try {
      await fetchAndAlertMetrics();
    } catch (err) {
      logger.error('Ads metrics check failed', err);
    }
  });

  logger.success('Ads monitor started');
}

export function printMetricsSummary(): void {
  const metrics = getLatestAdMetrics(10);
  if (metrics.length === 0) {
    logger.info('No ad metrics in database yet');
    return;
  }
  logger.info('Recent Ad Metrics', metrics);
}
