/**
 * Post view guards for unknown values (e.g. getPosts map values).
 * Uses SDK-native type guards directly.
 */
import { AppBskyFeedDefs } from '@atproto/api';
import type { PostView } from './types';

export function isValidPost(post: unknown): post is PostView {
  if (!post || typeof post !== 'object') return false;
  return !AppBskyFeedDefs.isNotFoundPost(post) && !AppBskyFeedDefs.isBlockedPost(post);
}
