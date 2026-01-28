import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { BORDER_RADIUS, SCROLL_CONSTANTS, APP_CONSTANTS } from '../../src/utils/constants';
import { View, Text, StyleSheet, Pressable, Dimensions, Modal } from 'react-native';
import { Image } from 'expo-image';
// Use plain FlashList via FeedRenderer; no adapter/converter
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import ProfileService, {
  useProfileByDid,
  profileKeys,
  isLiveStatus,
  useStatusExpirationMonitor,
} from '../../src/services/data/ProfileService';
import { getProfileColors } from '../../src/utils/formatting/colors';
import { useOrbytColors, invalidateOrbytColors } from '../../src/hooks/useOrbytColors';
import type { ProfileViewWithOrbyt } from '../../src/services/api/types';
import { useRouter, useLocalSearchParams, useSegments } from 'expo-router';
import Icon, {
  BackArrowIcon,
  Loading3FillIcon,
  FollowIcon,
  MutualHeartIcon,
  BellFilledIcon,
  MoreFillIcon,
} from '../../src/components/ui/Icon';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ProfileHeader, TabNavigation, TabOption } from '../../src/components/layout/header';
import { useCurrentUser, useProfileCacheSync, useFeedSettings } from '../../src/stores/userStore';
import {
  HeaderAction,
  HeaderActionButton,
} from '../../src/components/layout/header/UniversalHeader';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Colors } from '../../src/components/ui/UI';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowMutation, useBlockMutation } from '../../src/services/data/ProfileService';
import { queryKeys } from '../../src/utils/query/queryKeys';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { feedService } from '../../src/services/FeedService';
import { FEED_CONFIG } from '../../src/hooks/useFeed';
import type { FeedResponse } from '../../src/services/api/types';
import ProfileMenu from '../../src/components/features/profile/ProfileMenu';
import SubscriptionOptionsSheet from '../../src/components/features/profile/SubscriptionOptionsSheet';
import LiveStreamInfoSheet from '../../src/components/features/profile/LiveStreamInfoSheet';
import ChatService from '../../src/services/ChatService';
import { tabRefs } from '../../src/utils/navigation/tabRefs';
import type { ViewMode } from '../../src/types';
interface ProfileScreenProps {
  onLogout: (clearAllAccounts?: boolean) => Promise<void>;
}

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawParams = useLocalSearchParams<{ did?: string }>();

  // Route file is [did].tsx - only accepts DID
  // Trust API always provides valid DID
  const providedDid = rawParams.did;

  // User store hooks
  const { currentUser } = useCurrentUser();
  const { modalProfileEnabled } = useFeedSettings();

  // Automatically sync ProfileCache with userStore
  useProfileCacheSync();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const [dynamicColors, setDynamicColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);
  // Use DID in route key to differentiate between own profile and author profiles
  const profileRouteKey = useMemo(() => {
    if (providedDid) {
      return `profile:${providedDid}`;
    }
    // Own profile tab: use default key
    return 'profile:self';
  }, [providedDid]);

  useVisibilityRouteTracker(profileRouteKey);
  const isRouteFocused = useVisibilityRouteIsActive(profileRouteKey);

  const queryClient = useQueryClient();

  // Always use DID - provided DID, or current user DID
  const targetDid = providedDid || currentUser?.did || null;

  // Determine if we're viewing our own profile
  const isViewingOwnProfile = !providedDid;

  // Always fetch by DID (handle query is only used to resolve handle to DID)
  const didQuery = useProfileByDid(targetDid);

  // Fetch colors from Orbyt API (separate from profile data)
  const { data: orbytColors, refetch: refetchOrbytColors } = useOrbytColors(targetDid);

  // Use profile data from query with fallback for own profile
  const profileData: ProfileViewWithOrbyt | null =
    didQuery.data ||
    (isViewingOwnProfile && currentUser?.did && currentUser?.handle
      ? ({
          did: currentUser.did,
          handle: currentUser.handle,
          displayName: currentUser.displayName ?? undefined,
          avatar: currentUser.avatar ?? undefined,
          description: '',
          viewer: {},
        } as ProfileViewWithOrbyt)
      : null);

  const refetchProfile = didQuery.refetch;
  const isProfileLoading = didQuery.isLoading && !profileData;
  const isProfileFetchError = didQuery.isError;

  // Get colors from Orbyt API (primary) or profile data (fallback)
  const profileColors = getProfileColors(orbytColors || profileData);

  // Check if live using helper function
  const isLive = isLiveStatus(profileData?.status);

  // Monitor status expiration and invalidate cache when it expires
  useStatusExpirationMonitor(profileData, targetDid);

  // Tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'reposts' | 'likes'>('profile');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Read block state directly from profileData viewer fields (React Query cache - single source of truth)
  const isBlocked = !!(profileData?.viewer?.blocking || profileData?.viewer?.blockingByList);
  const isBlockedByList = !!profileData?.viewer?.blockingByList;

  // Memoized query options for profile feed
  const queryOptions = useMemo(
    () => ({
      enabled: Boolean(isRouteFocused && profileData?.did),
    }),
    [isRouteFocused, profileData?.did]
  );

  // Ensure profileData.did is defined for type safety
  const profileDid = profileData?.did ?? undefined;

  // ProfileCache is now automatically synced via useProfileCacheSync hook
  // Colors are extracted during profile fetch in ProfileService.ts - no need to do it here

  // Profile fetching is handled by React Query hooks

  // Handle refresh - refreshes profile metadata and lets FeedRenderer handle feed refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setProfileError(null);
    try {
      // Re-initialize activity subscriptions so "keep me posted" reflects server state
      try {
        const { useSubscriptionStore } = await import('../../src/stores/subscriptionStore');
        await useSubscriptionStore.getState().initialize();
      } catch {
        // Subscriptions are non-critical; ignore errors
      }

      // Force refresh colors from Orbyt API (skip for own profile - cache has fresh data after edit)
      if (targetDid && !isViewingOwnProfile) {
        invalidateOrbytColors(targetDid);
        await refetchOrbytColors();
      }

      // Refresh profile data
      if (profileData?.did) {
        await ProfileService.getProfileByDid(profileData.did);
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(profileData.did) });
      }

      // Always refetch profile data so React Query cache is updated
      await refetchProfile();
    } catch (_error) {
      setProfileError('Failed to refresh profile.');
    } finally {
      // Reset refreshing state after a delay to show the refresh animation
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    }
  }, [
    refetchProfile,
    refetchOrbytColors,
    targetDid,
    isViewingOwnProfile,
    profileData?.did,
    queryClient,
  ]);

  const isOwnProfileView = useMemo(() => {
    if (isViewingOwnProfile) return true;

    // Simple: check if the profile being viewed belongs to the current user
    const currentDid = ProfileService.getCurrentUserDid();
    return currentDid && profileData?.did && currentDid === profileData.did;
  }, [isViewingOwnProfile, profileData?.did]);

  const tabOptions: TabOption[] = useMemo(
    () => [
      { id: 'profile', label: 'videos' },
      { id: 'reposts', label: 'reposts' },
      ...(isOwnProfileView ? [{ id: 'likes', label: 'likes' }] : []),
    ],
    [isOwnProfileView]
  );

  const showErrorScreen = useMemo(
    () => (isProfileFetchError || profileError) && !refreshing,
    [isProfileFetchError, profileError, refreshing]
  );

  const renderErrorScreen = useMemo(() => {
    return (
      <View
        style={[
          styles.errorContainer,
          { backgroundColor: profileColors.backgroundColor || '#000' },
        ]}
      >
        <Icon
          name="user-x"
          size={48}
          color={profileColors.textColor || '#fff'}
          style={styles.errorIcon}
        />
        <Text style={[styles.errorText, { color: profileColors.textColor || '#fff' }]}>
          Profile Not Found
        </Text>
        <Text style={styles.errorSubtext}>
          {providedDid
            ? `We couldn't find a profile for ${providedDid}`
            : profileError || "We couldn't retrieve your profile information"}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.errorButton, pressed && { opacity: 0.7 }]}
          onPress={onRefresh}
        >
          <Text style={[styles.errorButtonText, { color: profileColors.textColor || '#fff' }]}>
            Try Again
          </Text>
        </Pressable>
        {providedDid && (
          <Pressable
            style={({ pressed }) => [
              styles.errorButton,
              styles.secondaryButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => router.back()}
          >
            <Text style={[styles.errorButtonText, { color: profileColors.textColor || '#fff' }]}>
              Go Back
            </Text>
          </Pressable>
        )}
      </View>
    );
  }, [
    profileColors.backgroundColor,
    profileColors.textColor,
    providedDid,
    profileError,
    onRefresh,
    router,
  ]);

  const isLoading = isProfileLoading && !profileData;

  // Overlay action state (moved from ProfileHeader)
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSubscriptionSheet, setShowSubscriptionSheet] = useState(false);
  const [showLiveStreamSheet, setShowLiveStreamSheet] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  const followMutation = useFollowMutation();
  const blockMutation = useBlockMutation();

  // Read subscription state from store (for cross-component sharing)
  const isSubscribed = useSubscriptionStore(state =>
    profileData?.did ? state.isSubscribed(profileData.did) : false
  );

  // Read follow state directly from profileData viewer (React Query cache - single source of truth)
  const isFollowing = !!profileData?.viewer?.following;

  // ProfileViewWithOrbyt already includes all ProfileView fields including associated.chat

  // Prefetch reposts feed in background after profile loads
  useEffect(() => {
    if (!profileDid || !isRouteFocused || isProfileLoading) return;

    requestIdleCallback(
      () => {
        const repostsQueryKey = queryKeys.feed.infinite('reposts', profileDid);
        if (!queryClient.getQueryData(repostsQueryKey)) {
          queryClient
            .prefetchInfiniteQuery<
              FeedResponse,
              Error,
              InfiniteData<FeedResponse, string | null>,
              ReturnType<typeof queryKeys.feed.infinite>,
              string | null
            >({
              queryKey: repostsQueryKey,
              queryFn: ({ pageParam }) =>
                feedService.fetchFeed(
                  'reposts',
                  profileDid,
                  (pageParam ?? undefined) as string | undefined
                ),
              initialPageParam: null,
              getNextPageParam: (lastPage: FeedResponse) => lastPage?.cursor ?? null,
              staleTime: FEED_CONFIG.STALE_TIME,
            })
            .catch(() => {});
        }
      },
      { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
    );
  }, [profileDid, isRouteFocused, isProfileLoading, queryClient]);

  // Tab press handling is now centralized in CustomBottomTabBar - no need for duplicate listener

  const handleMessagePress = useCallback(async () => {
    if (!profileData?.did) return;

    try {
      const conversation = await ChatService.createConversation({
        recipientDid: profileData.did,
      });
      router.push({
        pathname: '/chat/[id]',
        params: { id: conversation.id },
      });
    } catch {
      router.push('/chat');
    }
  }, [profileData?.did, router]);

  // Default colors for edit sheet - always reflect current profile color state
  // Colors are now handled directly in ProfileCache, no need for separate state

  // Follow / unblock
  const handleFollowUnfollow = useCallback(async () => {
    if (!profileData?.did || !profileData?.handle) return;

    try {
      // If blocked by list, don't allow unblocking (user must unsubscribe from list)
      if (isBlockedByList) {
        return;
      }

      if (isBlocked) {
        blockMutation.mutate({
          did: profileData.did,
          handle: profileData.handle,
          isBlocked: false,
        });
        return;
      }

      const newFollowingState = !isFollowing;

      // Update React Query cache IMMEDIATELY (synchronous, instant UI update)
      // This is the source of truth the component reads from
      const didKey = profileKeys.detail(profileData.did);

      queryClient.setQueryData<ProfileViewWithOrbyt>(didKey, old =>
        old
          ? {
              ...old,
              viewer: {
                ...old.viewer,
                following: newFollowingState
                  ? old.viewer?.following || 'at://placeholder'
                  : undefined,
              },
            }
          : old
      );

      // Trigger mutation (which will also update cache in onMutate and handle errors)
      followMutation.mutate({
        handle: profileData.handle,
        isFollowing: newFollowingState,
      });
    } catch {
      // no-op
    }
  }, [
    profileData,
    isBlocked,
    isBlockedByList,
    followMutation,
    blockMutation,
    queryClient,
    isFollowing,
  ]);

  const handleMenuPress = useCallback(() => {
    if (isOwnProfileView) {
      router.push('/settings');
    } else {
      setShowProfileMenu(true);
    }
  }, [isOwnProfileView, router]);

  const handleLogoutFromMenu = useCallback(async () => {
    if (onLogout) {
      await onLogout();
    }
  }, [onLogout]);

  const segments = useSegments();
  const defaultTop = (insets?.top ?? 0) + 5;

  // Labs feature: Modal profile behavior - computed once and reused
  const { isModal, headerPaddingTop, actionButtonsTop, showBackButton } = useMemo(() => {
    const isModal = modalProfileEnabled && !!providedDid && !segments.includes('(tabs)');
    const showBackButton = !!providedDid && !isModal;

    return {
      isModal,
      headerPaddingTop: isModal ? 24 : modalProfileEnabled ? defaultTop + 4 : undefined,
      actionButtonsTop: isModal ? 20 : defaultTop,
      showBackButton,
    };
  }, [modalProfileEnabled, providedDid, segments, defaultTop]);

  // Shared scroll progress for overlay (back/menu) animation. Written from onVerticalScroll; read in useAnimatedStyle on UI thread.
  const headerScrollProgress = useSharedValue(0);

  const handleVerticalScroll = useCallback(
    (scrollY: number) => {
      // One SharedValue write (Reanimated syncs to UI). Avoids runOnUI bridge per scroll event.
      headerScrollProgress.value = Math.max(
        0,
        Math.min(1, scrollY / SCROLL_CONSTANTS.HEADER_FADE_DISTANCE)
      );
    },
    [headerScrollProgress]
  );

  // Animated styles automatically run on UI thread
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress.value;
    // Fade out as user scrolls down
    return {
      opacity: interpolate(progress, [0, 0.3, 0.8], [1, 1, 0], Extrapolate.CLAMP),
    };
  });

  // Back icon color: gradually transition from header text color to white based on scroll
  const baseBackTextColor = useMemo(
    () => (dynamicColors ? dynamicColors.textColor : profileColors.textColor) || Colors.white,
    [dynamicColors, profileColors.textColor]
  );

  // Animated opacity for text-colored icon (fades out on scroll)
  const backIconPrimaryStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress.value;
    return { opacity: interpolate(progress, [0, 1], [1, 0], Extrapolate.CLAMP) };
  });

  // Animated opacity for white icon (fades in on scroll)
  const backIconSecondaryStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress.value;
    return { opacity: interpolate(progress, [0, 1], [0, 1], Extrapolate.CLAMP) };
  });

  // Build header actions exactly as original ProfileHeader customActions
  const headerActions: HeaderAction[] = useMemo(() => {
    if (!profileData) return [];

    // Own profile: single "Edit profile" button
    if (isOwnProfileView) {
      return [
        {
          id: 'edit',
          label: 'Edit profile',
          onPress: () => router.push('/edit-profile'),
        },
      ];
    }

    const isFollowedBy = !!profileData.viewer?.followedBy;

    let label = isBlocked ? 'Unblock' : 'follow';
    let icon: string | undefined = undefined;
    let customIcon: React.ReactNode | undefined = isBlocked ? undefined : (
      <FollowIcon
        size={14}
        color={(dynamicColors ? dynamicColors.textColor : profileColors.textColor) || Colors.white}
      />
    );

    if (!isBlocked && isFollowing && isFollowedBy) {
      label = '';
      icon = undefined;
      customIcon = (
        <MutualHeartIcon
          size={20}
          color={
            (dynamicColors ? dynamicColors.backgroundColor : profileColors.backgroundColor) ||
            Colors.black
          }
        />
      );
    } else if (!isBlocked && isFollowing) {
      label = '';
      icon = 'check';
      customIcon = undefined;
    }

    const buttons: HeaderAction[] = [];

    buttons.push({
      id: 'follow',
      label,
      icon,
      customIcon,
      onPress: handleFollowUnfollow,
      disabled: isBlockedByList, // Disable unblock button when blocked by list
    } as HeaderAction);

    if (isFollowing && !isBlocked && profileData.did) {
      buttons.push({
        id: 'subscription',
        label: '',
        customIcon: (
          <BellFilledIcon
            size={20}
            color={
              isSubscribed
                ? (dynamicColors ? dynamicColors.backgroundColor : profileColors.backgroundColor) ||
                  Colors.black
                : (dynamicColors ? dynamicColors.textColor : profileColors.textColor) ||
                  Colors.white
            }
          />
        ),
        onPress: async () => {
          const did = profileData.did;
          if (!did) return;

          const store = useSubscriptionStore.getState();
          const currentlySubscribed = store.isSubscribed(did);

          // Store methods already update optimistically (set state before API call)
          // Single tap behavior:
          // - If not subscribed, turn on post notifications only (post: true, reply: false)
          // - If subscribed, clear both states (unsubscribe from all activity)
          if (!currentlySubscribed) {
            await store.updatePreferences(did, { post: true, reply: false });
          } else {
            await store.unsubscribe(did);
          }
        },
        onLongPress: () => {
          if (!profileData.did) return;
          setShowSubscriptionSheet(true);
        },
        delayLongPress: 400,
        active: isSubscribed,
      } as HeaderAction);
    }

    return buttons;
  }, [
    profileData,
    isOwnProfileView,
    isBlocked,
    isBlockedByList,
    handleFollowUnfollow,
    isSubscribed,
    isFollowing,
    dynamicColors,
    profileColors.backgroundColor,
    profileColors.textColor,
    router,
  ]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: profileColors.backgroundColor,
        },
      ]}
    >
      {/* Grab handle for modal */}
      {isModal && (
        <Pressable style={styles.grabHandle} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}>
          <View style={styles.grabHandleContainer}>
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                backIconPrimaryStyle,
                styles.grabHandleBarWrapper,
              ]}
            >
              <View
                style={[
                  styles.grabHandleBar,
                  styles.grabHandleBarPrimary,
                  {
                    backgroundColor:
                      (dynamicColors ? dynamicColors.textColor : profileColors.textColor) ||
                      Colors.white,
                  },
                ]}
              />
            </Animated.View>
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                backIconSecondaryStyle,
                styles.grabHandleBarWrapper,
              ]}
            >
              <View style={[styles.grabHandleBar, styles.grabHandleBarSecondary]} />
            </Animated.View>
          </View>
        </Pressable>
      )}

      {/* Overlay actions row (back, follow, bell, edit) */}
      <View style={[styles.overlayRow, { top: actionButtonsTop }]}>
        {showBackButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.overlayBackButton}
          >
            <View style={styles.backIconContainer}>
              <Animated.View style={[StyleSheet.absoluteFillObject, backIconPrimaryStyle]}>
                <BackArrowIcon size={30} color={baseBackTextColor} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFillObject, backIconSecondaryStyle]}>
                <BackArrowIcon size={30} color={Colors.white} />
              </Animated.View>
            </View>
          </Pressable>
        ) : (
          <View style={styles.overlayBackSpacer} />
        )}

        <Animated.View style={[styles.overlayRightSection, overlayAnimatedStyle]}>
          {/* Menu button - same icon and sizing as UniversalHeader */}
          <Pressable onPress={handleMenuPress} style={styles.overlayMenuButton}>
            <MoreFillIcon
              size={24}
              color={
                (dynamicColors ? dynamicColors.textColor : profileColors.textColor) || Colors.white
              }
            />
          </Pressable>

          {/* Header actions rendered with the same ActionButton component as UniversalHeader */}
          {headerActions.length > 0 && (
            <View style={styles.overlayActionsContainer}>
              {headerActions.map(action => (
                <HeaderActionButton
                  key={action.id}
                  action={action}
                  textColor={
                    (dynamicColors ? dynamicColors.textColor : profileColors.textColor) ||
                    Colors.white
                  }
                  backgroundColor={
                    (dynamicColors
                      ? dynamicColors.backgroundColor
                      : profileColors.backgroundColor) || Colors.black
                  }
                />
              ))}
            </View>
          )}
        </Animated.View>
      </View>

      {showErrorScreen ? (
        renderErrorScreen
      ) : (
        <FeedRenderer
          ref={r => {
            tabRefs.profile = r;
          }}
          feedOption={
            activeTab === 'profile' ? 'profile' : activeTab === 'reposts' ? 'reposts' : 'likes'
          }
          userDid={profileDid}
          queryOptions={queryOptions}
          isModal={isModal}
          headerComponent={
            <View style={styles.headerContainer} pointerEvents="box-none">
              <ProfileHeader
                did={targetDid || profileData?.did || null}
                profileData={profileData}
                applySafeArea={!isModal}
                headerStyle={headerPaddingTop ? { paddingTop: headerPaddingTop } : undefined}
                onColorsChange={setDynamicColors}
                contentFadeDisabled={viewMode === 'grid'}
                dimOverlayDisabled={viewMode === 'grid'}
                onAvatarPress={
                  isLive
                    ? () => setShowLiveStreamSheet(true)
                    : profileData?.avatar
                      ? () => setFullscreenImageUri(profileData.avatar || null)
                      : undefined
                }
              >
                <TabNavigation
                  key={`tab-nav-${dynamicColors?.textColor || profileColors.textColor}`}
                  tabs={tabOptions}
                  activeTab={activeTab}
                  onTabPress={tabId => setActiveTab(tabId as 'profile' | 'reposts' | 'likes')}
                  textColor={dynamicColors ? dynamicColors.textColor : profileColors.textColor}
                  backgroundColor="transparent"
                  viewMode={viewMode}
                  onViewModeChange={(mode: ViewMode) => setViewMode(mode)}
                  showViewToggle={true}
                />
              </ProfileHeader>
            </View>
          }
          backgroundColor={
            dynamicColors ? dynamicColors.backgroundColor : profileColors.backgroundColor
          }
          secondaryColor={dynamicColors ? dynamicColors.textColor : profileColors.textColor}
          isRefreshing={isModal ? false : refreshing}
          onRefresh={isModal ? undefined : onRefresh}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isVisible={isRouteFocused}
          onVerticalScroll={handleVerticalScroll}
        />
      )}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Loading3FillIcon size={48} color={Colors.white} />
        </View>
      )}

      {/* Sheets and menus moved from ProfileHeader so overlay buttons can control them */}
      <ProfileMenu
        visible={showProfileMenu}
        onDismiss={() => setShowProfileMenu(false)}
        handle={profileData?.handle || ''}
        did={profileData?.did}
        isOwnProfile={!!isOwnProfileView}
        onLogout={handleLogoutFromMenu}
        onSwitchAccount={presentAccountSwitcher}
        chatSettings={profileData?.associated?.chat ?? undefined}
        viewerFollowedBy={Boolean(profileData?.viewer?.followedBy)}
        onMessagePress={handleMessagePress}
      />

      {profileData?.did && (
        <SubscriptionOptionsSheet
          visible={showSubscriptionSheet}
          onDismiss={() => setShowSubscriptionSheet(false)}
          did={profileData.did}
        />
      )}

      <LiveStreamInfoSheet
        visible={showLiveStreamSheet}
        profile={profileData}
        onDismiss={() => setShowLiveStreamSheet(false)}
      />

      <Modal
        visible={!!fullscreenImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenImageUri(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFullscreenImageUri(null)}>
          {fullscreenImageUri && (
            <Image
              source={{ uri: fullscreenImageUri }}
              style={styles.fullscreenImage}
              contentFit="contain"
            />
          )}
        </Pressable>
      </Modal>
    </View>
  );
});

ProfileScreen.displayName = 'ProfileScreen';

export default ProfileScreen;

// Optimized StyleSheet creation outside component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
    overflow: 'hidden',
  },
  headerContainer: {
    backgroundColor: Colors.transparent,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    height: Dimensions.get('window').height,
  },
  errorIcon: {
    marginBottom: 16,
    opacity: 0.8,
  },
  errorText: {
    textAlign: 'center',
    marginVertical: 8,
  },
  errorSubtext: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
  },
  errorButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
    minWidth: 150,
  },
  errorButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  secondaryButton: {
    backgroundColor: Colors.transparent,
  },
  overlayRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  overlayBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIconContainer: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBackSpacer: {
    width: 40,
    height: 40,
  },
  overlayRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  overlayMenuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayBlack95,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '95%',
    height: '80%',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  grabHandle: {
    position: 'absolute',
    top: 5,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  grabHandleContainer: {
    width: 42,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabHandleBarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabHandleBar: {
    width: 42,
    height: 4,
    borderRadius: 2,
  },
  grabHandleBarPrimary: {
    opacity: 0.5,
  },
  grabHandleBarSecondary: {
    backgroundColor: Colors.white,
    opacity: 0.5,
  },
});
