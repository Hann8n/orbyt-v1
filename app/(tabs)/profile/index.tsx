import React, { useEffect, useState, useRef } from 'react';
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
  ProfileChannelFeedLoadingScreen,
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
import { useFollowMutation, useBlockMutation, useSubscriptionMutation } from '@/services/data/ProfileService';
import { queryKeys } from '@/utils/query/queryKeys';
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

const ProfileScreen: React.FC<ProfileScreenProps> = ({ onLogout }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const rawParams = useLocalSearchParams<{ did?: string }>();

  const providedIdentifier = rawParams.did;
  const providedIsDid = !!providedIdentifier && providedIdentifier.startsWith('did:');

  const { currentUser } = useCurrentUser();

  const [profileError, setProfileError] = useState<string | null>(null);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const didLongPressMenuRef = useRef(false);

  // Use DID in route key to differentiate between own profile and author profiles
  const profileRouteKey = providedIdentifier ? `profile:${providedIdentifier}` : 'profile:self';

  const isRouteFocused = useVisibilityRouteIsActive(profileRouteKey);

  const queryClient = useQueryClient();

  // If param is a handle, resolve it to a DID (cached by DID inside the hook).
  const handleQuery = useProfile(!providedIsDid ? providedIdentifier : null);
  const resolvedDidFromHandle = handleQuery.data?.did ?? null;

  // Always use DID for the actual profile view.
  // Only fall back to current user DID when no external identifier was provided.
  const targetDid = (() => {
    if (providedIsDid) return providedIdentifier || null;
    if (providedIdentifier) return resolvedDidFromHandle;
    return currentUser?.did || null;
  })();

  const isViewingOwnProfile = !providedIdentifier;

  const ownProfilePlaceholder: ProfileViewWithOrbyt | undefined = (() => {
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
  })();

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
  const mergedOrbytColors = (() => {
    if (profileData?.orbytColors && orbytColorsFromQuery) {
      return { ...profileData.orbytColors, ...orbytColorsFromQuery };
    }
    return orbytColorsFromQuery ?? profileData?.orbytColors ?? null;
  })();

  const profileColors = getProfileColors(mergedOrbytColors || profileData);

  const isLive = isLiveStatus(profileData?.status);

  useStatusExpirationMonitor(profileData, targetDid);

  const [activeTab, setActiveTab] = useState<ProfileFeedTab>('profile');
  const viewMode = useUserStore(state => state.profileFeedViewMode);
  const setProfileFeedViewMode = useUserStore(state => state.setProfileFeedViewMode);
  const setViewMode = (mode: ViewMode) => void setProfileFeedViewMode(mode);

  const isBlocked = !!(profileData?.viewer?.blocking || profileData?.viewer?.blockingByList);
  const isBlockedByList = !!profileData?.viewer?.blockingByList;

  const queryOptions = { enabled: Boolean(profileData?.did) };

  const profileDid = profileData?.did ?? undefined;

  const refreshProfileMetadata = async () => {
    setProfileError(null);
    try {
      await refetchProfile();
    } catch {
      setProfileError(t('profile.failedToRefresh'));
    }
  };

  const isOwnProfileView = (() => {
    if (isViewingOwnProfile) return true;
    return !!(currentUser?.did && profileData?.did && currentUser.did === profileData.did);
  })();

  const tabOptions: TabOption[] = [
    { id: 'profile', label: t('profile.videos') },
    { id: 'reposts', label: t('profile.reposts') },
    ...(isOwnProfileView
      ? [
          { id: 'likes', label: t('profile.likes') },
          { id: 'bookmarks', label: t('profile.saves') },
          { id: 'watched', label: t('profile.watched') },
        ]
      : []),
  ];

  const profileFeedOptions = isOwnProfileView
    ? (['profile', 'reposts', 'likes', 'bookmarks', 'watched'] as const)
    : (['profile', 'reposts'] as const);

  useEffect(() => {
    const allowedFeeds = profileFeedOptions as readonly ProfileFeedTab[];
    if (!allowedFeeds.includes(activeTab)) {
      setActiveTab('profile');
      tabRefs.profile?.setPage(0);
    }
  }, [profileFeedOptions, activeTab]);

  const showErrorScreen =
    (isProfileFetchError || profileError || isExternalProfileMissing) && !didQuery.isFetching;

  const renderErrorScreen = (
    <ProfileChannelErrorScreen
      title={t('profile.notFound')}
      subtitle={
        providedIdentifier
          ? t('profile.notFoundFor', { identifier: providedIdentifier })
          : profileError || t('profile.retrieveFailed')
      }
      onRetry={refreshProfileMetadata}
      onGoBack={providedIdentifier ? () => router.back() : undefined}
    />
  );

  const isLoading = (isProfileLoading || isHandleResolving) && !profileData;
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSubscriptionSheet, setShowSubscriptionSheet] = useState(false);
  const [showLiveStreamSheet, setShowLiveStreamSheet] = useState(false);

  const liveAvatarMenuActions: MenuAction[] = (() => {
    if (!isLive) return [];
    const actions: MenuAction[] = [{ id: 'liveInfo', title: t('profile.avatarMenuSeeLiveInfo') }];
    if (profileData?.avatar) {
      actions.push({ id: 'viewAvatar', title: t('profile.avatarMenuViewProfilePicture') });
    }
    return actions;
  })();

  const onLiveAvatarMenuAction = (actionId: string) => {
    if (actionId === 'liveInfo') {
      setShowLiveStreamSheet(true);
      return;
    }
    if (actionId === 'viewAvatar' && profileData?.avatar) {
      navigateToProfileImageViewer(profileData.avatar);
    }
  };

  const followMutation = useFollowMutation();
  const blockMutation = useBlockMutation();
  const subscriptionMutation = useSubscriptionMutation();

  const isSubscribed = !!(profileData?.viewer?.activitySubscription?.post || profileData?.viewer?.activitySubscription?.reply);
  const isFollowing = !!profileData?.viewer?.following;

  const germSubtitleAction = (() => {
    if (!profileData?.did || !currentUser?.did) return undefined;
    const germ = profileData?.associated?.germ;
    if (!germ?.messageMeUrl) return undefined;
    const isOwnProfile = profileData.did === currentUser.did;
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

    return { label: t('profile.germDm'), onPress };
  })();

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

  const handleFollowUnfollow = async () => {
    if (!profileData?.did || !profileData?.handle) return;

    if (isBlockedByList) return;

    if (isBlocked) {
      blockMutation.mutate({
        did: profileData.did,
        handle: profileData.handle,
        isBlocked: false,
      });
      return;
    }

    followMutation.mutate({
      did: profileData.did,
      handle: profileData.handle,
      isFollowing: !isFollowing,
    });
  };

  const handleMenuPress = () => {
    if (didLongPressMenuRef.current) {
      didLongPressMenuRef.current = false;
      return;
    }
    if (isOwnProfileView) {
      router.navigate('/settings');
    } else {
      setShowProfileMenu(true);
    }
  };

  const handleMenuPressIn = () => {
    didLongPressMenuRef.current = false;
  };

  const handleMenuLongPress = () => {
    didLongPressMenuRef.current = true;
    presentAccountSwitcher();
  };

  const handleLogoutFromMenu = async () => {
    if (onLogout) {
      await onLogout();
    }
  };

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
    const normalizedFade = interpolate(progress, [0.12, 0.55], [0, 1], Extrapolate.CLAMP);
    const easedFade = normalizedFade * normalizedFade * (3 - 2 * normalizedFade);
    return { opacity: 1 - easedFade };
  }, [overlayScrollProgressSV]);

  const baseBackTextColor = profileColors.textColor || Colors.neutral[50];

  const headerActions: HeaderAction[] = (() => {
    if (!profileData) return [];

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
      disabled: isBlockedByList,
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
          if (!isSubscribed) {
            subscriptionMutation.mutate({ did, preferences: { post: true, reply: false } });
          } else {
            subscriptionMutation.mutate({ did, preferences: { post: false, reply: false } });
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
  })();

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
      ) : isLoading ? (
        <ProfileChannelFeedLoadingScreen backgroundColor={profileColors.chromeBackgroundColor} />
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
};

ProfileScreen.displayName = 'ProfileScreen';

export default ProfileScreen;

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
  overlayHeaderActionSlot: {
    position: 'relative',
  },
});
