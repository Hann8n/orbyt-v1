export const queryKeys = {
  comments: {
    all: ['comments'] as const,
    byPost: (postUri: string) => [...queryKeys.comments.all, postUri] as const,
    infinite: () => [...queryKeys.comments.all, 'infinite'] as const,
    infiniteByPost: (postUri: string) => [...queryKeys.comments.infinite(), postUri] as const,
  },
  likes: {
    all: ['likes'] as const,
    byPost: (postUri: string) => [...queryKeys.likes.all, postUri] as const,
    infinite: () => [...queryKeys.likes.all, 'infinite'] as const,
    infiniteByPost: (postUri: string) => [...queryKeys.likes.infinite(), postUri] as const,
  },
  profiles: {
    all: ['profiles'] as const,
    lists: () => [...queryKeys.profiles.all, 'list'] as const,
    list: (filters: string) => [...queryKeys.profiles.lists(), { filters }] as const,
    details: () => [...queryKeys.profiles.all, 'detail'] as const,
    detail: (handle: string) => [...queryKeys.profiles.details(), handle] as const,
    refresh: (handle: string) => [...queryKeys.profiles.detail(handle), 'refresh', Date.now()] as const,
  },
  blocks: {
    all: ['blocks'] as const,
    status: (did: string) => [...queryKeys.blocks.all, did] as const,
  },
  feed: {
    all: ['feed'] as const,
    byOption: (feedOption: string) => [...queryKeys.feed.all, feedOption] as const,
    byUser: (feedOption: string, userDid?: string) => 
      userDid 
        ? [...queryKeys.feed.byOption(feedOption), userDid] as const
        : queryKeys.feed.byOption(feedOption),
    infinite: (feedOption: string, userDid?: string) => 
      [...queryKeys.feed.byUser(feedOption, userDid), 'infinite'] as const,
    batch: (feedOption: string, userDid?: string) => 
      [...queryKeys.feed.byUser(feedOption, userDid), 'batch'] as const,
  },
  feeds: {
    all: ['feeds'] as const,
    search: (query: string) => [...queryKeys.feeds.all, 'search', query] as const,
    details: () => [...queryKeys.feeds.all, 'detail'] as const,
    detail: (uri: string) => [...queryKeys.feeds.details(), uri] as const,
    infinite: (uri: string) => [...queryKeys.feeds.detail(uri), 'infinite'] as const,
  },
  search: {
    all: ['search'] as const,
    unified: (query: string) => [...queryKeys.search.all, 'unified', query] as const,
    profiles: (query: string) => [...queryKeys.search.all, 'profiles', query] as const,
    feeds: (query: string) => [...queryKeys.search.all, 'feeds', query] as const,
  }
};
