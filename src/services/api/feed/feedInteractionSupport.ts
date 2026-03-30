/** Tracks whether `app.bsky.feed.sendInteractions` is supported (null = unknown). */
let interactionsSupported: boolean | null = null;

export function getFeedInteractionsSupported(): boolean | null {
  return interactionsSupported;
}

export function setFeedInteractionsSupported(value: boolean | null): void {
  interactionsSupported = value;
}
