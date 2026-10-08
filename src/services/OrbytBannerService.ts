/**
 * Explore header banners.
 *
 * The Orbyt AppView has no banner endpoint (the legacy `/v1/headers/active`
 * CMS is gone), so the carousel features the most popular Communities that
 * have artwork, from the same `com.getorbyt.community.listCommunities`
 * directory the channel grid uses. Tapping a banner opens its Community.
 */
import { useOrbytChannels } from './OrbytChannelsService';
import type { CommunityView } from './orbyt/communities';

const FEATURED_COMMUNITY_COUNT = 5;

interface Header {
  id: string;
  imageUrl: string;
  destinationUrl?: string | null;
  /** The featured Community; banners open it in-app. */
  communityUri?: string;
  title: string | null;
  /** Secondary text used by the header banner. */
  subtitle?: string | null;
  titleColor?: string;
  /** Color for subtitle text. */
  subtitleColor?: string;
  titleFontFamily?: string;
  titleFontSize?: number;
  /** Font for subtitle text. */
  subtitleFontFamily?: string;
  subtitleFontSize?: number;
  /**
   * Controls rendering order of text overlay
   * - 'title-first' renders title above subtitle
   * - 'subtitle-first' renders subtitle above title
   */
  textOrder?: 'title-first' | 'subtitle-first';
  titleOpacity?: number;
  /** Opacity for subtitle text. */
  subtitleOpacity?: number;
  /** Optional per-header height ratio override (0-1 of screen height). */
  heightRatio?: number;
  /** Optional readability shim under text. */
  bottomShimEnabled?: boolean;
  /** Optional shim opacity override (0..1). */
  bottomShimOpacity?: number;
  /** Optional overlay tint color for the header image. */
  overlayColor?: string;
}

function communityToHeader(community: CommunityView): Header {
  return {
    id: community.uri,
    imageUrl: community.avatar || community.avatarFallback || '',
    communityUri: community.uri,
    title: `/${community.name}`,
    subtitle: community.description ?? null,
    textOrder: 'title-first',
    bottomShimEnabled: true,
  };
}

function selectFeaturedHeaders(communities: CommunityView[]): Header[] {
  return communities
    .filter(community => community.avatar || community.avatarFallback)
    .slice(0, FEATURED_COMMUNITY_COUNT)
    .map(communityToHeader);
}

export const useHeaders = () => useOrbytChannels(selectFeaturedHeaders);

export type { Header };
