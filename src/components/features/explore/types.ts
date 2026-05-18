import type { ProfileViewWithOrbyt } from '@/services/api/types';
import type { ExtendedFeedViewPost } from '@/services/api/types';
import type { CachedChannel } from '@/services/data/ChannelService';

/** Explore search / pager tab identifiers */
export type ExploreSearchTabId = 'recently-visited' | 'profiles' | 'channels';

/** Type aliases for SDK types used in explore */
export type Profile = ProfileViewWithOrbyt;
export type Channel = CachedChannel;

export type ProfileResult = {
  type: 'profile';
  data: Profile;
  relevance: number;
};

export type ChannelResult = {
  type: 'channel';
  data: Channel;
  relevance: number;
};

export type SearchResult = ProfileResult | ChannelResult;

export interface SectionHeader {
  type: 'section-header';
  title: string;
  key: string;
}

export interface SpotlightVideosSection {
  type: 'spotlight-videos';
  videos: ExtendedFeedViewPost[];
  key: string;
}

export interface OrbytChannelsSection {
  type: 'orbyt-channels-section';
  channels: Channel[];
  key: string;
}

export interface LoadingItem {
  type: 'loading';
  variant: 'full' | 'spotlight' | 'channels';
  key: string;
}

export type ListItem =
  | SearchResult
  | SectionHeader
  | SpotlightVideosSection
  | OrbytChannelsSection
  | LoadingItem;

/** Internal shape when mapping AT Protocol search feed posts */
export type SearchFeedPost = ExtendedFeedViewPost['post'] & {
  contentMode?: string;
  text?: string;
  description?: string;
  likeCount?: number;
  indexedAt?: string;
  viewer?: { following?: string | null };
  avatar?: string;
};

export function exploreListKeyExtractor(item: ListItem, index: number): string {
  switch (item.type) {
    case 'section-header':
      return item.key || `${item.title}-${index}`;
    case 'spotlight-videos':
      return item.key || `spotlight-${index}`;
    case 'orbyt-channels-section':
      return item.key || `orbyt-channels-${index}`;
    case 'loading':
      return item.key || `loading-${index}`;
    case 'profile':
      return item.data.did || item.data.handle || `profile-${index}`;
    case 'channel':
      return item.data.uri || item.data.cid || `channel-${index}`;
    default:
      return `item-${index}`;
  }
}
