/**
 * Chat reads go through ChatService, which already retries HTTP 429 via @atproto/common-web.
 * Disables React Query's default retries so backoff policies are not stacked.
 */
export const chatReactQueryOptions = {
  retry: false,
} as const;
