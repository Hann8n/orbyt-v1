import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { tabRefs } from '../../src/utils/tabRefs';
import type { ScrollToTopRef } from '../../src/utils/tabRefs';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import AtprotoService from '../../src/services/api/AtprotoService';
// Use plain FlashList via FeedRenderer; no adapter/converter
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import EmptyFeed from '../../src/components/features/feed/EmptyFeed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileCache, { 
  useProfile, 
  useProfileByDid,
  useProfileColors,
  useProfileInvalidation,
  profileKeys
} from '../../src/services/cache/ProfileCache';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon, { BackArrowIcon, Loading3FillIcon, FollowIcon, MutualHeartIcon, BellFilledIcon, MoreFillIcon } from '../../src/components/ui/Icon';
import { useQueryClient } from '@tanstack/react-query';
import { ProfileHeader, TabNavigation, TabOption } from '../../src/components/layout/header';
import { useCurrentUser, useAccountManagement, useUserStore, useProfileCacheSync } from '../../src/stores/userStore';
import { useProfileFlags } from '../../src/stores/profileInteractionStore';
import { Colors } from '../../src/components/ui/UI';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowMutation } from '../../src/services/cache/ProfileCache';
import { createQueryKeys } from '../../src/services/FeedService';
import { useUserSubscription } from '../../src/stores/subscriptionStore';
import ProfileMenu from '../../src/components/features/profile/ProfileMenu';
import EditProfileSheet from '../../src/components/features/profile/EditProfileSheet';
import SubscriptionOptionsSheet from '../../src/components/features/profile/SubscriptionOptionsSheet';
import ChatService from '../../src/services/ChatService';
import { HeaderAction, HeaderActionButton } from '../../src/components/layout/header/UniversalHeader';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
 

type RootParamList = {
  Main: undefined;
  AuthorProfile: { handle: string };
};

