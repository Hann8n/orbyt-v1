import type { Href } from 'expo-router';

export type DetailNavTab = 'home' | 'explore' | 'activity' | 'profile';

const TAB_SEGMENTS: readonly DetailNavTab[] = ['home', 'explore', 'activity', 'profile'];

/**
 * Tab segment immediately under `(tabs)` — stable even when stacked on e.g. `user/[did]`.
 */
export function getDetailNavTabFromSegments(
  segments: readonly string[],
  fallback: DetailNavTab = 'home'
): DetailNavTab {
  const tabsIdx = segments.indexOf('(tabs)');
  if (tabsIdx < 0) {
    return fallback;
  }
  const candidate = segments[tabsIdx + 1];
  if (TAB_SEGMENTS.includes(candidate as DetailNavTab)) {
    return candidate as DetailNavTab;
  }
  return fallback;
}

function profilePathnameForTab(
  tab: DetailNavTab
):
  | '/(tabs)/profile/[did]'
  | '/(tabs)/home/user/[did]'
  | '/(tabs)/explore/user/[did]'
  | '/(tabs)/activity/user/[did]' {
  switch (tab) {
    case 'profile':
      return '/(tabs)/profile/[did]';
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

export type BuildDetailHrefOptions = {
  /** When true, use root stack routes (modal presentation over tabs). */
  useModalLayout: boolean;
  segments: readonly string[];
  /** Used when not inside `(tabs)` (e.g. settings). */
  fallbackTab?: DetailNavTab;
};

export function buildProfileDetailHref(did: string, opts: BuildDetailHrefOptions): Href {
  if (opts.useModalLayout) {
    return { pathname: '/profile/[did]', params: { did } };
  }
  const tab = getDetailNavTabFromSegments(opts.segments, opts.fallbackTab ?? 'home');
  return {
    pathname: profilePathnameForTab(tab),
    params: { did },
  };
}

export function buildChannelDetailHref(
  encodedChannelId: string,
  opts: BuildDetailHrefOptions
): Href {
  if (opts.useModalLayout) {
    return { pathname: '/channel/[id]', params: { id: encodedChannelId } };
  }
  const tab = getDetailNavTabFromSegments(opts.segments, opts.fallbackTab ?? 'home');
  return {
    pathname: channelPathnameForTab(tab),
    params: { id: encodedChannelId },
  };
}
