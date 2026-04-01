/**
 * app.bsky.feed.like, repost, app.bsky.feed.sendInteractions, video feedback.
 */
import { AppBskyFeedDefs } from '@atproto/api';
import { AtprotoCore } from '../core';
import { deduplicateRequest } from '../inFlightDedup';
import { storage } from '../../../utils/storage/storage';
import { logger } from '../../../utils/logger';
import type { Interaction } from '../types';
import {
  getFeedInteractionsSupported,
  setFeedInteractionsSupported,
} from './feedInteractionSupport';

const APPVIEW_SERVICE_PROXY = 'did:web:api.bsky.app#bsky_appview' as const;
const feedProxyDidCache = new Map<string, string | null>();

async function getFeedGeneratorProxy(feed: string | undefined): Promise<string | null> {
  if (!feed || !feed.startsWith('at://')) return null;

  if (feedProxyDidCache.has(feed)) {
    const cachedDid = feedProxyDidCache.get(feed);
    return cachedDid ? `${cachedDid}#bsky_fg` : null;
  }

  try {
    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.feed.getFeedGenerator({ feed });
    const feedServiceDid = response.data.view?.did ?? null;
    feedProxyDidCache.set(feed, feedServiceDid);
    return feedServiceDid ? `${feedServiceDid}#bsky_fg` : null;
  } catch {
    // Cache miss as null to avoid repeatedly querying for invalid/unresolvable feeds.
    feedProxyDidCache.set(feed, null);
    return null;
  }
}
const interactionDiagnosticsLogged = new Set<
  'attempt' | 'success' | 'unsupported' | 'unsupported-skip' | 'error'
>();

function logInteractionDiagnosticOnce(
  key: 'attempt' | 'success' | 'unsupported' | 'unsupported-skip' | 'error',
  message: string,
  context: Record<string, unknown>
): void {
  if (interactionDiagnosticsLogged.has(key)) return;
  interactionDiagnosticsLogged.add(key);
  logger.info(message, {
    component: 'feedInteractions',
    action: 'sendFeedInteractions',
    ...context,
  });
}

export async function likePost(uri: string, cid: string): Promise<string> {
  const cacheKey = `like:${uri}:${cid}`;
  return deduplicateRequest(cacheKey, async () => {
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');

    const record = {
      $type: 'app.bsky.feed.like' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.feed.like.create({ repo: userDid }, record);
    return response.uri;
  });
}

/**
 * Delete a like
 * @param likeUri - URI of the like to delete
 */
export async function deleteLike(likeUri: string): Promise<void> {
  await AtprotoCore.ensureSession();
  const { api } = await AtprotoCore.getApiClient();
  const userDid = await AtprotoCore.getCurrentUserDid();
  if (!userDid) throw new Error('No authenticated user');
  const parts = likeUri.split('/');
  const rkey = parts[parts.length - 1];
  await api.app.bsky.feed.like.delete({ repo: userDid, rkey });
}

/**
 * Repost a post and return the URI
 * @param uri - Post URI
 * @param cid - Post CID
 * @returns The URI of the created repost
 */
export async function repostPost(uri: string, cid: string): Promise<string> {
  const cacheKey = `repost:${uri}:${cid}`;
  return deduplicateRequest(cacheKey, async () => {
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');

    const record = {
      $type: 'app.bsky.feed.repost' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.feed.repost.create({ repo: userDid }, record);
    return response.uri;
  });
}

/**
 * Delete a repost
 * @param repostURI - URI of the repost to delete
 */
export async function deleteRepost(repostURI: string): Promise<void> {
  const { api } = await AtprotoCore.getApiClient();
  const userDid = await AtprotoCore.getCurrentUserDid();
  if (!userDid) throw new Error('No authenticated user');

  const parts = repostURI.split('/');
  const rkey = parts[parts.length - 1];
  await api.app.bsky.feed.repost.delete({ repo: userDid, rkey });
}

/**
 * @param feed - Optional feed generator AT-URI (`app.bsky.feed.sendInteractions` input).
 */
export async function sendFeedInteractions(
  interactions: Interaction[],
  feed?: string
): Promise<void> {
  if (!interactions || interactions.length === 0) {
    return;
  }

  // If we've previously confirmed the endpoint is not supported, skip quietly
  if (getFeedInteractionsSupported(feed) === false) {
    logInteractionDiagnosticOnce(
      'unsupported-skip',
      'Skipping feed interactions: endpoint flagged unsupported',
      {
        feed: feed ?? null,
        interactionCount: interactions.length,
      }
    );
    return;
  }

  const events = interactions
    .map(interaction => interaction.event)
    .filter((event): event is string => typeof event === 'string');
  const proxyTarget = (await getFeedGeneratorProxy(feed)) ?? APPVIEW_SERVICE_PROXY;

  logInteractionDiagnosticOnce('attempt', 'Sending feed interactions (first attempt)', {
    feed: feed ?? null,
    interactionCount: interactions.length,
    events,
    hasFeedContext: interactions.some(interaction => !!interaction.feedContext),
    hasReqId: interactions.some(interaction => !!interaction.reqId),
    proxy: proxyTarget,
  });

  try {
    await AtprotoCore.ensureSession();

    const { api } = await AtprotoCore.getApiClient();

    const hasSendInteractionsMethod = typeof api?.app?.bsky?.feed?.sendInteractions === 'function';

    // Send interactions directly to Bluesky's API
    if (!hasSendInteractionsMethod) {
      throw new Error('sendInteractions method not available on API client');
    }

    const payload = feed !== undefined && feed !== '' ? { feed, interactions } : { interactions };

    await api.app.bsky.feed.sendInteractions(payload, {
      headers: { 'atproto-proxy': proxyTarget },
    });

    // Mark endpoint as supported once we have a successful call
    setFeedInteractionsSupported(true, feed);
    logInteractionDiagnosticOnce('success', 'Feed interactions sent successfully (first success)', {
      feed: feed ?? null,
      interactionCount: interactions.length,
      events,
    });
  } catch (error: unknown) {
    // Check if the error is an unsupported endpoint - this is expected when:
    // 1. The PDS doesn't support this endpoint (older PDS versions)
    // 2. The feed generator doesn't support interactions
    // 3. The service returns "Method Not Implemented" (501)
    // Since interactions are best-effort, we should handle these silently
    const errorMessage = error instanceof Error ? error.message : String(error);
    const statusCode =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status?: unknown }).status
        : undefined;
    const errorCode =
      error && typeof error === 'object' && 'error' in error
        ? (error as { error?: unknown }).error
        : undefined;
    const is404 = statusCode === 404;
    const is501 = statusCode === 501;
    const isInvalidResponse =
      errorCode === 'Invalid Response' ||
      errorMessage.includes('invalid response') ||
      errorMessage.includes('The server gave an invalid response');
    const isProxyResolutionError = errorMessage.includes('could not resolve proxy did service url');
    const isNotSupported =
      is404 ||
      is501 ||
      isInvalidResponse ||
      isProxyResolutionError ||
      errorMessage === 'XRPCNotSupported' ||
      errorMessage.includes('NotSupported') ||
      errorMessage.includes('Method Not Implemented') ||
      errorCode === 'MethodNotImplemented';

    // Silently handle unsupported endpoint errors - these are expected when:
    // - PDS doesn't support the endpoint
    // - Feed generator doesn't accept interactions
    // - Session not fully authenticated yet (initial app load)
    // Interactions are best-effort and failures shouldn't spam logs
    if (isNotSupported) {
      // Remember that this endpoint is not supported so we can skip future attempts
      setFeedInteractionsSupported(false, feed);
      logInteractionDiagnosticOnce(
        'unsupported',
        'Feed interactions endpoint unsupported (first unsupported response)',
        {
          feed: feed ?? null,
          interactionCount: interactions.length,
          events,
          statusCode: statusCode ?? null,
          errorCode: errorCode ?? null,
          errorMessage,
        }
      );
      return;
    }

    logInteractionDiagnosticOnce('error', 'Feed interactions failed with non-unsupported error', {
      feed: feed ?? null,
      interactionCount: interactions.length,
      events,
      statusCode: statusCode ?? null,
      errorCode: errorCode ?? null,
      errorMessage,
    });
    throw error;
  }
}

