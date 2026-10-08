/**
 * Centralized Query Key Factory
 * Provides consistent, type-safe query keys for all React Query operations
 * Follows React Query best practices for hierarchical key structure
 *
 * Auth/session cache invalidation (see `userStore`): viewer state (likes, follows, bookmarks,
 * notifications) is cached under keys that are not DID-scoped, so every query outside the public
 * roots (`auth`, `channels`, `klipy`, `discourse`, `orbyt`) belongs to the signed-in account.
 * - **signOut / corrupted-session reset**: `clearAllCaches()` cancels and removes those queries.
 * - **Account switch, sign-in, sign-up** (`resetQueriesForAccount`): once a session for a
 *   different account than the one signed in before is active, those queries are reset, so every
 *   mounted screen refetches as the new account.
 * - **Restore of the same account**: no wipe.
 */

// Base keys - defined first to avoid circular references
const feedBase = ['feed'] as const;
const postsBase = ['posts'] as const;
const profilesBase = ['profiles'] as const;
const orbytProfileBase = ['orbyt-profile'] as const;
const commentsBase = ['comments'] as const;
const likesBase = ['likes'] as const;
const blocksBase = ['blocks'] as const;
const mutesBase = ['mutes'] as const;
const feedsBase = ['feeds'] as const;
const searchBase = ['search'] as const;
const moderationBase = ['moderation'] as const;
const klipyBase = ['klipy'] as const;
const exploreBase = ['explore'] as const;
const authBase = ['auth'] as const;

