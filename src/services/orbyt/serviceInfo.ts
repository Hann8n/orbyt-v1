/**
 * `com.getorbyt.getServiceInfo`: which external services this Orbyt deployment
 * is attached to, so they can change without an app release. Per the lexicon,
 * the call is optional — when it fails, or the service predates `providers`,
 * the client keeps its built-in defaults (the `@orbyt/providers` Bluesky
 * network). A field absent from a returned `providers` means the deployment
 * has no such service.
 */
import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/utils/query/queryClient';
import { orbytPublicQuery } from './orbytApi';

interface ServiceInfoProviders {
  network: string;
  appView?: string;
  discoveryFeed?: string;
  discoveryFeedService?: string;
}

export interface OrbytProviders {
  /** `atproto-proxy` target for `app.bsky.*` reads. */
  appView: string;
  /** The feed generator behind Your Mix, or null when the deployment has none. */
  discoveryFeed: string | null;
}

/**
 * Bluesky's AppView. The session's `app.bsky.authFullApp` grant names this audience, so calls that
 * must be authorized under it (reports, feed interactions) are proxied here explicitly.
 */
export const BLUESKY_APPVIEW_PROXY = 'did:web:api.bsky.app#bsky_appview';

const DEFAULT_PROVIDERS: OrbytProviders = Object.freeze({
  appView: BLUESKY_APPVIEW_PROXY,
  discoveryFeed: 'at://did:plc:3guzzweuqraryl3rdkimjamk/app.bsky.feed.generator/videos-for-you',
});

const SERVICE_INFO_KEY = ['orbyt', 'service-info'] as const;
const PROVIDERS_KEY = ['orbyt', 'providers'] as const;
/** After a failed lookup, use the defaults for this long instead of waiting on the AppView again. */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
let lastFailureAt = 0;

export async function getOrbytProviders(): Promise<OrbytProviders> {
  if (Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) return DEFAULT_PROVIDERS;
  try {
    const providers = await queryClient.fetchQuery({
      queryKey: SERVICE_INFO_KEY,
      queryFn: async ({ signal }) =>
        (
          await orbytPublicQuery<{ providers?: ServiceInfoProviders }>(
            'com.getorbyt.getServiceInfo',
            undefined,
            { signal }
          )
        ).providers ?? null,
      staleTime: 60 * 60 * 1000,
      // Optional call: fall back to the defaults at once rather than retrying.
      retry: false,
    });
    if (!providers) return DEFAULT_PROVIDERS;
    return {
      appView: providers.appView || DEFAULT_PROVIDERS.appView,
      discoveryFeed: providers.discoveryFeed || null,
    };
  } catch {
    lastFailureAt = Date.now();
    return DEFAULT_PROVIDERS;
  }
}

export function useOrbytProviders() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: getOrbytProviders,
    staleTime: 60 * 60 * 1000,
  });
}
