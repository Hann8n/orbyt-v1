/**
 * Post view guards for unknown values (e.g. getPosts map values).
 * Delegates to lexicon-aligned guards in types.ts for ThreadPost unions.
 */

import type { BlockedPost, NotFoundPost, PostView, ThreadPost } from './types';
import {
  isBlockedPost as threadPostIsBlocked,
  isNotFoundPost as threadPostIsNotFound,
} from './types';

function isNotFoundPost(post: unknown): post is NotFoundPost {
  if (!post || typeof post !== 'object') return false;
  return threadPostIsNotFound(post as ThreadPost);
}

function isBlockedPost(post: unknown): post is BlockedPost {
  if (!post || typeof post !== 'object') return false;
  return threadPostIsBlocked(post as ThreadPost);
}

export function isValidPost(post: unknown): post is PostView {
  if (!post) return false;
  return !isNotFoundPost(post) && !isBlockedPost(post);
}
