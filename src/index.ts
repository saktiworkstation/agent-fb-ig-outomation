import { createLogger } from './lib/logger';
import { fb } from './lib/facebook';
import { startPostScheduler } from './modules/postGenerator';
import { startCommentPoller } from './modules/commentReplier';
import { startAdsMonitor } from './modules/adsManager';
import { startServer } from './server';

const logger = createLogger('Agent');

async function main(): Promise<void> {
  logger.info('=== Facebook Marketing Agent Starting ===');

  // Test Facebook auth and acquire Page Access Token
  try {
    const page = await fb.testAuth();
    logger.success(`Connected to Facebook Page: "${page.name}" (ID: ${page.id})`);
    await fb.init();
  } catch (err) {
    logger.error('Facebook authentication failed', err);
    logger.error('Check FB_PAGE_ID and FB_ACCESS_TOKEN in your .env file');
    process.exit(1);
  }

  // Start web UI and all modules
  startServer();
  startPostScheduler();
  startCommentPoller();
  startAdsMonitor();

  logger.success('=== All modules running. Press Ctrl+C to stop. ===');

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('Shutting down...');
    process.exit(0);
  });
}

main().catch(err => {
  logger.error('Fatal error during startup', err);
  process.exit(1);
});
