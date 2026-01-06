import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, Text, StyleSheet, Pressable, Dimensions, Modal } from 'react-native';
import { Image } from 'expo-image';
import AtprotoService from '../../src/services/api/AtprotoService';
// Use plain FlashList via FeedRenderer; no adapter/converter
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import ProfileService, {
  useProfile,
  useProfileByDid,
  getProfileColors,
  profileKeys,
  type CachedProfile,
} from '../../src/services/data/ProfileService';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Icon, {
  BackArrowIcon,
  Loading3FillIcon,
  FollowIcon,
  MutualHeartIcon,
  BellFilledIcon,
  MoreFillIcon,
} from '../../src/components/ui/Icon';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { ProfileHeader, TabNavigation, TabOption } from '../../src/components/layout/header';
import { useCurrentUser, useProfileCacheSync } from '../../src/stores/userStore';
import {
  HeaderAction,
  HeaderActionButton,
} from '../../src/components/layout/header/UniversalHeader';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  runOnUI,
} from 'react-native-reanimated';
import { useProfileFlags } from '../../src/stores/profileInteractionStore';
import { Colors } from '../../src/components/ui/UI';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowMutation } from '../../src/services/data/ProfileService';
import { queryKeys } from '../../src/utils/query/queryKeys';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import ProfileMenu from '../../src/components/features/profile/ProfileMenu';
import SubscriptionOptionsSheet from '../../src/components/features/profile/SubscriptionOptionsSheet';
import ChatService from '../../src/services/ChatService';
import { tabRefs } from '../../src/utils/navigation/tabRefs';
import type { ViewMode } from '../../src/types';

