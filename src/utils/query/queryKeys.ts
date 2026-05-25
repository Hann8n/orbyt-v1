/**
 * Centralized Query Key Factory
 * Provides consistent, type-safe query keys for all React Query operations
 * Follows React Query best practices for hierarchical key structure
 *
 * Auth/session cache invalidation (see `userStore`):
 * - **signOut**: `clearAllCaches()` clears Zustand-adjacent stores and `removeQueries` for
 *   `queryKeys.moderation.all` only; most React Query data is keyed by DID — session reset avoids
 *   further authenticated fetches. Add targeted removes here if a surface leaks after logout.
 * - **Account switch**: After successful restore, invalidates `queryKeys.notifications.all`,
 *   `queryKeys.chat.all`, and `queryKeys.unread.summary()` so badges/DMs refresh without a global
 *   feed invalidate (feed keys embed DID / fingerprint).
 * - **Login / restore**: User-scoped queries pick up the new DID via key changes; no global wipe.
 */

// Base keys - defined first to avoid circular references
const feedBase = ['feed'] as const;
const chatBase = ['chat'] as const;
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
    byUser: (feedOption: string, userDid?: string, sourceFingerprint?: string) =>
      userDid
        ? sourceFingerprint
          ? ([...feedBase, feedOption, userDid, sourceFingerprint] as const)
          : ([...feedBase, feedOption, userDid] as const)
        : ([...feedBase, feedOption] as const),
    infinite: (feedOption: string, userDid?: string, sourceFingerprint?: string) =>
      [...queryKeys.feed.byUser(feedOption, userDid, sourceFingerprint), 'infinite'] as const,
    batch: (feedOption: string, userDid?: string, sourceFingerprint?: string) =>
      [...queryKeys.feed.byUser(feedOption, userDid, sourceFingerprint), 'batch'] as const,
    search: (query: string) => [...feedBase, 'search', query] as const,
  },

  // Chat queries
  chat: {
    all: chatBase,
    conversations: {
      all: [...chatBase, 'conversations'] as const,
      list: (
        cursor?: string,
        filter?: { readState?: 'unread'; status?: 'request' | 'accepted' }
      ) => {
        const readState = filter?.readState ?? null;
        const status = filter?.status ?? null;
        return cursor
          ? ([...chatBase, 'conversations', 'list', cursor, readState, status] as const)
          : ([...chatBase, 'conversations', 'list', readState, status] as const);
      },
      detail: (conversationId: string) => [...chatBase, 'conversations', conversationId] as const,
      count: () => [...chatBase, 'conversations', 'count'] as const,
    },
    messages: {
      all: [...chatBase, 'messages'] as const,
      byConversation: (conversationId: string, cursor?: string) =>
        cursor
          ? ([...chatBase, 'messages', conversationId, cursor] as const)
          : ([...chatBase, 'messages', conversationId] as const),
      infinite: (conversationId: string) =>
        [...chatBase, 'messages', conversationId, 'infinite'] as const,
    },
    availability: (userDid: string) => [...chatBase, 'availability', userDid] as const,
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

  // Tab bar unread (single source: notifications + chats)
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
    metadata: (locale?: string) =>
      locale
        ? ([...queryKeys.channels.all, 'metadata', locale] as const)
        : ([...queryKeys.channels.all, 'metadata'] as const),
    detail: (uri: string) => [...queryKeys.channels.all, 'detail', uri] as const,
    colors: (uri: string) => [...queryKeys.channels.all, 'colors', uri] as const,
  },

  orbyt: {
    all: ['orbyt'] as const,
    headers: (locale?: string) =>
      locale
        ? ([...queryKeys.orbyt.all, 'headers', locale] as const)
        : ([...queryKeys.orbyt.all, 'headers'] as const),
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
