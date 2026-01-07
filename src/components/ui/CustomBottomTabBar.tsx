import React, { memo, useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getBottomNavBarHeight } from '../../utils/device/screen';
import { HomeIcon, ExploreIcon, NotificationIcon, UserIcon } from './Icon';
import { Colors, Avatar } from './UI';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { NotificationIndicator } from './NotificationIndicator';
import { useGlobalAccountSwitcher } from '../../hooks/useGlobalModals';
import { useUserStore } from '../../stores/userStore';
import { useProfile } from '../../services/data/ProfileService';
import { tabRefs } from '../../utils/navigation/tabRefs';
import { useSetTabBarHeight } from '../../context/FeedIndicatorContext';

interface TabConfig {
  name: string;
  routeName: string;
  iconType: 'home' | 'explore' | 'create' | 'activity' | 'profile';
}

const LEFT_TABS: TabConfig[] = [
  { name: 'home', routeName: 'index', iconType: 'home' },
  { name: 'explore', routeName: 'explore', iconType: 'explore' },
];

const RIGHT_TABS: TabConfig[] = [
  { name: 'activity', routeName: 'activity', iconType: 'activity' },
  { name: 'profile', routeName: 'profile', iconType: 'profile' },
];

const CREATE_TAB: TabConfig = { name: 'create', routeName: 'create', iconType: 'create' };

// ProfileTabIcon component - matches old implementation
const ProfileTabIcon = React.memo(
  ({ color, tabIconSize, isActive }: { color: string; tabIconSize: number; isActive: boolean }) => {
    const currentUserHandle = useUserStore(state => state.currentUser?.handle);
    const savedAccountsLength = useUserStore(state => state.savedAccounts.length);
    const { data: profileData } = useProfile(currentUserHandle);

    const hasMultipleAccounts = savedAccountsLength > 1;

    // Dim avatar and ring together via wrapper opacity
    const opacity = isActive ? 1 : 0.6;

    // Use profile color for ring (opacity handles dimming)
    const ringColor =
      profileData?.profileColors?.foregroundColor ||
      profileData?.profileColors?.lighterColor ||
      Colors.white;

    if (!hasMultipleAccounts) {
      return <UserIcon size={tabIconSize} color={color} />;
    }

    return (
      <View style={{ opacity }}>
        <Avatar
          uri={profileData?.avatar}
          type="profile"
          size={tabIconSize}
          showRing={true}
          status={profileData?.status}
          profileColors={
            profileData?.profileColors
              ? {
                  backgroundColor: profileData.profileColors.backgroundColor,
                  textColor: profileData.profileColors.foregroundColor || color,
                  foregroundColor: profileData.profileColors.foregroundColor || color,
                }
              : undefined
          }
          ringColor={ringColor}
        />
      </View>
    );
  }
);

ProfileTabIcon.displayName = 'ProfileTabIcon';

// CaptureIcon component - matches old implementation
const CaptureIcon = React.memo(
  ({ captureSize, captureInner }: { captureSize: number; captureInner: number }) => {
    return (
      <View
        style={[
          iconStyles.captureOuter,
          {
            width: captureSize,
            height: captureSize,
            borderRadius: captureSize / 2,
          },
        ]}
      >
        <View
          style={[
            iconStyles.captureInner,
            {
              width: captureInner,
              height: captureInner,
              borderRadius: captureInner / 2,
            },
          ]}
        />
      </View>
    );
  }
);

CaptureIcon.displayName = 'CaptureIcon';

interface CustomBottomTabBarProps extends BottomTabBarProps {
  tintColor?: string;
  inactiveTintColor?: string;
}

