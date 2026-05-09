/**
 * app.bsky.feed.like, repost, app.bsky.feed.sendInteractions.
 */
import { AtprotoCore } from '../core';
import { deduplicateRequest } from '../inFlightDedup';
import { posthog } from '../../../config/posthog';
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
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: likePost');
    }
    return `at://did:plc:offline-debug/app.bsky.feed.like/mock-like-${Date.now()}`;
  }

  const cacheKey = `like:${uri}:${cid}`;
  return deduplicateRequest(cacheKey, async () => {
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');

    const record = {
      $type: 'app.bsky.feed.like' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.feed.like.create({ repo: userDid }, record);
    posthog.capture('video_liked', { post_uri: uri });
    return response.uri;
  });
}

/**
 * Delete a like
 * @param likeUri - URI of the like to delete
 */
export async function deleteLike(likeUri: string): Promise<void> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: deleteLike');
    }
    return;
  }

  await AtprotoCore.ensureSession();
  const { api } = await AtprotoCore.getApiClient();
  const userDid = AtprotoCore.getCurrentUserDid();
  if (!userDid) throw new Error('No authenticated user');
  const parts = likeUri.split('/');
  const rkey = parts[parts.length - 1];
  await api.app.bsky.feed.like.delete({ repo: userDid, rkey });
  posthog.capture('video_unliked', { post_uri: likeUri });
}

/**
 * Repost a post and return the URI
 * @param uri - Post URI
 * @param cid - Post CID
 * @returns The URI of the created repost
 */
export async function repostPost(uri: string, cid: string): Promise<string> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: repostPost');
    }
    return `at://did:plc:offline-debug/app.bsky.feed.repost/mock-repost-${Date.now()}`;
  }

  const cacheKey = `repost:${uri}:${cid}`;
  return deduplicateRequest(cacheKey, async () => {
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');

    const record = {
      $type: 'app.bsky.feed.repost' as const,
      subject: { uri, cid },
      createdAt: new Date().toISOString(),
    };
    const { api } = await AtprotoCore.getApiClient();
    const response = await api.app.bsky.feed.repost.create({ repo: userDid }, record);
    posthog.capture('video_reposted', { post_uri: uri });
    return response.uri;
  });
}

/**
 * Delete a repost
 * @param repostURI - URI of the repost to delete
 */
export async function deleteRepost(repostURI: string): Promise<void> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: deleteRepost');
    }
    return;
  }

  const { api } = await AtprotoCore.getApiClient();
  const userDid = AtprotoCore.getCurrentUserDid();
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
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: sendFeedInteractions');
    }
    return;
  }

  if (!interactions || interactions.length === 0) {
    return;
  }

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

    if (!hasSendInteractionsMethod) {
      throw new Error('sendInteractions method not available on API client');
    }

    const payload = feed !== undefined && feed !== '' ? { feed, interactions } : { interactions };

    await api.app.bsky.feed.sendInteractions(payload, {
      headers: { 'atproto-proxy': proxyTarget },
    });

    setFeedInteractionsSupported(true, feed);
    logInteractionDiagnosticOnce('success', 'Feed interactions sent successfully (first success)', {
      feed: feed ?? null,
      interactionCount: interactions.length,
      events,
    });
  } catch (error: unknown) {
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

    if (isNotSupported) {
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
