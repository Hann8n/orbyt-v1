/**
 * Centralized Query Key Factory
 * Provides consistent, type-safe query keys for all React Query operations
 * Follows React Query best practices for hierarchical key structure
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

export const queryKeys = {
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

  // Chat queries
  chat: {
    all: chatBase,
    conversations: {
      all: [...chatBase, 'conversations'] as const,
      list: (cursor?: string) =>
        cursor
          ? ([...chatBase, 'conversations', 'list', cursor] as const)
          : ([...chatBase, 'conversations', 'list'] as const),
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
  profiles: {
    all: profilesBase,
    detail: (handle: string) => [...profilesBase, 'detail', handle] as const,
    byDid: (did: string) => [...profilesBase, 'did', did] as const,
    lists: () => [...profilesBase, 'list'] as const,
    list: (filters?: string) =>
      filters
        ? ([...profilesBase, 'list', { filters }] as const)
        : ([...profilesBase, 'list'] as const),
    details: () => [...profilesBase, 'detail'] as const,
    refresh: (handle: string) =>
      [...profilesBase, 'detail', handle, 'refresh', Date.now()] as const,
  },

  // Orbyt profile queries
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
  },

  // Notification queries
  notifications: {
    all: ['notifications'] as const,
    count: () => [...queryKeys.notifications.all, 'count'] as const,
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
    detail: (uri: string) => [...queryKeys.channels.all, 'detail', uri] as const,
    colors: (uri: string) => [...queryKeys.channels.all, 'colors', uri] as const,
  },

  // Moderation settings queries
  moderation: {
    all: moderationBase,
    byUser: (did: string) => [...moderationBase, did] as const,
  },
} as const;
