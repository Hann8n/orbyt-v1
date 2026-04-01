/** Tracks whether `app.bsky.feed.sendInteractions` is supported per feed (null = unknown). */
const interactionsSupportedByFeed = new Map<string, boolean | null>();
const GLOBAL_FEED_KEY = '__global__';

export function getFeedInteractionsSupported(feed?: string): boolean | null {
  const key = feed && feed.length > 0 ? feed : GLOBAL_FEED_KEY;
  return interactionsSupportedByFeed.get(key) ?? null;
}

export function setFeedInteractionsSupported(value: boolean | null, feed?: string): void {
  const key = feed && feed.length > 0 ? feed : GLOBAL_FEED_KEY;
  interactionsSupportedByFeed.set(key, value);
}
