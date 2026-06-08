import { type Href } from 'expo-router';

export type DetailNavTab = 'home' | 'explore' | 'activity' | 'profile';

const TAB_SEGMENTS: readonly DetailNavTab[] = ['home', 'explore', 'activity', 'profile'];

/**
 * Tab used for detail navigation that originates from a root screen presented over the tabs
 * (settings, chat, deep links): those screens are not inside any tab stack, so there is no
 * "current tab" to land on. We pick a single deterministic destination instead of guessing.
 */
export const DEFAULT_DETAIL_TAB: DetailNavTab = 'home';

/**
 * True when the current route is a root stack screen presented over the tabs (modal or card).
 * From here, tab destinations must use an absolute href (the relative/segment-based resolution that
 * works inside a tab stack has no tab to anchor to).
 */
export function isRootModalStackContext(segments: readonly string[]): boolean {
  return segments[0] !== '(tabs)';
}

/**
 * The tab that owns the currently focused route, read straight from the route segments
 * (`['(tabs)', '<tab>', ...]`). Returns `null` for root screens outside the tabs. Read this at
 * press time (inside an event handler) so it reflects the screen the user actually tapped on.
 */
export function getDetailNavTabFromSegments(segments: readonly string[]): DetailNavTab | null {
  if (segments[0] !== '(tabs)') return null;
  const tab = segments[1];
  return tab && (TAB_SEGMENTS as readonly string[]).includes(tab) ? (tab as DetailNavTab) : null;
}

function profilePathnameForTab(
  tab: DetailNavTab
):
  | '/(tabs)/profile/user/[did]'
  | '/(tabs)/home/user/[did]'
  | '/(tabs)/explore/user/[did]'
  | '/(tabs)/activity/user/[did]' {
  switch (tab) {
    case 'profile':
      return '/(tabs)/profile/user/[did]';
    case 'home':
      return '/(tabs)/home/user/[did]';
    case 'explore':
      return '/(tabs)/explore/user/[did]';
    case 'activity':
      return '/(tabs)/activity/user/[did]';
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function channelPathnameForTab(
  tab: DetailNavTab
):
  | '/(tabs)/profile/channel/[id]'
  | '/(tabs)/home/channel/[id]'
  | '/(tabs)/explore/channel/[id]'
  | '/(tabs)/activity/channel/[id]' {
  switch (tab) {
    case 'profile':
      return '/(tabs)/profile/channel/[id]';
    case 'home':
      return '/(tabs)/home/channel/[id]';
    case 'explore':
      return '/(tabs)/explore/channel/[id]';
    case 'activity':
      return '/(tabs)/activity/channel/[id]';
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

export function buildProfileDetailHref(did: string, tab: DetailNavTab): Href {
  return { pathname: profilePathnameForTab(tab), params: { did } };
}

export function buildChannelDetailHref(encodedChannelId: string, tab: DetailNavTab): Href {
  return { pathname: channelPathnameForTab(tab), params: { id: encodedChannelId } };
}
