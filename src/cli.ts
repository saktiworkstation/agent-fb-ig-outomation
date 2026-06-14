/**
 * CLI entry point for manual operations.
 * Usage: npx ts-node src/cli.ts <command> [args]
 *
 * Commands:
 *   auth-test             Test Facebook API authentication
 *   post [type]           Manually trigger a post (type: promo|testimonial|product_highlight|educational)
 *   poll-comments         Run a single comment poll cycle
 *   create-ad [postId]    Create ad from most recent post (or specify post ID)
 *   metrics               Fetch and display today's ad metrics
 *   metrics-history       Show metrics history from local DB
 */

import { createLogger } from './lib/logger';
import { fb } from './lib/facebook';
import { runPost, PostType } from './modules/postGenerator';
import { pollAndReplyComments } from './modules/commentReplier';
import { createAdFromPost, fetchAndAlertMetrics, printMetricsSummary } from './modules/adsManager';

const logger = createLogger('CLI');

async function main(): Promise<void> {
  const command = process.argv[2];
  const arg1 = process.argv[3];

  if (!command) {
    printHelp();
    return;
  }

  switch (command) {
    case 'auth-test': {
      logger.info('Testing Facebook authentication...');
      const page = await fb.testAuth();
      logger.success(`Authenticated! Page: "${page.name}" (ID: ${page.id})`);
      break;
    }

    case 'post': {
      const validTypes: PostType[] = ['promo', 'testimonial', 'product_highlight', 'educational'];
      const postType = validTypes.includes(arg1 as PostType) ? (arg1 as PostType) : undefined;
      if (arg1 && !postType) {
        logger.error(`Invalid post type "${arg1}". Valid: ${validTypes.join(', ')}`);
        process.exit(1);
      }
      await runPost(postType);
      break;
    }

    case 'poll-comments': {
      await pollAndReplyComments();
      break;
    }

    case 'create-ad': {
      await createAdFromPost({ fbPostId: arg1 });
      break;
    }

    case 'metrics': {
      await fetchAndAlertMetrics();
      break;
    }

    case 'metrics-history': {
      printMetricsSummary();
      break;
    }

    default: {
      logger.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
    }
  }
}

function printHelp(): void {
  console.log(`
Facebook Marketing Agent — CLI

Usage: npm run cli -- <command> [args]

Commands:
  auth-test              Test Facebook API connection
  post [type]            Publish a post immediately
                         Types: promo | testimonial | product_highlight | educational
  poll-comments          Run one comment poll & auto-reply cycle
  create-ad [postId]     Create a Facebook Ad from a post
                         (uses most recent unpromoted post if no ID given)
  metrics                Fetch today's ad metrics from Facebook
  metrics-history        Show recent metrics stored in local DB

Examples:
  npm run cli -- auth-test
  npm run cli -- post promo
  npm run cli -- create-ad 123456789_987654321
  npm run cli -- metrics
  `);
}

main().catch(err => {
  logger.error('CLI error', err);
  process.exit(1);
});
