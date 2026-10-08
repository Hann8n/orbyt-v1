/**
 * Your Mix cursor format, ported from orbyt-platform
 * `packages/contracts/src/your-mix.ts` (also mirrored by iOS `YourMix.swift`
 * and the Byte bridge). Your Mix reads two sources in turn and never ends:
 *
 * - `discovery`: the personal feed generator (`providers.discoveryFeed`).
 * - `network`: Bluesky's top videos (`app.bsky.feed.searchPostsV2`).
 *
 * `src/__tests__/fixtures/your-mix.json` is the platform's shared fixture.
 */
export type YourMixSource = 'discovery' | 'network';

export interface YourMixPosition {
  source: YourMixSource;
  /** The source's own cursor, or `null` to start it from the top. */
  cursor: string | null;
}

/** The `app.bsky.feed.searchPostsV2` parameters for the `network` source. */
export const YOUR_MIX_NETWORK_SEARCH = Object.freeze({
  sort: 'top',
  hasVideo: true,
  excludeReplies: true,
});

const PREFIX: Record<YourMixSource, string> = { discovery: 'mix1.d.', network: 'mix1.n.' };

/** No cursor starts the generator; an unprefixed cursor is the generator's own. */
export function decodeYourMixCursor(cursor: string | null | undefined): YourMixPosition {
  if (!cursor) return { source: 'discovery', cursor: null };
  for (const source of ['discovery', 'network'] as const) {
    if (cursor.startsWith(PREFIX[source])) {
      return { source, cursor: cursor.slice(PREFIX[source].length) || null };
    }
  }
  return { source: 'discovery', cursor };
}

function encodeYourMixCursor(position: YourMixPosition): string {
  return PREFIX[position.source] + (position.cursor ?? '');
}

/**
 * The cursor after a page read at `from`, whose source answered `upstream`.
 * A source ends when it returns no cursor or echoes the one it was given.
 */
export function nextYourMixCursor(
  from: YourMixPosition,
  upstream: string | null | undefined
): string {
  const { source } = from;
  return encodeYourMixCursor(
    upstream && upstream !== from.cursor
      ? { source, cursor: upstream }
      : { source: source === 'discovery' ? 'network' : 'discovery', cursor: null }
  );
}
