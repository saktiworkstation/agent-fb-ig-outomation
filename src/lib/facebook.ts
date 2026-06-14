import axios, { AxiosInstance } from 'axios';
import { env } from './config';
import { createLogger } from './logger';

const logger = createLogger('FacebookAPI');
const BASE_URL = 'https://graph.facebook.com/v22.0';

export interface FBPost {
  id: string;
  message?: string;
  created_time: string;
}

export interface FBComment {
  id: string;
  message: string;
  from?: { id: string; name: string };
  created_time: string;
}

export interface FBAdCreative {
  id: string;
}

export interface FBCampaign {
  id: string;
  name: string;
}

export interface FBAdSet {
  id: string;
  name: string;
}

export interface FBAdInsights {
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  ctr: string;
  date_start: string;
  date_stop: string;
}

export interface FBPageInfo {
  id: string;
  name: string;
  access_token: string;
  category?: string;
}

type FbError = Error & { status?: number };

class FacebookClient {
  private http: AxiosInstance;
  private pageId: string;
  private accessToken: string;
  private pageTokenReady = false;

  constructor() {
    this.pageId = env.FB_PAGE_ID;
    this.accessToken = env.FB_ACCESS_TOKEN;
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
    });

    // Lift Facebook's error message out of the response body so logs are readable
    this.http.interceptors.response.use(
      res => res,
      err => {
        const fbErr = err.response?.data?.error;
        if (fbErr) {
          const msg = `FB API ${fbErr.code ?? ''}: ${fbErr.message}` +
            (fbErr.error_subcode ? ` (subcode ${fbErr.error_subcode})` : '');
          const enhanced: FbError = new Error(msg);
          enhanced.status = err.response?.status;
          throw enhanced;
        }
        throw err;
      },
    );
  }

  private params(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { access_token: this.accessToken, ...extra };
  }

  // ── Page Token Init ───────────────────────────────────────────────────────
  // Fetches the Page Access Token directly from the page node using whatever
  // token is currently configured (User Token, System User Token, or Page Token).
  // GET /{page-id}?fields=access_token works for all token types that have page access.
  // Called once at startup; also used as fallback if publish/read returns 403/404.

  async init(): Promise<void> {
    if (this.pageTokenReady) return;
    try {
      const res = await this.http.get(`/${this.pageId}`, {
        params: this.params({ fields: 'id,name,access_token' }),
      });
      const pageToken: string | undefined = res.data.access_token;
      if (pageToken) {
        this.accessToken = pageToken;
        this.pageTokenReady = true;
        logger.info(`Page Access Token acquired for "${res.data.name}" — stored in memory.`);
      } else {
        // Token is already a Page Access Token — access_token field not returned in that case
        this.pageTokenReady = true;
        logger.info('Token is already a Page Access Token — no exchange needed.');
      }
    } catch (err) {
      logger.warn('Could not fetch Page Access Token from page node — using token as-is', err);
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async testAuth(): Promise<{ id: string; name: string }> {
    const res = await this.http.get(`/${this.pageId}`, {
      params: this.params({ fields: 'id,name' }),
    });
    return res.data;
  }

  // Returns all pages accessible by the current token — used by /api/fb-pages diagnostic
  async getMyPages(): Promise<FBPageInfo[]> {
    const res = await this.http.get('/me/accounts', {
      params: this.params({ fields: 'id,name,access_token,category' }),
    });
    return res.data.data || [];
  }

  // ── Posts ─────────────────────────────────────────────────────────────────

  async publishPost(message: string): Promise<{ id: string }> {
    logger.info('Publishing post to Facebook page...');
    try {
      const res = await this.http.post(`/${this.pageId}/feed`, null, {
        params: this.params({ message }),
      });
      return res.data;
    } catch (err) {
      // 403/404 means token lacks pages_manage_posts — try fetching page token once
      if ((err as FbError).status === 403 || (err as FbError).status === 404) {
        logger.warn(`publishPost got ${(err as FbError).status} — re-fetching Page Access Token...`);
        this.pageTokenReady = false;
        await this.init();
        if (this.pageTokenReady) {
          const res = await this.http.post(`/${this.pageId}/feed`, null, {
            params: this.params({ message }),
          });
          return res.data;
        }
      }
      throw err;
    }
  }

  async publishPhotoPost(caption: string, imageUrl: string): Promise<{ id: string; post_id?: string }> {
    logger.info('Publishing photo post to Facebook page...');
    const res = await this.http.post(`/${this.pageId}/photos`, null, {
      params: this.params({ caption, url: imageUrl }),
    });
    return res.data;
  }

  async getRecentPosts(limit = 10): Promise<FBPost[]> {
    // /posts deprecated in v18.0 for page-authored content; /published_posts is correct
    try {
      const res = await this.http.get(`/${this.pageId}/published_posts`, {
        params: this.params({ fields: 'id,message,created_time', limit }),
      });
      return res.data.data || [];
    } catch (err) {
      if ((err as FbError).status === 400 || (err as FbError).status === 403) {
        logger.warn('getRecentPosts failed — re-fetching Page Access Token...');
        this.pageTokenReady = false;
        await this.init();
        if (this.pageTokenReady) {
          const res = await this.http.get(`/${this.pageId}/published_posts`, {
            params: this.params({ fields: 'id,message,created_time', limit }),
          });
          return res.data.data || [];
        }
      }
      throw err;
    }
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async getPostComments(postId: string, after?: string): Promise<{ data: FBComment[]; paging?: { cursors?: { after?: string } } }> {
    const res = await this.http.get(`/${postId}/comments`, {
      params: this.params({
        fields: 'id,message,from,created_time',
        limit: 100,
        ...(after ? { after } : {}),
      }),
    });
    return res.data;
  }

  async replyToComment(commentId: string, message: string): Promise<{ id: string }> {
    // Send as form body — more reliable than query params for POST in newer API versions
    const body = new URLSearchParams({
      access_token: this.accessToken,
      message,
    });
    const res = await this.http.post(`/${commentId}/comments`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return res.data;
  }

  // ── Ads ───────────────────────────────────────────────────────────────────

  async createCampaign(name: string, objective = 'OUTCOME_AWARENESS'): Promise<FBCampaign> {
    const adAccountId = env.FB_AD_ACCOUNT_ID;
    if (!adAccountId) throw new Error('FB_AD_ACCOUNT_ID not set');
    const res = await this.http.post(`/${adAccountId}/campaigns`, null, {
      params: this.params({
        name,
        objective,
        status: 'PAUSED',
        special_ad_categories: [],
      }),
    });
    return res.data;
  }

  async createAdSet(
    campaignId: string,
    name: string,
    dailyBudgetCents: number,
    audience: {
      age_min: number;
      age_max: number;
      genders: number[];
      geo_locations: { countries: string[] };
    },
    durationDays: number,
    optimizationGoal = 'REACH',
    billingEvent = 'IMPRESSIONS',
  ): Promise<FBAdSet> {
    const adAccountId = env.FB_AD_ACCOUNT_ID;
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + durationDays * 86400;
    const res = await this.http.post(`/${adAccountId}/adsets`, null, {
      params: this.params({
        name,
        campaign_id: campaignId,
        daily_budget: dailyBudgetCents,
        billing_event: billingEvent,
        optimization_goal: optimizationGoal,
        targeting: JSON.stringify(audience),
        start_time: startTime,
        end_time: endTime,
        status: 'PAUSED',
      }),
    });
    return res.data;
  }

  async createAdCreativeFromPost(pagePostId: string): Promise<FBAdCreative> {
    const adAccountId = env.FB_AD_ACCOUNT_ID;
    const res = await this.http.post(`/${adAccountId}/adcreatives`, null, {
      params: this.params({
        name: `Creative from post ${pagePostId}`,
        object_story_id: `${this.pageId}_${pagePostId}`,
      }),
    });
    return res.data;
  }

  async createAd(adSetId: string, creativeId: string, name: string): Promise<{ id: string }> {
    const adAccountId = env.FB_AD_ACCOUNT_ID;
    const res = await this.http.post(`/${adAccountId}/ads`, null, {
      params: this.params({
        name,
        adset_id: adSetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status: 'ACTIVE',
      }),
    });
    return res.data;
  }

  async getAdInsights(adAccountId: string, datePreset = 'today'): Promise<FBAdInsights[]> {
    const accountId = adAccountId || env.FB_AD_ACCOUNT_ID;
    const res = await this.http.get(`/${accountId}/insights`, {
      params: this.params({
        fields: 'impressions,reach,clicks,spend,ctr',
        date_preset: datePreset,
        level: 'account',
      }),
    });
    return res.data.data || [];
  }

  // ── Instagram ─────────────────────────────────────────────────────────────

  async testIGAuth(): Promise<{ id: string; username?: string; name?: string }> {
    const igUserId = env.IG_USER_ID;
    if (!igUserId) throw new Error('IG_USER_ID not configured');
    const res = await this.http.get(`/${igUserId}`, {
      params: this.params({ fields: 'id,name,username' }),
    });
    return res.data;
  }

  async publishIGPost(caption: string, imageUrl?: string): Promise<{ id: string }> {
    const igUserId = env.IG_USER_ID;
    if (!igUserId) throw new Error('IG_USER_ID not configured');
    if (!imageUrl) throw new Error('Instagram requires an image_url to publish a post');

    logger.info('Creating Instagram media container…');
    const containerRes = await this.http.post(`/${igUserId}/media`, null, {
      params: this.params({ caption, image_url: imageUrl }),
    });
    const containerId: string = containerRes.data.id;

    logger.info('Publishing Instagram media container…');
    const publishRes = await this.http.post(`/${igUserId}/media_publish`, null, {
      params: this.params({ creation_id: containerId }),
    });
    return publishRes.data;
  }
}

export const fb = new FacebookClient();
