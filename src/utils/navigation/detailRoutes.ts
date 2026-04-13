import type { Href } from 'expo-router';

export type DetailNavTab = 'home' | 'explore' | 'activity' | 'profile';

const TAB_SEGMENTS: readonly DetailNavTab[] = ['home', 'explore', 'activity', 'profile'];

/**
 * True when the current route is a root stack screen presented as a modal (slide-up or transparent).
 * Tab destinations should use `router.dismissTo(href)` so the modal closes and the detail lands on
 * the tab stack, not stacked above the modal.
 */
export function isRootModalStackContext(segments: readonly string[]): boolean {
  const root = segments[0];
  return root === 'settings' || root === 'edit-profile' || root === 'profile-image-viewer';
}

/**
 * Tab segment immediately under `(tabs)` — stable even when stacked on e.g. `user/[did]`.
 */
function getDetailNavTabFromSegments(
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

/** When the focused route is under `(tabs)`, returns that tab; otherwise `null` (e.g. root modal). */
export function getDetailNavTabIfInsideTabs(segments: readonly string[]): DetailNavTab | null {
  const tabsIdx = segments.indexOf('(tabs)');
  if (tabsIdx < 0) {
    return null;
  }
  const candidate = segments[tabsIdx + 1];
  if (TAB_SEGMENTS.includes(candidate as DetailNavTab)) {
    return candidate as DetailNavTab;
  }
  return null;
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
  segments: readonly string[];
  /** Used when not inside `(tabs)` (e.g. settings). */
  fallbackTab?: DetailNavTab;
};

export function buildProfileDetailHref(did: string, opts: BuildDetailHrefOptions): Href {
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
  const tab = getDetailNavTabFromSegments(opts.segments, opts.fallbackTab ?? 'home');
  return {
    pathname: channelPathnameForTab(tab),
    params: { id: encodedChannelId },
  };
}
