import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { BORDER_RADIUS, APP_CONSTANTS } from '../../src/utils/constants';
import { View, Text, StyleSheet, Pressable, Dimensions, Modal } from 'react-native';
import { Image } from 'expo-image';
import { FeedPager } from '../../src/components';
import ProfileService, {
  useProfileByDid,
  useProfile,
  isLiveStatus,
  useStatusExpirationMonitor,
} from '../../src/services/data/ProfileService';
import { getProfileColors } from '../../src/utils/formatting/colors';
import type { ProfileViewWithOrbyt } from '../../src/services/api/types';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon, {
  Loading3FillIcon,
  FollowIcon,
  MutualHeartIcon,
  BellFilledIcon,
  MoreFillIcon,
} from '../../src/components/ui/Icon';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ProfileHeader, TabNavigation, TabOption } from '../../src/components/layout/header';
import DetailScreenOverlay from '../../src/components/layout/detail/DetailScreenOverlay';
import { useCurrentUser, useProfileCacheSync, useFeedSettings } from '../../src/stores/userStore';
import {
  HeaderAction,
  HeaderActionButton,
} from '../../src/components/layout/header/UniversalHeader';
import { Colors } from '../../src/theme';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
import { useDetailScreenOverlay } from '../../src/hooks/useDetailScreenOverlay';
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
import { tabRefs, type ProfileRef } from '../../src/utils/navigation/tabRefs';
import type { ViewMode } from '../../src/types';
interface ProfileScreenProps {
  onLogout: (_clearAllAccounts?: boolean) => Promise<void>;
}

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawParams = useLocalSearchParams<{ did?: string }>();

  // Route file is [did].tsx - param name is "did", but we accept either DID or handle
  // and resolve handles to DIDs here (single place).
  const providedIdentifier = rawParams.did;
  const providedIsDid = !!providedIdentifier && providedIdentifier.startsWith('did:');

  const { currentUser } = useCurrentUser();
  const { modalProfileEnabled } = useFeedSettings();

  // Automatically sync ProfileCache with userStore
  useProfileCacheSync();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const didLongPressMenuRef = useRef(false);
  // Use DID in route key to differentiate between own profile and author profiles
  const profileRouteKey = useMemo(() => {
    if (providedIdentifier) {
      return `profile:${providedIdentifier}`;
    }
    // Own profile tab: use default key
    return 'profile:self';
  }, [providedIdentifier]);

  useVisibilityRouteTracker(profileRouteKey);
  const isRouteFocused = useVisibilityRouteIsActive(profileRouteKey);

  const queryClient = useQueryClient();

  // If param is a handle, resolve it to a DID (cached by DID inside the hook).
  const handleQuery = useProfile(!providedIsDid ? providedIdentifier : null);
  const resolvedDidFromHandle = handleQuery.data?.did ?? null;

  // Always use DID for the actual profile view
  const targetDid =
    (providedIsDid ? providedIdentifier : resolvedDidFromHandle) || currentUser?.did || null;

  // Determine if we're viewing our own profile
  const isViewingOwnProfile = !providedIdentifier;

  // Always fetch by DID (handle query is only used to resolve handle to DID)
  const didQuery = useProfileByDid(targetDid);

  // Use profile data from query with fallback for own profile
  const fallbackProfileData = useMemo<ProfileViewWithOrbyt | null>(() => {
    if (!isViewingOwnProfile) return null;
    if (!currentUser?.did || !currentUser?.handle) return null;
    return {
      did: currentUser.did,
      handle: currentUser.handle,
      displayName: currentUser.displayName ?? undefined,
      avatar: currentUser.avatar ?? undefined,
      description: '',
      viewer: {},
    } as ProfileViewWithOrbyt;
  }, [
    isViewingOwnProfile,
    currentUser?.did,
    currentUser?.handle,
    currentUser?.displayName,
    currentUser?.avatar,
  ]);

  const profileData = useMemo<ProfileViewWithOrbyt | null>(
    () => didQuery.data ?? fallbackProfileData,
    [didQuery.data, fallbackProfileData]
  );

  const refetchProfile = didQuery.refetch;
  const isProfileLoading = didQuery.isLoading && !profileData;
  const isProfileFetchError = didQuery.isError;

  // Colors come from profile (getProfileByDid includes orbytColors) – no separate color query
  const profileColors = getProfileColors(profileData);

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

      // Refetch profile (includes orbytColors) so cache is updated
      await refetchProfile();
    } catch {
      setProfileError('Failed to refresh profile.');
    } finally {
      // Reset refreshing state after a delay to show the refresh animation
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    }
  }, [refetchProfile]);

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

  const profileFeedOptions = useMemo(
    () => (isOwnProfileView ? ['profile', 'reposts', 'likes'] : ['profile', 'reposts']),
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
          {providedIdentifier
            ? `We couldn't find a profile for ${providedIdentifier}`
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
        {providedIdentifier && (
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
    providedIdentifier,
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

      // Trigger mutation (which handles optimistic updates in onMutate)
      followMutation.mutate({
        did: profileData.did,
        handle: profileData.handle,
        isFollowing: newFollowingState,
      });
    } catch {
      // no-op
    }
  }, [profileData, isBlocked, isBlockedByList, followMutation, blockMutation, isFollowing]);

  const handleMenuPress = useCallback(() => {
    // If a long-press fired, prevent the subsequent onPress from also running
    if (didLongPressMenuRef.current) {
      didLongPressMenuRef.current = false;
      return;
    }

    if (isOwnProfileView) {
      router.navigate('/settings');
    } else {
      setShowProfileMenu(true);
    }
  }, [isOwnProfileView, router]);

  const handleMenuPressIn = useCallback(() => {
    // `useRef` persists across navigation; clear at start of every gesture to avoid stale state.
    didLongPressMenuRef.current = false;
  }, []);

  const handleMenuLongPress = useCallback(() => {
    didLongPressMenuRef.current = true;
    presentAccountSwitcher();
  }, [presentAccountSwitcher]);

  const handleLogoutFromMenu = useCallback(async () => {
    if (onLogout) {
      await onLogout();
    }
  }, [onLogout]);

  const defaultTop = (insets?.top ?? 0) + 5;
  const overlayScrollProgressSV = useSharedValue(0);
  const {
    isModal,
    headerPaddingTop,
    actionButtonsTop,
    showBackButton,
    overlayAnimatedStyle,
    backIconPrimaryStyle,
    backIconSecondaryStyle,
  } = useDetailScreenOverlay(providedIdentifier, defaultTop, overlayScrollProgressSV);

  const baseBackTextColor = useMemo(
    () => profileColors.textColor || Colors.neutral[50],
    [profileColors.textColor]
  );

  const handleGrabHandlePress = useCallback(() => {
    tabRefs.profile?.scrollToTop();
  }, []);

  // Build header actions exactly as original ProfileHeader customActions
  const headerActions: HeaderAction[] = useMemo(() => {
    if (!profileData) return [];

    // Own profile: single "Edit profile" button
    if (isOwnProfileView) {
      return [
        {
          id: 'edit',
          label: 'Edit profile',
          onPress: () => router.navigate('/edit-profile'),
        },
      ];
    }

    const isFollowedBy = !!profileData.viewer?.followedBy;

    let label = isBlocked ? 'Unblock' : 'follow';
    let icon: string | undefined = undefined;
    let customIcon: React.ReactNode | undefined = isBlocked ? undefined : (
      <FollowIcon size={14} color={profileColors.textColor || Colors.neutral[50]} />
    );

    if (!isBlocked && isFollowing && isFollowedBy) {
      label = '';
      icon = undefined;
      customIcon = (
        <MutualHeartIcon size={20} color={profileColors.backgroundColor || Colors.black} />
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
                ? profileColors.backgroundColor || Colors.black
                : profileColors.textColor || Colors.neutral[50]
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
      <DetailScreenOverlay
        isModal={isModal}
        showBackButton={showBackButton}
        actionButtonsTop={actionButtonsTop}
        onBackPress={() => router.back()}
        onGrabHandlePress={handleGrabHandlePress}
        backIconColor={baseBackTextColor}
        backIconPrimaryStyle={backIconPrimaryStyle}
        backIconSecondaryStyle={backIconSecondaryStyle}
        overlayAnimatedStyle={overlayAnimatedStyle}
      >
        <Pressable
          onPress={handleMenuPress}
          onPressIn={handleMenuPressIn}
          onLongPress={isOwnProfileView ? handleMenuLongPress : undefined}
          delayLongPress={250}
          style={styles.overlayMenuButton}
        >
          <MoreFillIcon size={24} color={profileColors.textColor || Colors.neutral[50]} />
        </Pressable>
        {headerActions.length > 0 && (
          <View style={styles.overlayActionsContainer}>
            {headerActions.map(action => (
              <HeaderActionButton
                key={action.id}
                action={action}
                textColor={profileColors.textColor || Colors.neutral[50]}
                backgroundColor={profileColors.backgroundColor || Colors.black}
              />
            ))}
          </View>
        )}
      </DetailScreenOverlay>

      {showErrorScreen ? (
        renderErrorScreen
      ) : (
        <FeedPager
          ref={r => {
            tabRefs.profile = r as ProfileRef | null;
          }}
          feedOptions={profileFeedOptions}
          userDid={profileDid}
          currentFeed={activeTab}
          onFeedChange={feed => setActiveTab(feed as 'profile' | 'reposts' | 'likes')}
          showFeedIndicator={false}
          scrollEnabled={false}
          queryOptions={queryOptions}
          isVisible={isRouteFocused}
          isModal={isModal}
          headerComponent={
            <View style={styles.headerContainer} pointerEvents="box-none">
              <ProfileHeader
                did={targetDid || profileData?.did || null}
                profileData={profileData}
                applySafeArea={!isModal}
                controlStatusBar={!isModal}
                headerStyle={headerPaddingTop ? { paddingTop: headerPaddingTop } : undefined}
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
                  key={`tab-nav-${profileColors.textColor}`}
                  tabs={tabOptions}
                  activeTab={activeTab}
                  onTabPress={tabId => {
                    setActiveTab(tabId as 'profile' | 'reposts' | 'likes');
                    const index = profileFeedOptions.indexOf(tabId);
                    if (index >= 0) tabRefs.profile?.setPage(index);
                  }}
                  textColor={profileColors.textColor}
                  backgroundColor="transparent"
                  viewMode={viewMode}
                  onViewModeChange={(mode: ViewMode) => setViewMode(mode)}
                  showViewToggle={true}
                />
              </ProfileHeader>
            </View>
          }
          backgroundColor={profileColors.backgroundColor}
          secondaryColor={profileColors.textColor}
          isRefreshing={isModal ? false : refreshing}
          onRefresh={isModal ? undefined : onRefresh}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          contentScrollProgressOutput={overlayScrollProgressSV}
        />
      )}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Loading3FillIcon size={48} color={Colors.neutral[50]} />
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
        viewerFollowing={isFollowing}
        onMessagePress={
          profileData?.did
            ? () => {
                setShowProfileMenu(false);
                const pushChat = () => {
                  router.navigate({
                    pathname: '/chat/[id]',
                    params: { id: profileData.did, did: profileData.did },
                  });
                };
                if (modalProfileEnabled) {
                  router.dismissTo('/(tabs)/');
                  setTimeout(pushChat, 0);
                } else {
                  pushChat();
                }
              }
            : undefined
        }
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
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
  },
  errorButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
    minWidth: 150,
  },
  errorButtonText: {
    color: Colors.neutral[50],
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
    backgroundColor: Colors.overlay.black95,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '95%',
    height: '80%',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
});