interface ProfileScreenProps {
  onLogout: (clearAllAccounts?: boolean) => Promise<void>;
}

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawParams = useLocalSearchParams<{ handle?: string; did?: string }>();

  // Route file is [did].tsx, but may receive handle or DID
  // Always resolve to DID - if we get a handle, fetch profile to get DID
  const rawIdentifier = rawParams.did || rawParams.handle;
  const isHandle = rawIdentifier && !rawIdentifier.startsWith('did:');
  const handleQuery = useProfile(isHandle ? rawIdentifier : null);

  // Resolve to DID: use provided DID, or DID from handle lookup, or current user DID
  const providedDid = useMemo(() => {
    if (!rawIdentifier) return undefined;
    if (rawIdentifier.startsWith('did:')) return rawIdentifier;
    if (isHandle && handleQuery.data?.did) return handleQuery.data.did;
    return undefined;
  }, [rawIdentifier, isHandle, handleQuery.data?.did]);

  // User store hooks
  const { currentUser } = useCurrentUser();

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

  useVisibilityRouteTracker(profileRouteKey, 'profile');
  const isRouteFocused = useVisibilityRouteIsActive(profileRouteKey);

  const queryClient = useQueryClient();

  // Always use DID - provided DID, or current user DID, or DID resolved from handle
  const targetDid = providedDid || currentUser?.did || null;

  // Determine if we're viewing our own profile
  const isViewingOwnProfile = !rawIdentifier;

  // Always fetch by DID (handle query is only used to resolve handle to DID)
  const didQuery = useProfileByDid(targetDid);

  // Use existing ProfileCache functionality with immediate fallback for own profile
  // If we resolved DID from handle, use that profile data; otherwise use DID query
  const cachedProfile: CachedProfile | null =
    didQuery.data ||
    (isHandle ? handleQuery.data : null) ||
    (isViewingOwnProfile && currentUser?.did && currentUser?.handle
      ? ({
          did: currentUser.did,
          handle: currentUser.handle,
          displayName: currentUser.displayName ?? undefined,
          avatar: currentUser.avatar ?? undefined,
          description: '',
          isFollowing: false,
          isFollowedBy: false,
          lastUpdated: Date.now(),
        } as CachedProfile)
      : null);

  const refetchProfile = didQuery.refetch || (isHandle ? handleQuery.refetch : undefined);
  const isProfileLoading =
    (didQuery.isLoading || (isHandle && handleQuery.isLoading)) && !cachedProfile;
  const isProfileFetchError = didQuery.isError || (isHandle && handleQuery.isError);

  // Get colors from cached profile
  const profileColors = getProfileColors(cachedProfile);

  // Force shimmer state for testing
  const forceShimmer = false; // Force loading state

  const isProfileLoadingForced =
    forceShimmer || (isProfileLoading && !cachedProfile) || (!targetDid && !rawIdentifier);

  // Tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'reposts' | 'likes'>('profile');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Ensure profile data is immediately available from cache
  const profileData = cachedProfile;
  const { flags } = useProfileFlags(
    profileData?.did ?? undefined,
    profileData?.handle ?? undefined
  );
  const isBlocked = !!flags?.isBlocked;

  // Memoized query options for profile feed
  const queryOptions = useMemo(
    () => ({
      enabled: Boolean(isRouteFocused && profileData?.did),
    }),
    [isRouteFocused, profileData?.did]
  );

  // Ensure profileData.did is defined for type safety
  const profileDid = profileData?.did ?? undefined;

  const profileVisibilityKey = useMemo(() => {
    const did = profileData?.did || providedDid || 'profile';
    return `profile:${did}:${activeTab}`;
  }, [profileData?.did, providedDid, activeTab]);

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

      // Explicitly refresh profile data using the same functions as initial load
      // This ensures com.getorbyt.profile records (colors) are refetched
      if (profileData?.did) {
        // Use refreshProfileByDid which calls getProfileByDid - fetches records with colors
        await ProfileService.refreshProfileByDid(profileData.did);
        // Invalidate React Query cache so it picks up the refreshed data
        queryClient.invalidateQueries({ queryKey: profileKeys.detail(`did_${profileData.did}`) });
      } else if (profileData?.handle) {
        // Use refreshProfile which calls getProfile - fetches records with colors
        await ProfileService.refreshProfile(profileData.handle);
        // Invalidate React Query cache so it picks up the refreshed data
        queryClient.invalidateQueries({
          queryKey: profileKeys.detail(profileData.handle.toLowerCase()),
        });
      }

      // Always refetch profile data so React Query cache is updated
      await refetchProfile();
    } catch (error) {
      setProfileError('Failed to refresh profile.');
    } finally {
      // Reset refreshing state after a delay to show the refresh animation
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    }
  }, [refetchProfile, profileData?.did, profileData?.handle, queryClient]);

  const handleLogout = async (clearAllAccounts: boolean = false) => {
    try {
      setRefreshing(true);

      // Clear ProfileCache and call onLogout
      ProfileService.clearCache();
      await onLogout(clearAllAccounts);
    } catch (error) {
    } finally {
      setRefreshing(false);
    }
  };

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
          {rawIdentifier && isHandle
            ? `We couldn't find a profile for @${rawIdentifier}`
            : profileError || "We couldn't retrieve your profile information"}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.errorButton,
            { borderColor: profileColors.textColor + '44' },
            pressed && { opacity: 0.7 },
          ]}
          onPress={onRefresh}
        >
          <Text style={[styles.errorButtonText, { color: profileColors.textColor || '#fff' }]}>
            Try Again
          </Text>
        </Pressable>
        {rawIdentifier && (
          <Pressable
            style={({ pressed }) => [
              styles.errorButton,
              styles.secondaryButton,
              { borderColor: profileColors.textColor + '44' },
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
    rawIdentifier,
    isHandle,
    profileError,
    onRefresh,
    router,
  ]);

  const isLoading = isProfileLoading && !cachedProfile;

  // Overlay action state (moved from ProfileHeader)
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSubscriptionSheet, setShowSubscriptionSheet] = useState(false);
  const [canMessage, setCanMessage] = useState<boolean | null>(null);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  const followMutation = useFollowMutation();

  // Read subscription state from store (for cross-component sharing)
  const isSubscribed = useSubscriptionStore(state =>
    profileData?.did ? state.isSubscribed(profileData.did) : false
  );

  // Read follow state directly from profileData (React Query cache - single source of truth)
  const isFollowing = profileData?.isFollowing ?? false;

  // Get raw profile response to access chat fields from getProfile
  // This includes associated.chat.allowIncoming and chat.activitySubscription
  const { data: rawProfile } = useQuery({
    queryKey: queryKeys.profiles.detail(profileData?.handle || profileData?.did || ''),
    queryFn: () => {
      if (profileData?.did) {
        return AtprotoService.getProfileByDid(profileData.did);
      } else if (profileData?.handle) {
        return AtprotoService.getProfile(profileData.handle);
      }
      return null;
    },
    enabled: !!profileData?.did && !isOwnProfileView,
  });

  // Message availability from getProfile response
  // associated.chat.allowIncoming can be 'none', 'all', 'following', or undefined
  const canMessageFromProfile = useMemo(() => {
    if (!rawProfile) return false;
    const allowIncoming = rawProfile.associated?.chat?.allowIncoming;
    switch (allowIncoming) {
      case 'none':
        return false;
      case 'all':
        return true;
      case 'following':
      case undefined:
        return Boolean(rawProfile.viewer?.followedBy);
      default:
        return false;
    }
  }, [rawProfile]);

  useEffect(() => {
    if (!profileData?.did || isOwnProfileView) {
      setCanMessage(null);
      return;
    }
    // Use chat availability from getProfile response
    setCanMessage(canMessageFromProfile ? true : false);
  }, [profileData?.did, isOwnProfileView, canMessageFromProfile]);

  // Handle tab press for scroll-to-top using React Navigation's tabPress event
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  useEffect(() => {
    // @ts-ignore - tabPress event exists but types may not be complete
    const unsubscribe = navigation.addListener?.('tabPress', () => {
      // Only handle if this screen is focused (tab was already active)
      if (isFocused && tabRefs.profile) {
        tabRefs.profile.scrollToTop();
      }
    });

    return unsubscribe;
  }, [navigation, isFocused]);

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
      if (isBlocked) {
        await AtprotoService.unblockUser(profileData.did);
        queryClient.invalidateQueries({ queryKey: queryKeys.blocks.status(profileData.did) });
        return;
      }

      const newFollowingState = !isFollowing;

      // Update React Query cache IMMEDIATELY (synchronous, instant UI update)
      // This is the source of truth the component reads from
      const handleKey = profileKeys.detail(profileData.handle);
      const didKey = profileKeys.detail(`did_${profileData.did}`);

      queryClient.setQueryData<CachedProfile>(handleKey, old =>
        old ? { ...old, isFollowing: newFollowingState } : old
      );
      queryClient.setQueryData<CachedProfile>(didKey, old =>
        old ? { ...old, isFollowing: newFollowingState } : old
      );

      // Trigger mutation (which will also update cache in onMutate and handle errors)
      followMutation.mutate({
        handle: profileData.handle,
        isFollowing: newFollowingState,
      });
    } catch {
      // no-op
    }
  }, [profileData, isBlocked, followMutation, queryClient, isFollowing]);

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

  const overlayTop = (typeof insets?.top === 'number' ? insets.top : 0) + 5;

  const showBackButton = !!rawIdentifier;

  // Shared scroll progress for header animation (0 = top, 1 = fully faded/dimmed)
  const headerScrollProgress = useSharedValue(0);

  // Update scroll progress on UI thread (worklet directive required for runOnUI)
  const handleVerticalScroll = useCallback((scrollY: number) => {
    runOnUI((y: number) => {
      'worklet';
      // Map first 250px of scroll into 0 -> 1 progress
      headerScrollProgress.value = Math.max(0, Math.min(1, y / 250));
    })(scrollY);
  }, []);

  // Animated styles automatically run on UI thread (worklet directive optional in Reanimated 4)
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress.value;
    // Smooth fade: start fading at 30%, complete fade by 80%
    const opacity = interpolate(progress, [0, 0.3, 0.8], [1, 1, 0], Extrapolate.CLAMP);
    return { opacity };
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

    const isFollowedBy = !!profileData.isFollowedBy;

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
    handleFollowUnfollow,
    isSubscribed,
    isFollowing,
    dynamicColors,
    profileColors.backgroundColor,
    profileColors.textColor,
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
      {/* Overlay actions row (back, follow, bell, edit) */}
      <View style={[styles.overlayRow, { top: overlayTop }]}>
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
          headerComponent={
            <View style={styles.headerContainer} pointerEvents="box-none">
              <ProfileHeader
                handle={profileData?.handle || null}
                showBackButton={false}
                isOwnProfile={!!isOwnProfileView}
                onLogout={handleLogout}
                onSwitchAccount={presentAccountSwitcher}
                forceLoading={isProfileLoadingForced}
                applySafeArea={true}
                onColorsChange={setDynamicColors}
                headerScrollProgress={headerScrollProgress}
                contentFadeDisabled={viewMode === 'grid'}
                dimOverlayDisabled={viewMode === 'grid'}
                onAvatarPress={
                  profileData?.avatar
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
          isProfileLoading={!!(isProfileLoading && !profileData)}
          isRefreshing={refreshing}
          onRefresh={onRefresh}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isVisible={isRouteFocused}
          visibilityKey={profileVisibilityKey}
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
        isOwnProfile={!!isOwnProfileView}
        onLogout={handleLogoutFromMenu}
        onSwitchAccount={presentAccountSwitcher}
        canMessage={canMessage === null ? undefined : canMessage === true}
        onMessagePress={handleMessagePress}
      />

      {profileData?.did && (
        <SubscriptionOptionsSheet
          visible={showSubscriptionSheet}
          onDismiss={() => setShowSubscriptionSheet(false)}
          did={profileData.did}
        />
      )}

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
          <Pressable
            style={[styles.closeButton, { top: overlayTop }]}
            onPress={() => setFullscreenImageUri(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close" size={30} color={Colors.white} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

export default ProfileScreen;

// Optimized StyleSheet creation outside component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
    overflow: 'hidden',
  },
  headerContainer: {
    backgroundColor: 'transparent',
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
    fontFamily: 'Firma-Medium',
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
    borderWidth: 1,
    marginTop: 20,
    minWidth: 150,
  },
  errorButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
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
    backgroundColor: 'transparent',
    borderColor: Colors.mediumGray,
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
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '95%',
    height: '80%',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  closeButton: {
    position: 'absolute',
    left: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