const CustomBottomTabBar: React.FC<CustomBottomTabBarProps> = ({
  state,
  navigation,
  tintColor = Colors.white,
  inactiveTintColor = 'rgba(243, 245, 254, 0.60)', // Colors.white at 60% opacity
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const { hasUnread } = useUnreadCount();
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const setTabBarHeight = useSetTabBarHeight();

  const tabIconSize = useMemo(() => Math.round(Math.max(26, Math.min(36, width * 0.085))), [width]);
  const captureSize = useMemo(() => Math.round(tabIconSize * 1.15), [tabIconSize]);
  const captureInner = useMemo(() => Math.round(captureSize * 0.82), [captureSize]);

  // Add extra height to make tab bar slightly taller
  const tabBarHeight = useMemo(() => bottomNavBarHeight + 6, [bottomNavBarHeight]);

  // Measure actual tab bar height and update context
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      if (height > 0) {
        setTabBarHeight(height);
      }
    },
    [setTabBarHeight]
  );

  // Responsive gap: smaller for thinner phones, larger for iPad
  const tabGap = useMemo(() => (width < 450 ? 35 : 40), [width]);

  // Haptic feedback ref (non-blocking)
  const pendingHapticRef = useRef<boolean>(false);
  // Navigation guard to prevent desync from rapid taps
  const navigationPendingRef = useRef<boolean>(false);

  // Memoize current route name for UI display
  const currentRouteName = useMemo(() => state?.routes?.[state.index]?.name || '', [state]);

  const handleTabPress = useCallback(
    (tab: TabConfig) => {
      // Prevent desync: guard against rapid successive taps
      if (navigationPendingRef.current) {
        return;
      }

      // Get fresh navigation state synchronously (Bluesky pattern) to prevent desync
      let freshRouteName = '';
      try {
        const currentState = navigation.getState();
        if (
          currentState?.routes &&
          currentState.index >= 0 &&
          currentState.index < currentState.routes.length
        ) {
          freshRouteName = currentState.routes[currentState.index]?.name || '';
        }
      } catch (_error) {
        // Fallback to prop state if getState() fails
        freshRouteName = state?.routes?.[state.index]?.name || '';
      }
      const isActive = freshRouteName === tab.routeName;

      // Trigger haptics asynchronously (non-blocking, fire and forget)
      if (!pendingHapticRef.current) {
        pendingHapticRef.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).finally(() => {
          pendingHapticRef.current = false;
        });
      }

      if (isActive) {
        // Tab is already active - trigger scroll-to-top and other tab-specific actions
        // Execute immediately without requestAnimationFrame for faster response
        switch (tab.iconType) {
          case 'home':
            // Home tab: refresh and scroll to top
            if (tabRefs.home) {
              tabRefs.home.refresh?.();
              tabRefs.home.scrollToTop();
            }
            break;
          case 'explore':
            // Explore tab: dismiss search if active, otherwise scroll to top
            if (tabRefs.explore) {
              if (tabRefs.explore.isSearchActive?.()) {
                tabRefs.explore.dismissSearch?.();
              } else {
                tabRefs.explore.scrollToTop();
              }
            }
            break;
          case 'activity':
            // Activity tab: scroll to top
            if (tabRefs.activity) {
              tabRefs.activity.scrollToTop();
            }
            break;
          case 'profile':
            // Profile tab: scroll to top
            if (tabRefs.profile) {
              tabRefs.profile.scrollToTop();
            }
            break;
          case 'create':
            // Create tab: navigate to root route using router
            router.push('/create');
            break;
        }
      } else {
        // Tab is not active - navigate immediately for fastest switching
        // Set guard to prevent desync from rapid taps
        navigationPendingRef.current = true;

        if (tab.iconType === 'create') {
          router.push('/create');
          // Reset guard after navigation (create uses router, not navigation)
          setTimeout(() => {
            navigationPendingRef.current = false;
          }, 100);
        } else {
          // Use jumpTo for faster tab switching (optimized for tab navigators)
          // This is faster than navigate for tab switching
          const tabNavigation = navigation as typeof navigation & {
            jumpTo?: (name: string) => void;
          };
          if (tabNavigation.jumpTo) {
            tabNavigation.jumpTo(tab.routeName);
          } else {
            navigation.navigate(tab.routeName);
          }
          // Reset guard after navigation completes
          setTimeout(() => {
            navigationPendingRef.current = false;
          }, 100);
        }
      }
    },
    [navigation, router, state]
  );

  const handleLongPress = useCallback(
    (tab: TabConfig) => {
      // Trigger haptics for long press (non-blocking)
      if (!pendingHapticRef.current) {
        pendingHapticRef.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).finally(() => {
          pendingHapticRef.current = false;
        });
      }

      if (tab.iconType === 'profile') {
        presentAccountSwitcher();
      } else if (tab.iconType === 'explore') {
        const isActive = currentRouteName === tab.routeName;
        if (!isActive) {
          const tabNavigation = navigation as typeof navigation & {
            jumpTo?: (name: string) => void;
          };
          if (tabNavigation.jumpTo) {
            tabNavigation.jumpTo(tab.routeName);
          } else {
            navigation.navigate(tab.routeName);
          }
          setTimeout(() => tabRefs.explore?.focusSearch?.(), 100);
        } else {
          tabRefs.explore?.focusSearch?.();
        }
      }
    },
    [presentAccountSwitcher, navigation, currentRouteName]
  );

  const renderTabIcon = useCallback(
    (tab: TabConfig, isActive: boolean) => {
      const color = isActive ? tintColor : inactiveTintColor;

      switch (tab.iconType) {
        case 'home':
          return <HomeIcon size={tabIconSize} color={color} />;
        case 'explore':
          return (
            <ExploreIcon size={tabIconSize} color={color} style={{ transform: [{ scaleX: -1 }] }} />
          );
        case 'create':
          return <CaptureIcon captureSize={captureSize} captureInner={captureInner} />;
        case 'activity':
          return (
            <View style={iconStyles.relativeContainer}>
              <NotificationIcon size={tabIconSize} color={color} />
              <NotificationIndicator hasUnread={hasUnread} size="small" position="top-right" />
            </View>
          );
        case 'profile':
          return <ProfileTabIcon color={color} tabIconSize={tabIconSize} isActive={isActive} />;
        default:
          return null;
      }
    },
    [tintColor, inactiveTintColor, tabIconSize, captureSize, captureInner, hasUnread]
  );

  // Memoize backgroundColor calculation
  const backgroundColor = useMemo(
    () =>
      currentRouteName === 'explore' || currentRouteName === 'activity'
        ? Colors.black
        : 'transparent',
    [currentRouteName]
  );

  return (
    <View
      style={[
        styles.container,
        {
          height: tabBarHeight,
          backgroundColor,
        },
      ]}
      onLayout={handleLayout}
    >
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.30)']}
        style={styles.gradient}
        pointerEvents="none"
      />
      <View
        style={[
          styles.tabBar,
          styles.tabBarPadding,
          {
            paddingBottom: (typeof insets?.bottom === 'number' ? insets.bottom : 0) + 6,
            gap: tabGap,
          },
        ]}
      >
        {/* Left tabs */}
        <View style={[styles.tabsGroup, { gap: tabGap }]}>
          {LEFT_TABS.map(tab => (
            <Pressable
              key={tab.name}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => handleTabPress(tab)}
              onLongPress={() => handleLongPress(tab)}
              delayLongPress={200}
            >
              {renderTabIcon(tab, currentRouteName === tab.routeName)}
            </Pressable>
          ))}
        </View>

        {/* Center create button */}
        <Pressable
          style={({ pressed }) => [
            styles.createTab,
            { width: captureSize },
            pressed && styles.tabPressed,
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => handleTabPress(CREATE_TAB)}
        >
          {renderTabIcon(CREATE_TAB, false)}
        </Pressable>

        {/* Right tabs */}
        <View style={[styles.tabsGroup, { gap: tabGap }]}>
          {RIGHT_TABS.map(tab => (
            <Pressable
              key={tab.name}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => handleTabPress(tab)}
              onLongPress={() => handleLongPress(tab)}
              delayLongPress={250}
            >
              {renderTabIcon(tab, currentRouteName === tab.routeName)}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
};

const iconStyles = StyleSheet.create({
  relativeContainer: {
    position: 'relative',
  },
  captureOuter: {
    borderWidth: 1.5,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  captureInner: {
    backgroundColor: Colors.white,
  },
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    zIndex: 100,
    shadowOpacity: 0,
    elevation: 0,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 24,
  },
  tabBarPadding: {
    paddingTop: 12,
  },
  tabsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  createTab: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    // Create tab width is set dynamically based on captureSize
  },
  tabPressed: {
    opacity: 0.7,
  },
});

export default memo(CustomBottomTabBar);
