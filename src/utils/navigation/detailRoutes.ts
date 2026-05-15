import { useSegments } from 'expo-router';
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

/** When the focused route is under `(tabs)`, returns that tab; otherwise `null` (e.g. root modal). */
export function getDetailNavTabIfInsideTabs(segments: readonly string[]): DetailNavTab | null {
  return (segments.find(s => (TAB_SEGMENTS as readonly string[]).includes(s)) as DetailNavTab) ?? null;
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

export function useCurrentDetailNavTab(): DetailNavTab {
  const segments = useSegments();
  return (segments.find(s => (TAB_SEGMENTS as readonly string[]).includes(s)) as DetailNavTab) ?? 'home';
}