interface ProfileScreenProps {
  onLogout: (clearAllAccounts?: boolean) => Promise<void>;
}

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { handle: providedHandle, did: providedDid } = useLocalSearchParams<{ handle?: string; did?: string }>();
  
  // User store hooks
  const { currentUser } = useCurrentUser();
  const { savedAccounts, switchAccount } = useAccountManagement();
  
  // Automatically sync ProfileCache with userStore
  useProfileCacheSync();
  
  // State for the current user's handle (loaded from userStore)
  const userHandle = currentUser?.handle || null;
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const [dynamicColors, setDynamicColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);
  // Use DID in route key to differentiate between own profile and author profiles
  const profileRouteKey = useMemo(() => {
    if (providedHandle || providedDid) {
      // Author profile: include the identifier to make route key unique
      return `profile:${providedDid || providedHandle}`;
    }
    // Own profile tab: use default key
    return 'profile:self';
  }, [providedHandle, providedDid]);

  useVisibilityRouteTracker(profileRouteKey, 'profile');
  const isRouteFocused = useVisibilityRouteIsActive(profileRouteKey);

  const invalidateProfile = useProfileInvalidation();
  const queryClient = useQueryClient();

  // Prefer DID when provided; otherwise fall back
  const targetDid = providedDid || (providedHandle ? null : currentUser?.did || null);
  const targetHandle = providedHandle || userHandle;
  
  // Determine if we're viewing our own profile
  const isViewingOwnProfile = !providedHandle && !providedDid;

  // Fetch by DID if available, otherwise by handle
  const didQuery = useProfileByDid(targetDid);
  const handleQuery = useProfile(targetDid ? null : targetHandle);

  // Use existing ProfileCache functionality with immediate fallback for own profile
  const cachedProfile = didQuery.data || handleQuery.data || 
    (isViewingOwnProfile && currentUser ? {
      did: currentUser.did,
      handle: currentUser.handle,
      displayName: currentUser.displayName,
      avatar: currentUser.avatar,
      description: '',
      isFollowing: false,
      isFollowedBy: false,
      lastUpdated: Date.now(),
    } : null);
  
  const refetchProfile = didQuery.refetch || handleQuery.refetch;
  const isProfileLoading = (didQuery.isLoading || handleQuery.isLoading) && !cachedProfile;
  const isProfileFetchError = (didQuery.isError || handleQuery.isError);
  
  // Colors keyed by handle; if navigating by DID, use fetched handle
  const colorsHandle = targetDid ? (cachedProfile?.handle || null) : targetHandle;
  const { colors: profileColors } = useProfileColors(colorsHandle);

  // Force shimmer state for testing
  const forceShimmer = false; // Force loading state
  
  const isProfileLoadingForced = forceShimmer || 
    (isProfileLoading && !cachedProfile) || 
    (!targetDid && !targetHandle && !providedHandle);

  // Tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'reposts' | 'likes'>('profile');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Ensure profile data is immediately available from cache
  const profileData = cachedProfile || (colorsHandle ? ProfileCache.getProfileFromCacheSync(colorsHandle) : null);
  const { flags } = useProfileFlags(profileData?.did, profileData?.handle);
  const isBlocked = !!flags?.isBlocked;
  
  // Memoized query options for profile feed
  const queryOptions = useMemo(() => ({
    enabled: Boolean(isRouteFocused && profileData?.did),
  }), [isRouteFocused, profileData?.did]);

  const profileVisibilityKey = useMemo(() => {
    const did = profileData?.did || providedDid || providedHandle || 'profile';
    return `profile:${did}:${activeTab}`;
  }, [profileData?.did, providedDid, providedHandle, activeTab]);

  // ProfileCache is now automatically synced via useProfileCacheSync hook
  // Colors are extracted during profile fetch in ProfileCache.ts - no need to do it here

  // Profile fetching is handled by React Query hooks

  // Handle refresh - refreshes both profile metadata and feed
  // FeedRenderer will handle feed refresh automatically when isRefreshing is true
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setProfileError(null);
    try {
      if (colorsHandle) {
        await invalidateProfile(colorsHandle);

        const userDid = profileData?.did;
        if (userDid) {
          // Invalidate feed queries - FeedRenderer's useEffect will refetch when isRefreshing is true
          queryClient.invalidateQueries({ queryKey: ['feed', 'profile', userDid] });
          queryClient.invalidateQueries({ queryKey: ['feed', 'reposts', userDid] });
          queryClient.invalidateQueries({ queryKey: ['feed', 'likes', userDid] });
        }

        await refetchProfile();
      }
    } catch (error) {
      setProfileError("Failed to refresh profile.");
    } finally {
      // Reset refreshing state after a delay to show the refresh animation
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    }
  }, [colorsHandle, invalidateProfile, refetchProfile, queryClient, profileData]);

  const handleLogout = async (clearAllAccounts: boolean = false) => {
    try {
      setRefreshing(true);

      // Clear ProfileCache and call onLogout
      ProfileCache.clearCache();
      await onLogout(clearAllAccounts);
    } catch (error) {
    } finally {
      setRefreshing(false);
    }
  };

  const handleAccountSwitch = async (account: any) => {
    try {
      await refetchProfile();
    } catch (error) {
    }
  };

  const isOwnProfileView = useMemo(() => {
    if (isViewingOwnProfile) return true;
    
    // Simple: check if the profile being viewed belongs to the current user
    const currentDid = ProfileCache.getCurrentUserDid();
    return currentDid && profileData?.did && currentDid === profileData.did;
  }, [isViewingOwnProfile, profileData?.did]);


  const tabOptions: TabOption[] = useMemo(() => [
    { id: 'profile', label: 'videos' },
    { id: 'reposts', label: 'reposts' },
    ...(isOwnProfileView ? [{ id: 'likes', label: 'likes' }] : []),
  ], [isOwnProfileView]);

  const showErrorScreen = useMemo(() => 
    (isProfileFetchError || profileError) && !refreshing,
    [isProfileFetchError, profileError, refreshing]
  );

  const renderErrorScreen = useMemo(() => {
    return (
    <View style={[styles.errorContainer, { backgroundColor: profileColors.backgroundColor || '#000' }]}> 
      <Icon name="user-x" size={48} color={profileColors.textColor || '#fff'} style={styles.errorIcon} />
      <Text style={[styles.errorText, { color: profileColors.textColor || '#fff' }]}>Profile Not Found</Text>
      <Text style={styles.errorSubtext}>
        {providedHandle ?
          `We couldn't find a profile for @${providedHandle}` :
          profileError || "We couldn't retrieve your profile information"}
      </Text>
      <TouchableOpacity
        style={[styles.errorButton, { borderColor: profileColors.textColor + '44' }]}
        activeOpacity={0.7}
        onPress={onRefresh}
      >
        <Text style={[styles.errorButtonText, { color: profileColors.textColor || '#fff' }]}>Try Again</Text>
      </TouchableOpacity>
      {providedHandle && (
        <TouchableOpacity
          style={[styles.errorButton, styles.secondaryButton, { borderColor: profileColors.textColor + '44' }]}
          activeOpacity={0.7}
          onPress={() => router.back()}
        >
          <Text style={[styles.errorButtonText, { color: profileColors.textColor || '#fff' }]}>Go Back</Text>
        </TouchableOpacity>
      )}
    </View>
    );
  }, [
    profileColors.backgroundColor,
    profileColors.textColor,
    providedHandle,
    profileError,
    onRefresh,
    router,
  ]);

  const isLoading = isProfileLoading && !cachedProfile;

  // Overlay action state (moved from ProfileHeader)
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showSubscriptionSheet, setShowSubscriptionSheet] = useState(false);
  const [canMessage, setCanMessage] = useState<boolean | null>(null);
  const [extractedDefaultColors, setExtractedDefaultColors] = useState<{
    backgroundColor: string;
    textColor: string;
  } | null>(null);

  const followMutation = useFollowMutation();
  const { isSubscribed } = useUserSubscription(profileData?.did);

  // Message availability
  useEffect(() => {
    const checkAvailability = async () => {
      if (!profileData?.did || isOwnProfileView) {
        setCanMessage(null);
        return;
      }
      try {
        const available = await ChatService.getConversationAvailability(profileData.did);
        setCanMessage(available);
      } catch {
        setCanMessage(false);
      }
    };
    checkAvailability();
  }, [profileData?.did, isOwnProfileView]);

  const handleMessagePress = useCallback(async () => {
    if (!profileData?.did) return;

    try {
      const conversation = await ChatService.createConversation({
        recipientDid: profileData.did,
      });
      router.push(`/chat/${conversation.id}`);
    } catch {
      router.push('/chat');
    }
  }, [profileData?.did, router]);

  // Default colors for edit sheet - always reflect current profile color state
  useEffect(() => {
    if (profileColors?.backgroundColor && profileColors?.textColor) {
      setExtractedDefaultColors({
        backgroundColor: profileColors.backgroundColor,
        textColor: profileColors.textColor,
      });
    } else {
      setExtractedDefaultColors({
        backgroundColor: '#000000',
        textColor: '#CFD6E8',
      });
    }
  }, [profileColors.backgroundColor, profileColors.textColor]);

  // Follow / unblock
  const handleFollowUnfollow = useCallback(async () => {
    if (!profileData?.did || !profileData?.handle) return;

    try {
      if (isBlocked) {
        await AtprotoService.unblockUser(profileData.did);
        queryClient.invalidateQueries({ queryKey: createQueryKeys.blocks.status(profileData.did) });
        return;
      }
      const isCurrentlyFollowing = !!profileData.isFollowing;
      followMutation.mutate({
        handle: profileData.handle,
        isFollowing: !isCurrentlyFollowing,
      });
    } catch {
      // no-op
    }
  }, [profileData, isBlocked, followMutation, queryClient]);

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

  const showBackButton = !!(providedHandle || providedDid);

  // Shared scroll progress for header animation (0 = top, 1 = fully faded/dimmed)
  const headerScrollProgress = useSharedValue(0);

  const handleVerticalScroll = useCallback(
    (scrollY: number) => {
      // Map first 250px of scroll into 0 -> 1 progress (more gradual)
      const clamped = Math.max(0, Math.min(1, scrollY / 250));
      headerScrollProgress.value = clamped;
    },
    [headerScrollProgress],
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress.value;
    // More gradual fade: keep visible until 50% scroll, then fade to 0 over remaining 50%
    const opacity = interpolate(progress, [0, 0.5, 1], [1, 1, 0], Extrapolate.CLAMP);
    return { opacity };
  }, [headerScrollProgress]);

  // Build header actions exactly as original ProfileHeader customActions
  const headerActions: HeaderAction[] = useMemo(() => {
    if (!profileData) return [];

    // Own profile: single "Edit profile" button
    if (isOwnProfileView) {
      return [
        {
          id: 'edit',
          label: 'Edit profile',
          onPress: () => setShowEditSheet(true),
        },
      ];
    }

    const isFollowing = !!profileData.isFollowing;
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
          color={(dynamicColors ? dynamicColors.backgroundColor : profileColors.backgroundColor) || Colors.black} 
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
            color={isSubscribed
              ? (dynamicColors ? dynamicColors.backgroundColor : profileColors.backgroundColor) || Colors.black
              : (dynamicColors ? dynamicColors.textColor : profileColors.textColor) || Colors.white} 
          />
        ),
        onPress: () => setShowSubscriptionSheet(true),
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
    dynamicColors,
    profileColors.backgroundColor,
    profileColors.textColor,
  ]);

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: profileColors.backgroundColor,
      }
    ]}>
      {/* Overlay actions row (back, follow, bell, edit) */}
      <View style={[styles.overlayRow, { top: overlayTop }]}>
        {showBackButton ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.overlayBackButton}
            activeOpacity={0.7}
          >
            <BackArrowIcon
              size={30}
              color={Colors.white}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.overlayBackSpacer} />
        )}

        <Animated.View style={[styles.overlayRightSection, overlayAnimatedStyle]}>
          {/* Menu button - same icon and sizing as UniversalHeader */}
          <TouchableOpacity
            onPress={handleMenuPress}
            style={styles.overlayMenuButton}
            activeOpacity={0.7}
          >
            <MoreFillIcon 
              size={24} 
              color={(dynamicColors ? dynamicColors.textColor : profileColors.textColor) || Colors.white} 
            />
          </TouchableOpacity>

          {/* Header actions rendered with the same ActionButton component as UniversalHeader */}
          {headerActions.length > 0 && (
            <View style={styles.overlayActionsContainer}>
              {headerActions.map((action) => (
                <HeaderActionButton
                  key={action.id}
                  action={action}
                  textColor={(dynamicColors ? dynamicColors.textColor : profileColors.textColor) || Colors.white}
                  backgroundColor={(dynamicColors ? dynamicColors.backgroundColor : profileColors.backgroundColor) || Colors.black}
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
              ref={(r) => { tabRefs.profile = r; }}
              feedOption={
                activeTab === 'profile' ? 'profile' :
                activeTab === 'reposts' ? 'reposts' : 'likes'
              }
              userDid={profileData?.did}
              queryOptions={queryOptions}
              headerComponent={(
                <View style={styles.headerContainer} pointerEvents="box-none">
                  <ProfileHeader
                    handle={colorsHandle || undefined}
                    showBackButton={false}
                    isOwnProfile={isOwnProfileView}
                    onLogout={handleLogout}
                    onSwitchAccount={presentAccountSwitcher}
                    forceLoading={isProfileLoadingForced}
                    applySafeArea={true}
                    onColorsChange={setDynamicColors}
                    headerScrollProgress={headerScrollProgress}
                    contentFadeDisabled={viewMode === 'grid'}
                    dimOverlayDisabled={viewMode === 'grid'}
                  >
                    <TabNavigation
                      key={`tab-nav-${dynamicColors?.textColor || profileColors.textColor}`}
                      tabs={tabOptions}
                      activeTab={activeTab}
                      onTabPress={(tabId) => setActiveTab(tabId as any)}
                      textColor={dynamicColors ? dynamicColors.textColor : profileColors.textColor}
                      backgroundColor="transparent"
                      viewMode={viewMode}
                      onViewModeChange={(mode: 'list' | 'grid') => setViewMode(mode)}
                      showViewToggle={true}
                    />
                  </ProfileHeader>
                </View>
              )}
              backgroundColor={dynamicColors ? dynamicColors.backgroundColor : profileColors.backgroundColor}
              secondaryColor={dynamicColors ? dynamicColors.textColor : profileColors.textColor}
              isProfileLoading={isProfileLoading && !profileData}
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
      <EditProfileSheet
        visible={showEditSheet}
        onDismiss={() => setShowEditSheet(false)}
        profileData={profileData}
        defaultColors={extractedDefaultColors}
      />

      <ProfileMenu
        visible={showProfileMenu}
        onDismiss={() => setShowProfileMenu(false)}
        handle={colorsHandle || ''}
        isOwnProfile={isOwnProfileView}
        onLogout={handleLogoutFromMenu}
        onSwitchAccount={presentAccountSwitcher}
        canMessage={canMessage}
        onMessagePress={handleMessagePress}
      />

      {profileData?.did && (
        <SubscriptionOptionsSheet
          visible={showSubscriptionSheet}
          onDismiss={() => setShowSubscriptionSheet(false)}
          did={profileData.did}
        />
      )}
    </View>
  );
});

export default ProfileScreen;

// Optimized StyleSheet creation outside component
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    minHeight: '100%', 
    overflow: 'hidden'
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
    opacity: 0.8
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
});

