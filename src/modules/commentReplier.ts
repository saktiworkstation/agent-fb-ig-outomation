import cron from 'node-cron';
import { fb, FBComment } from '../lib/facebook';
import { analyzeComment } from '../lib/gemini';
import {
  commentExists,
  insertComment,
  markCommentReplied,
} from '../db/database';
import { env } from '../lib/config';
import { createLogger } from '../lib/logger';

const logger = createLogger('CommentReplier');

export async function pollAndReplyComments(): Promise<void> {
  logger.info('Polling for new comments...');

  try {
    const posts = await fb.getRecentPosts(5);
    if (posts.length === 0) {
      logger.info('No recent posts found');
      return;
    }

    let totalNew = 0;
    let totalReplied = 0;

    for (const post of posts) {
      const { newCount, repliedCount } = await processPostComments(post.id);
      totalNew += newCount;
      totalReplied += repliedCount;
    }

    logger.info(`Poll complete — new: ${totalNew}, replied: ${totalReplied}`);
  } catch (err) {
    logger.error('Error during comment poll', err);
    throw err;
  }
}

async function processPostComments(
  postId: string,
): Promise<{ newCount: number; repliedCount: number }> {
  let cursor: string | undefined;
  let newCount = 0;
  let repliedCount = 0;

  // Fetch all pages of comments
  while (true) {
    const response = await fb.getPostComments(postId, cursor);
    const comments: FBComment[] = response.data || [];

    if (comments.length === 0) break;

    for (const comment of comments) {
      if (commentExists(comment.id)) continue;

      newCount++;
      insertComment(
        comment.id,
        postId,
        comment.message,
        comment.from?.name,
        comment.from?.id,
      );

      await processComment(comment, postId);
      repliedCount++;

      // Small delay to avoid rate limits
      await delay(500);
    }

    cursor = response.paging?.cursors?.after;
    if (!cursor || comments.length < 100) break;
  }

  return { newCount, repliedCount };
}

async function processComment(comment: FBComment, postId: string): Promise<void> {
  logger.info(`Processing comment ${comment.id}`, {
    author: comment.from?.name,
    message: comment.message.substring(0, 60),
  });

  const analysis = await analyzeComment(comment.message);
  logger.info(`Comment classified as: ${analysis.category}`, {
    shouldReply: analysis.shouldReply,
  });

  if (!analysis.shouldReply || !analysis.reply) {
    markCommentReplied(comment.id, '', analysis.category);
    logger.info(`Skipping reply for ${analysis.category} comment`);
    return;
  }

  try {
    await fb.replyToComment(comment.id, analysis.reply);
    markCommentReplied(comment.id, analysis.reply, analysis.category);
    logger.success(`Replied to comment ${comment.id}`, {
      reply: analysis.reply.substring(0, 60),
    });
  } catch (err) {
    logger.error(`Failed to reply to comment ${comment.id}`, err);
    // Still mark as processed to avoid infinite retries on permission errors
    markCommentReplied(comment.id, '', analysis.category);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function startCommentPoller(): void {
  const intervalMinutes = env.COMMENT_POLL_INTERVAL_MINUTES;
  const cronSchedule = `*/${intervalMinutes} * * * *`;

  logger.info(`Starting comment poller — every ${intervalMinutes} minutes`);

  if (!cron.validate(cronSchedule)) {
    logger.error(`Invalid cron schedule derived: ${cronSchedule}`);
    return;
  }

  cron.schedule(cronSchedule, async () => {
    logger.info('Comment poll triggered');
    try {
      await pollAndReplyComments();
    } catch (err) {
      logger.error('Comment poll failed', err);
    }
  });

  logger.success('Comment poller started');
}
