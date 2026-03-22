/**
 * Orbyt Mix Warmup Service
 *
 * When orbyt-mix runs on Cloud Run with scale-to-zero, the first request after idle
 * hits a cold start (~2-5 seconds). This service pings the lightweight describeFeedGenerator
 * endpoint to wake the instance before the actual feed fetch, improving perceived latency.
 *
 * The describe endpoint requires no auth and returns static JSON.
 */

import { logger } from '../utils/logger';
import { ORBYT_MIX_FEED_BASE_URL, YOUR_MIX_FEED_GENERATOR_URI } from '../utils/constants';

const WARMUP_ENDPOINT = `${ORBYT_MIX_FEED_BASE_URL}/xrpc/app.bsky.feed.describeFeedGenerator`;
const WARMUP_TIMEOUT_MS = 8000; // Allow time for cold start

let lastWarmupTime = 0;
const WARMUP_COOLDOWN_MS = 60 * 1000; // Max once per minute to avoid unnecessary traffic
const INTERACTION_CAPABILITY_TTL_MS = 60 * 1000;

interface DescribeFeedGeneratorFeed {
  uri?: string;
  acceptsInteractions?: boolean;
}

interface DescribeFeedGeneratorResponse {
  feeds?: DescribeFeedGeneratorFeed[];
}

export interface OrbytMixInteractionCapability {
  describeSucceeded: boolean;
  acceptsInteractions: boolean;
  checkedAt: number;
}

let capabilityCache: OrbytMixInteractionCapability | null = null;
let capabilityRequestInFlight: Promise<OrbytMixInteractionCapability> | null = null;

/**
 * Fire a lightweight request to orbyt-mix to wake Cloud Run from scale-to-zero.
 * Safe to call frequently; cooldown prevents excessive traffic.
 * Does not block; failures are logged but not surfaced.
 */
export function warmupOrbytMix(): void {
  const now = Date.now();
  if (now - lastWarmupTime < WARMUP_COOLDOWN_MS) {
    return;
  }
  lastWarmupTime = now;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

  fetch(WARMUP_ENDPOINT, {
    method: 'GET',
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  })
    .then(res => {
      if (!res.ok) {
        logger.warn('Orbyt-mix warmup returned non-OK', {
          component: 'OrbytMixWarmupService',
          status: res.status,
        });
      }
    })
    .catch(err => {
      if (err.name !== 'AbortError') {
        logger.warn('Orbyt-mix warmup failed', {
          component: 'OrbytMixWarmupService',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
    .finally(() => clearTimeout(timeout));
}

async function fetchOrbytMixInteractionCapability(): Promise<OrbytMixInteractionCapability> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

  try {
    const response = await fetch(WARMUP_ENDPOINT, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        describeSucceeded: false,
        acceptsInteractions: false,
        checkedAt: Date.now(),
      };
    }

    const describe = (await response.json()) as DescribeFeedGeneratorResponse;
    const feedEntry = Array.isArray(describe.feeds)
      ? (describe.feeds.find(feed => feed?.uri === YOUR_MIX_FEED_GENERATOR_URI) ??
        describe.feeds[0])
      : null;
    const acceptsInteractions = feedEntry ? feedEntry.acceptsInteractions !== false : false;

    return {
      describeSucceeded: true,
      acceptsInteractions,
      checkedAt: Date.now(),
    };
  } catch (error: unknown) {
    if ((error as { name?: string })?.name !== 'AbortError') {
      logger.warn('Orbyt-mix capability check failed', {
        component: 'OrbytMixWarmupService',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      describeSucceeded: false,
      acceptsInteractions: false,
      checkedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read orbyt-mix interaction capability from describeFeedGenerator with short-lived caching.
 * This is safe for UI gating and does not block feed loading paths.
 */
export async function getOrbytMixInteractionCapability(
  forceRefresh = false
): Promise<OrbytMixInteractionCapability> {
  const now = Date.now();
  if (
    !forceRefresh &&
    capabilityCache &&
    now - capabilityCache.checkedAt < INTERACTION_CAPABILITY_TTL_MS
  ) {
    return capabilityCache;
  }

  if (capabilityRequestInFlight) {
    return capabilityRequestInFlight;
  }

  capabilityRequestInFlight = fetchOrbytMixInteractionCapability()
    .then(result => {
      capabilityCache = result;
      return result;
    })
    .finally(() => {
      capabilityRequestInFlight = null;
    });

  return capabilityRequestInFlight;
}