export const queryKeys = {
  auth: {
    all: authBase,
    /** Unauthenticated `public.api.bsky.app` actor search (sign-in handle picker). */
    publicActorSearch: (term: string) => [...authBase, 'publicActorSearch', term] as const,
  },

  // Feed queries (merged from FeedService)
  feed: {
    all: feedBase,
    byOption: (feedOption: string) => [...feedBase, feedOption] as const,
    byUser: (feedOption: string, userDid?: string) =>
      userDid
        ? ([...feedBase, feedOption, userDid] as const)
        : ([...feedBase, feedOption] as const),
    infinite: (feedOption: string, userDid?: string) =>
      [...queryKeys.feed.byUser(feedOption, userDid), 'infinite'] as const,
    batch: (feedOption: string, userDid?: string) =>
      [...queryKeys.feed.byUser(feedOption, userDid), 'batch'] as const,
    search: (query: string) => [...feedBase, 'search', query] as const,
  },

  /**
   * Single posts by URI (a full-height video opened from a link). A root of their own, so the
   * `feed` root holds only paginated feeds; viewer state makes them account-scoped.
   */
  posts: {
    all: postsBase,
    detail: (uri: string) => [...postsBase, uri] as const,
  },

  // Profile queries (merged from ProfileService and FeedService)
  // All profile cache keys use DID as identifier (not handle)
  profiles: {
    all: profilesBase,
    detail: (did: string) => [...profilesBase, 'detail', did] as const,
    byHandle: (handle: string) => [...profilesBase, 'byHandle', handle.toLowerCase()] as const,
    lists: () => [...profilesBase, 'list'] as const,
    list: (filters?: string) =>
      filters
        ? ([...profilesBase, 'list', { filters }] as const)
        : ([...profilesBase, 'list'] as const),
    details: () => [...profilesBase, 'detail'] as const,
    refresh: (did: string) => [...profilesBase, 'detail', did, 'refresh', Date.now()] as const,
  },

  // orbyt profile queries
  orbytProfile: {
    all: orbytProfileBase,
    byDid: (did: string) => [...orbytProfileBase, did] as const,
    current: () => [...orbytProfileBase, 'current'] as const,
    /** `com.getorbyt.actor.getColorPalette` — server-owned pairs shared with Byte. */
    colorPalette: () => [...orbytProfileBase, 'color-palette'] as const,
  },

  // Comment queries (merged from FeedService)
  comments: {
    all: commentsBase,
    byPost: (postUri: string) => [...commentsBase, postUri] as const,
    infinite: () => [...commentsBase, 'infinite'] as const,
    infiniteByPost: (postUri: string) => [...commentsBase, 'infinite', postUri] as const,
  },

  // Like queries (merged from FeedService)
  likes: {
    all: likesBase,
    byPost: (postUri: string) => [...likesBase, postUri] as const,
    infinite: () => [...likesBase, 'infinite'] as const,
    infiniteByPost: (postUri: string) => [...queryKeys.likes.infinite(), postUri] as const,
  },

  // Bookmark queries
  bookmarks: {
    all: ['bookmarks'] as const,
    list: () => ['bookmarks', 'list'] as const,
  },

  // Block/Mute queries
  blocks: {
    all: blocksBase,
    status: (did: string) => [...blocksBase, did] as const,
  },
  mutes: {
    all: mutesBase,
    status: (did: string) => [...mutesBase, did] as const,
  },

  // Feed discovery queries (merged from FeedService)
  feeds: {
    all: feedsBase,
    search: (query: string) => [...feedsBase, 'search', query] as const,
    details: () => [...feedsBase, 'detail'] as const,
    detail: (uri: string) => [...queryKeys.feeds.details(), uri] as const,
    infinite: (uri: string) => [...queryKeys.feeds.detail(uri), 'infinite'] as const,
  },

  // Search queries
  search: {
    all: searchBase,
    unified: (query: string) => [...searchBase, 'unified', query] as const,
    profiles: (query: string) => [...searchBase, 'profiles', query] as const,
    feeds: (query: string) => [...searchBase, 'feeds', query] as const,
    hashtags: (query: string) => [...searchBase, 'hashtags', query] as const,
  },

  // Tab bar unread (notifications)
  unread: {
    summary: () => ['unread', 'summary'] as const,
  },

  // Notification queries
  notifications: {
    all: ['notifications'] as const,
    lists: () => [...queryKeys.notifications.all, 'list'] as const,
    list: (filterReasons?: import('../../services/api/types').NotificationReason[]) =>
      filterReasons && filterReasons.length > 0
        ? ([
            ...queryKeys.notifications.lists(),
            { reasons: filterReasons.sort().join(',') },
          ] as const)
        : ([...queryKeys.notifications.lists()] as const),
  },

  // Channel queries (merged from ChannelService)
  channels: {
    all: ['channels'] as const,
    /** The Orbyt Community directory (`com.getorbyt.community.listCommunities`). */
    metadata: () => [...queryKeys.channels.all, 'metadata'] as const,
    /** The Community a post was published to (`com.getorbyt.community.getPostCommunities`). */
    postCommunity: (postUri: string) =>
      [...queryKeys.channels.all, 'post-community', postUri] as const,
    detail: (uri: string) => [...queryKeys.channels.all, 'detail', uri] as const,
    /** A Community by the name a getorbyt.com/c/<name> link carries. */
    byName: (name: string) => [...queryKeys.channels.all, 'by-name', name] as const,
    /** One Community (`com.getorbyt.community.getCommunity`), directory or not. */
    community: (uri: string) => [...queryKeys.channels.all, 'community', uri] as const,
    /** Communities matching a search (`listCommunities` `query`). */
    search: (query: string) => [...queryKeys.channels.all, 'search', query] as const,
    colors: (uri: string) => [...queryKeys.channels.all, 'colors', uri] as const,
  },

  // Moderation settings queries
  moderation: {
    all: moderationBase,
    byUser: (did: string) => [...moderationBase, did] as const,
  },

  klipy: {
    all: klipyBase,
    media: {
      trending: (customerId: string, kind: import('@/services/klipy/KlipyService').KlipyKind) =>
        [...klipyBase, 'media', 'trending', kind, customerId] as const,
      search: (
        customerId: string,
        kind: import('@/services/klipy/KlipyService').KlipyKind,
        q: string
      ) => [...klipyBase, 'media', 'search', kind, customerId, q] as const,
    },
  },

  // Explore tab (Orbyt grid + spotlight)
  explore: {
    all: exploreBase,
    orbytGrid: (uris: string[]) => [...exploreBase, 'orbyt-channels', uris] as const,
    spotlightFeed: () => [...exploreBase, 'spotlight-feed'] as const,
  },

  // Discourse community (Ideas and Feature Requests)
  discourse: {
    all: ['discourse'] as const,
    categoryTopics: (categoryId: number) => ['discourse', 'category', categoryId] as const,
  },
} as const;