/**
 * Send video feedback to feed generators
 * @deprecated Use sendFeedInteractions with Interaction[] directly instead
 * @param postUri - URI of the post
 * @param type - Feedback type (interested or not_interested)
 * @param sourceFeed - Optional source feed URI
 * @param feedContext - Optional feed context
 */
export async function sendVideoFeedback(
  postUri: string,
  type: 'interested' | 'not_interested',
  sourceFeed?: string,
  feedContext?: string
): Promise<void> {
  try {
    await AtprotoCore.ensureSession();

    // Get the current user's DID from OAuth session
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) {
      throw new Error('No authenticated user found');
    }

    // Determine target feed for the interaction
    // Priority: 1. sourceFeed (if post came from an algorithmic feed)
    //           2. User's selected algorithmic feed provider
    //           3. null (no target, just store locally)
    let targetFeed: string | null = null;

    // Import algorithmic feed providers to check if sourceFeed is one of them
    const { useUserStore } = await import('../../../stores/userStore');
    const { ALGORITHMIC_FEED_PROVIDERS } = await import('../../../utils/constants');
    const algorithmicFeedUris: string[] = Object.values(ALGORITHMIC_FEED_PROVIDERS).map(p => p.uri);

    if (sourceFeed && algorithmicFeedUris.includes(sourceFeed)) {
      // Post came from an algorithmic feed - route interaction to that feed
      targetFeed = sourceFeed;
    } else {
      // Fall back to user's selected algorithmic feed provider
      const { algorithmicFeedProvider } = useUserStore.getState();
      targetFeed = algorithmicFeedProvider;
    }

    // Store feedback in local storage for persistence/history
    const feedbackKey = `video_feedback_${postUri}`;
    const feedbackData = {
      postUri,
      type,
      timestamp: new Date().toISOString(),
      userDid: userDid,
      targetFeed: targetFeed,
    };
    storage.set(feedbackKey, JSON.stringify(feedbackData));

    // If we have a target feed, send the interaction to Bluesky's API
    // This communicates the preference to the feed generator
    if (targetFeed) {
      // Map our feedback types to Bluesky's interaction events using SDK constants
      // REQUESTMORE = show more like this, REQUESTLESS = show less like this
      const event =
        type === 'interested' ? AppBskyFeedDefs.REQUESTMORE : AppBskyFeedDefs.REQUESTLESS;

      // Build the interaction object using proper Interaction type from @atproto/api
      const interaction: Interaction = {
        $type: 'app.bsky.feed.defs#interaction',
        item: postUri,
        event: event,
      };

      // Include feedContext if provided (helps feed generators track context)
      if (feedContext) {
        interaction.feedContext = feedContext;
      }

      // Send the interaction using AtprotoFeedService.sendFeedInteractions
      // This ensures consistent error handling and deduplication
      await sendFeedInteractions([interaction], targetFeed);
    }
  } catch (_error: unknown) {
    // Interactions are best-effort; swallow errors
  }
}
