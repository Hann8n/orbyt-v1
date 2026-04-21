import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '@/theme';
import { LAYOUT_INSETS } from '@/utils/constants';

/**
 * Single source of truth for full-bleed **profile** and **channel** screens:
 * root container, loading overlay, shared `FeedPager` / `TabNavigation` defaults,
 * and the shared not-found / error full-screen state (`ProfileChannelErrorScreen`).
 *
 * Use `ProfileChannelFeedLayout` as the outer shell; pair with `DetailScreenOverlay` + `FeedPager`
 * the same way in `app/(tabs)/profile` and `app/channel/channel`.
 */

export { ProfileChannelErrorScreen } from './ProfileChannelErrorScreen';
export type { ProfileChannelErrorScreenProps } from './ProfileChannelErrorScreen';

/** Re-export of `LAYOUT_INSETS.DETAIL_OVERLAY_TOP_OFFSET` for profile/channel feed screens. */
export const PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET = LAYOUT_INSETS.DETAIL_OVERLAY_TOP_OFFSET;

/** FeedPager defaults for header-driven feeds (tab strip in header, not the pager indicator). */
export const PROFILE_CHANNEL_FEED_PAGER_DEFAULTS = {
  showFeedIndicator: false,
  controlStatusBar: false,
  scrollEnabled: false,
} as const;

/** Tab strip under ProfileHeader / ChannelHeader — dropdown + view toggle. */
export const PROFILE_CHANNEL_TAB_NAVIGATION_DEFAULTS = {
  showViewToggle: true,
  dropdown: true,
} as const;

interface ProfileChannelFeedLayoutProps {
  backgroundColor: string;
  children: React.ReactNode;
}

export function ProfileChannelFeedLayout({
  backgroundColor,
  children,
}: ProfileChannelFeedLayoutProps) {
  return (
    <View style={[styles.root, { backgroundColor }]} collapsable={false}>
      {children}
    </View>
  );
}

interface ProfileChannelFeedLoadingScreenProps {
  backgroundColor: string;
}

export function ProfileChannelFeedLoadingScreen({
  backgroundColor,
}: ProfileChannelFeedLoadingScreenProps) {
  return (
    <View style={[styles.loadingScreen, { backgroundColor }]} collapsable={false}>
      <ActivityIndicator size="large" color={Colors.neutral[50]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: '100%',
    overflow: 'hidden',
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
