import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  Easing,
  LinearTransition,
} from 'react-native-reanimated';
import { BORDER_RADIUS, APP_CONSTANTS, ICON_SIZES } from '@/utils/constants';
import { getEffectiveTopInset } from '@/utils/device/screen';
import { View, StyleSheet, Platform, Linking, Alert } from 'react-native';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import FeedPager from '@/components/features/feed/FeedPager';
import {
  useProfileByDid,
  useProfile,
  isLiveStatus,
  useStatusExpirationMonitor,
} from '@/services/data/ProfileService';
import { getProfileColors, hexToRGBA } from '@/utils/formatting/colors';
import type { ProfileViewWithOrbyt } from '@/services/api/types';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FollowIcon, MutualHeartIcon, BellFilledIcon, MoreFillIcon } from '@/components/ui/Icon';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ProfileHeader, TabNavigation, TabOption } from '@/components/layout/header';
import DetailScreenOverlay from '@/components/layout/detail/DetailScreenOverlay';
import {
  ProfileChannelFeedLayout,
  ProfileChannelFeedLoadingOverlay,
  ProfileChannelErrorScreen,
  PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET,
  PROFILE_CHANNEL_FEED_PAGER_DEFAULTS,
  PROFILE_CHANNEL_TAB_NAVIGATION_DEFAULTS,
} from '@/components/layout/detail/ProfileChannelFeedLayout';
import { useCurrentUser, useUserStore } from '@/stores/userStore';
import { HeaderAction, HeaderActionButton } from '@/components/layout/header/UniversalHeader';
import { Colors } from '@/theme';
import { useGlobalAccountSwitcher } from '@/hooks/useGlobalModals';
import { useVisibilityRouteIsActive } from '@/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowMutation, useBlockMutation } from '@/services/data/ProfileService';
import { queryKeys } from '@/utils/query/queryKeys';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { feedService } from '@/services/FeedService';
import { FEED_CONFIG } from '@/hooks/useFeed';
import type { FeedResponse } from '@/services/api/types';
import ProfileMenu from '@/components/features/profile/ProfileMenu';
import SubscriptionOptionsSheet from '@/components/features/profile/SubscriptionOptionsSheet';
import LiveStreamInfoSheet from '@/components/features/profile/LiveStreamInfoSheet';
import type { MenuAction } from '@react-native-menu/menu';
import { tabRefs, type FeedPagerRef } from '@/utils/navigation/tabRefs';
import type { ViewMode } from '@/types';
import { useOrbytColors } from '@/services/colors';
import { navigateToProfileImageViewer } from '@/utils/navigation/profileImageViewer';

interface ProfileScreenProps {
  onLogout: (_clearAllAccounts?: boolean) => Promise<void>;
}

type ProfileFeedTab = 'profile' | 'reposts' | 'likes' | 'bookmarks' | 'watched';

const OVERLAY_HEADER_ACTIONS_LAYOUT = LinearTransition.duration(360).easing(
  Easing.inOut(Easing.cubic)
);

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const rawParams = useLocalSearchParams<{ did?: string }>();

  // Route file is [did].tsx - param name is "did", but we accept either DID or handle
  // and resolve handles to DIDs here (single place).
  const providedIdentifier = rawParams.did;
  const providedIsDid = !!providedIdentifier && providedIdentifier.startsWith('did:');

  const { currentUser } = useCurrentUser();

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

  const isRouteFocused = useVisibilityRouteIsActive(profileRouteKey);

  const queryClient = useQueryClient();

  // If param is a handle, resolve it to a DID (cached by DID inside the hook).
  const handleQuery = useProfile(!providedIsDid ? providedIdentifier : null);
  const resolvedDidFromHandle = handleQuery.data?.did ?? null;

  // Always use DID for the actual profile view.
  // Only fall back to current user DID when no external identifier was provided.
  const targetDid = useMemo(() => {
    if (providedIsDid) return providedIdentifier || null;
    if (providedIdentifier) return resolvedDidFromHandle;
    return currentUser?.did || null;
  }, [providedIsDid, providedIdentifier, resolvedDidFromHandle, currentUser?.did]);

  // Determine if we're viewing our own profile
  const isViewingOwnProfile = !providedIdentifier;

  const ownProfilePlaceholder = useMemo<ProfileViewWithOrbyt | undefined>(() => {
    if (!isViewingOwnProfile) return undefined;
    if (!currentUser?.did || !currentUser?.handle) return undefined;

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

  // Always fetch by DID (handle query is only used to resolve handle to DID)
  const didQuery = useProfileByDid(targetDid, {
    refetchOnWindowFocus: true,
    refetchInterval: isRouteFocused ? 3 * 60 * 1000 : (false as const),
    refetchIntervalInBackground: false,
    placeholderData: ownProfilePlaceholder,
  });

  const profileData = didQuery.data ?? null;

  const refetchProfile = didQuery.refetch;
  const isHandleResolving = !!providedIdentifier && !providedIsDid && handleQuery.isLoading;
  const isProfileLoading = didQuery.isLoading && !profileData;
  const isProfileFetchError = didQuery.isError;
  const isExternalProfileMissing =
    !!providedIdentifier && !didQuery.isLoading && !isHandleResolving && !profileData;

  const { data: orbytColorsFromQuery } = useOrbytColors(targetDid);
  const mergedOrbytColors = useMemo(() => {
    if (profileData?.orbytColors && orbytColorsFromQuery) {
      return {
        ...profileData.orbytColors,
        ...orbytColorsFromQuery,
      };
    }
    return orbytColorsFromQuery ?? profileData?.orbytColors ?? null;
  }, [profileData?.orbytColors, orbytColorsFromQuery]);

  const profileColors = useMemo(
    () => getProfileColors(mergedOrbytColors || profileData),
    [mergedOrbytColors, profileData]
  );

  // Check if live using helper function
  const isLive = isLiveStatus(profileData?.status);

  // Monitor status expiration and invalidate cache when it expires
  useStatusExpirationMonitor(profileData, targetDid);

  // Tab state
  const [activeTab, setActiveTab] = useState<ProfileFeedTab>('profile');
  const viewMode = useUserStore(state => state.profileFeedViewMode);
  const setProfileFeedViewMode = useUserStore(state => state.setProfileFeedViewMode);
  const setViewMode = (mode: ViewMode) => void setProfileFeedViewMode(mode);

  // Read block state directly from profileData viewer fields (React Query cache - single source of truth)
  const isBlocked = !!(profileData?.viewer?.blocking || profileData?.viewer?.blockingByList);
  const isBlockedByList = !!profileData?.viewer?.blockingByList;

  // Memoized query options for profile feed
  const queryOptions = useMemo(
    () => ({
      enabled: Boolean(profileData?.did),
    }),
    [profileData?.did]
  );

  // Ensure profileData.did is defined for type safety
  const profileDid = profileData?.did ?? undefined;

  // Colors are extracted during profile fetch in ProfileService.ts - no need to do it here

  /** Profile metadata + subscriptions; runs with feed `refetch` on pull-to-refresh and on error retry. */
  const refreshProfileMetadata = useCallback(async () => {
    setProfileError(null);
    try {
      try {
        const { useSubscriptionStore } = await import('@/stores/subscriptionStore');
        await useSubscriptionStore.getState().initialize();
      } catch {
        // Subscriptions are non-critical; ignore errors
      }
      await refetchProfile();
    } catch {
      setProfileError(t('profile.failedToRefresh'));
    }
  }, [refetchProfile, t]);

  const isOwnProfileView = useMemo(() => {
    if (isViewingOwnProfile) return true;

    // Check if viewed profile DID matches signed-in user DID
    return !!(currentUser?.did && profileData?.did && currentUser.did === profileData.did);
  }, [isViewingOwnProfile, currentUser?.did, profileData?.did]);

  const tabOptions: TabOption[] = useMemo(
    () => [
      { id: 'profile', label: t('profile.videos') },
      { id: 'reposts', label: t('profile.reposts') },
      ...(isOwnProfileView
        ? [
            { id: 'likes', label: t('profile.likes') },
            { id: 'bookmarks', label: t('profile.saves') },
            { id: 'watched', label: t('profile.watched') },
          ]
        : []),
    ],
    [isOwnProfileView, t]
  );

  const profileFeedOptions = useMemo(
    () =>
      isOwnProfileView
        ? (['profile', 'reposts', 'likes', 'bookmarks', 'watched'] as const)
        : (['profile', 'reposts'] as const),
    [isOwnProfileView]
  );

  useEffect(() => {
    const allowedFeeds = profileFeedOptions as readonly ProfileFeedTab[];
    if (!allowedFeeds.includes(activeTab)) {
      setActiveTab('profile');
      tabRefs.profile?.setPage(0);
    }
  }, [profileFeedOptions, activeTab]);

  const showErrorScreen = useMemo(
    () => (isProfileFetchError || profileError || isExternalProfileMissing) && !didQuery.isFetching,
    [isProfileFetchError, profileError, isExternalProfileMissing, didQuery.isFetching]
  );

  const renderErrorScreen = useMemo(() => {
    const subtitle = providedIdentifier
      ? t('profile.notFoundFor', { identifier: providedIdentifier })
      : profileError || t('profile.retrieveFailed');
    return (
      <ProfileChannelErrorScreen
        title={t('profile.notFound')}
        subtitle={subtitle}
        onRetry={refreshProfileMetadata}
        onGoBack={providedIdentifier ? () => router.back() : undefined}
      />
    );
  }, [providedIdentifier, profileError, refreshProfileMetadata, router, t]);

  const isLoading = (isProfileLoading || isHandleResolving) && !profileData;

  // Overlay action state (moved from ProfileHeader)
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSubscriptionSheet, setShowSubscriptionSheet] = useState(false);
  const [showLiveStreamSheet, setShowLiveStreamSheet] = useState(false);
  const liveAvatarMenuActions = useMemo<MenuAction[]>(() => {
    if (!isLive) return [];
    const actions: MenuAction[] = [{ id: 'liveInfo', title: t('profile.avatarMenuSeeLiveInfo') }];
    if (profileData?.avatar) {
      actions.push({ id: 'viewAvatar', title: t('profile.avatarMenuViewProfilePicture') });
    }
    return actions;
  }, [isLive, profileData?.avatar, t]);

  const onLiveAvatarMenuAction = useCallback(
    (actionId: string) => {
      if (actionId === 'liveInfo') {
        setShowLiveStreamSheet(true);
        return;
      }
      if (actionId === 'viewAvatar' && profileData?.avatar) {
        navigateToProfileImageViewer(profileData.avatar);
      }
    },
    [profileData?.avatar]
  );

  const followMutation = useFollowMutation();
  const blockMutation = useBlockMutation();

  // Read subscription state from store (for cross-component sharing)
  const isSubscribed = useSubscriptionStore(state =>
    profileData?.did ? state.isSubscribed(profileData.did) : false
  );

  // Read follow state directly from profileData viewer (React Query cache - single source of truth)
  const isFollowing = !!profileData?.viewer?.following;

  // ProfileViewWithOrbyt already includes all ProfileView fields including associated.chat

  // Germ DM subtitle action (inline in header, not overlay)
  // Own profile: tap shows bottom sheet (user cannot DM themselves; can only disconnect)
  // Others: tap opens Germ DM URL
  const germSubtitleAction = useMemo(() => {
    if (!profileData?.did || !currentUser?.did) return undefined;
    const germ = profileData?.associated?.germ;
    if (!germ?.messageMeUrl) return undefined;
    const isOwnProfile = profileData.did === currentUser.did;
    // Own profile: always show if enabled. Others: respect showButtonTo.
    if (
      !isOwnProfile &&
      ((germ.showButtonTo !== 'everyone' && germ.showButtonTo !== 'usersIFollow') ||
        (germ.showButtonTo === 'usersIFollow' && !profileData?.viewer?.followedBy))
    )
      return undefined;
    const baseUrl = germ.messageMeUrl.replace(/\/$/, '');
    const platform = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'android' : 'web';
    const url = `${baseUrl}/${platform}#${profileData.did}+${currentUser.did}`;

    const onPress = () => {
      if (isOwnProfile) {
        Alert.alert(t('profile.germDm'), t('profile.germDisconnectSheetDescription'), [
          {
            text: t('profile.germDisconnect'),
            onPress: async () => {
              const ok = await (
                await import('@/services/api/repo/RepoService')
              ).RepoService.deleteGermDeclaration();
              if (ok) {
                queryClient.invalidateQueries({
                  queryKey: queryKeys.profiles.detail(profileData.did),
                });
                Alert.alert(t('common.success'), t('profile.germDisconnected'));
              } else {
                Alert.alert(t('common.error'), t('errors.unexpected'));
              }
            },
          },
          {
            text: t('common.ok'),
            onPress: () => {},
          },
        ]);
      } else {
        Linking.openURL(url);
      }
    };

    return {
      label: t('profile.germDm'),
      onPress,
    };
  }, [
    profileData?.did,
    profileData?.associated?.germ,
    profileData?.viewer?.followedBy,
    currentUser?.did,
    queryClient,
    t,
  ]);

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

  const insets = useSafeAreaInsets();
  const topInset = getEffectiveTopInset(insets.top);
  const defaultTop = topInset + PROFILE_CHANNEL_FEED_OVERLAY_TOP_OFFSET;
  const overlayScrollProgressSV = useSharedValue(0);
  const actionButtonsTop = defaultTop;
  const showBackButton = !!providedIdentifier;

  const backIconPrimaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(overlayScrollProgressSV.value, [0, 1], [1, 0], Extrapolate.CLAMP),
  }));

  const backIconSecondaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(overlayScrollProgressSV.value, [0, 1], [0, 1], Extrapolate.CLAMP),
  }));

  const overlayControlFadeAnimatedStyle = useAnimatedStyle(() => {
    const progress = overlayScrollProgressSV.value;
    // Start fading sooner and complete fade earlier than before.
    const normalizedFade = interpolate(progress, [0.12, 0.55], [0, 1], Extrapolate.CLAMP);
    // Smooth curve for less abrupt linear fade.
    const easedFade = normalizedFade * normalizedFade * (3 - 2 * normalizedFade);

    return {
      opacity: 1 - easedFade,
    };
  }, [overlayScrollProgressSV]);

  const baseBackTextColor = useMemo(
    () => profileColors.textColor || Colors.neutral[50],
    [profileColors.textColor]
  );
  // Build header actions exactly as original ProfileHeader customActions
  const headerActions: HeaderAction[] = useMemo(() => {
    if (!profileData) return [];

    // Own profile: single "Edit profile" button
    if (isOwnProfileView) {
      return [
        {
          id: 'edit',
          label: t('profile.editProfile'),
          active: true,
          onPress: () => router.navigate('/edit-profile'),
        },
      ];
    }

    const isFollowedBy = !!profileData.viewer?.followedBy;

    let label = isBlocked ? t('profile.unblock') : t('profile.follow');
    let icon: string | undefined = undefined;
    let customIcon: React.ReactNode | undefined = isBlocked ? undefined : (
      <FollowIcon size={22} color={profileColors.textColor || Colors.neutral[50]} />
    );

    if (!isBlocked && isFollowing && isFollowedBy) {
      label = '';
      icon = undefined;
      customIcon = (
        <MutualHeartIcon
          size={ICON_SIZES.LARGE}
          color={profileColors.backgroundColor || Colors.black}
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
    t,
    isFollowing,
    profileColors.backgroundColor,
    profileColors.textColor,
    router,
  ]);

  return (
    <ProfileChannelFeedLayout backgroundColor={profileColors.chromeBackgroundColor}>
      <DetailScreenOverlay
        showBackButton={showBackButton}
        actionButtonsTop={actionButtonsTop}
        onBackPress={() => router.back()}
        backIconColor={baseBackTextColor}
        backIconPrimaryStyle={backIconPrimaryStyle}
        backIconSecondaryStyle={backIconSecondaryStyle}
      >
        {!showErrorScreen && (
          <Animated.View style={[styles.overlayMenuWrap, overlayControlFadeAnimatedStyle]}>
            <SquircleNativePressable
              onPress={handleMenuPress}
              onPressIn={handleMenuPressIn}
              onLongPress={isOwnProfileView ? handleMenuLongPress : undefined}
              delayLongPress={250}
              style={styles.overlayMenuButton}
              androidRippleBorderless
            >
              <MoreFillIcon size={24} color={profileColors.textColor || Colors.neutral[50]} />
            </SquircleNativePressable>
          </Animated.View>
        )}
        {headerActions.length > 0 && (
          <Animated.View
            style={[styles.overlayActionsContainer, overlayControlFadeAnimatedStyle]}
            layout={OVERLAY_HEADER_ACTIONS_LAYOUT}
          >
            {headerActions.map((action, index) => (
              <View
                key={action.id}
                style={[
                  styles.overlayHeaderActionSlot,
                  {
                    zIndex: headerActions.length - index,
                    elevation: (headerActions.length - index) * 2,
                  },
                ]}
              >
                <HeaderActionButton
                  action={action}
                  textColor={profileColors.textColor || Colors.neutral[50]}
                  backgroundColor={profileColors.backgroundColor || Colors.black}
                  preferLiquidGlass={false}
                />
              </View>
            ))}
          </Animated.View>
        )}
      </DetailScreenOverlay>

      {showErrorScreen ? (
        renderErrorScreen
      ) : (
        <FeedPager
          ref={r => {
            tabRefs.profile = r as FeedPagerRef | null;
          }}
          feedOptions={profileFeedOptions}
          userDid={profileDid}
          currentFeed={activeTab}
          onFeedChange={feed => setActiveTab(feed as ProfileFeedTab)}
          {...PROFILE_CHANNEL_FEED_PAGER_DEFAULTS}
          pullToRefreshEnabled
          onPullToRefreshExtra={refreshProfileMetadata}
          queryOptions={queryOptions}
          isVisible={isRouteFocused}
          headerComponent={
            <View style={styles.headerContainer} pointerEvents="box-none">
              <ProfileHeader
                did={targetDid || profileData?.did || null}
                profileData={profileData}
                contentScrollProgressSV={overlayScrollProgressSV}
                applySafeArea
                controlStatusBar
                subtitleAction={germSubtitleAction}
                {...(liveAvatarMenuActions.length > 0
                  ? {
                      avatarMenuActions: liveAvatarMenuActions,
                      onAvatarMenuAction: onLiveAvatarMenuAction,
                    }
                  : {
                      onAvatarPress: profileData?.avatar
                        ? () => navigateToProfileImageViewer(profileData.avatar!)
                        : undefined,
                    })}
              >
                <TabNavigation
                  key={`tab-nav-${profileColors.textColor}`}
                  tabs={tabOptions}
                  activeTab={activeTab}
                  onTabPress={tabId => {
                    setActiveTab(tabId as ProfileFeedTab);
                    const index = (profileFeedOptions as readonly string[]).indexOf(tabId);
                    if (index >= 0) tabRefs.profile?.setPage(index);
                  }}
                  textColor={profileColors.textColor}
                  inactiveTextColor={hexToRGBA(profileColors.textColor || Colors.neutral[50], 0.65)}
                  backgroundColor="transparent"
                  viewMode={viewMode}
                  onViewModeChange={(mode: ViewMode) => setViewMode(mode)}
                  {...PROFILE_CHANNEL_TAB_NAVIGATION_DEFAULTS}
                />
              </ProfileHeader>
            </View>
          }
          backgroundColor={profileColors.chromeBackgroundColor}
          secondaryColor={profileColors.textColor}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          contentScrollProgressOutput={overlayScrollProgressSV}
        />
      )}
      <ProfileChannelFeedLoadingOverlay visible={isLoading} />

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
                router.navigate({
                  pathname: '/chat/[id]',
                  params: { id: profileData.did, did: profileData.did },
                });
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
    </ProfileChannelFeedLayout>
  );
});

ProfileScreen.displayName = 'ProfileScreen';

export default ProfileScreen;

// Optimized StyleSheet creation outside component
const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: Colors.transparent,
  },
  overlayMenuWrap: {
    zIndex: 1,
  },
  overlayMenuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.FULL,
    overflow: 'hidden',
  },
  overlayActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    zIndex: 2,
  },
  /** Lets the lead (e.g. follow) pill paint above trailing actions during layout morph. */
  overlayHeaderActionSlot: {
    position: 'relative',
  },
});
