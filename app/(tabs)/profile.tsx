import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import AtprotoService from '../../src/services/api/AtprotoService';
// Use plain FlashList via FeedRenderer; no adapter/converter
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileCache, { 
  useProfile, 
  useProfileByDid,
  useProfileColors,
  useProfileInvalidation,
  profileKeys
} from '../../src/services/cache/ProfileCache';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon from '../../src/components/ui/Icon';
import { useQueryClient } from '@tanstack/react-query';
import { ProfileHeader, TabNavigation, TabOption } from '../../src/components/layout/header';
import { useCurrentUser, useAccountManagement, useUserStore, useProfileCacheSync } from '../../src/stores/userStore';
import { Colors } from '../../src/components/ui/UI';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
 

type RootParamList = {
  Main: undefined;
  AuthorProfile: { handle: string };
};

interface ProfileScreenProps {
  onLogout: (clearAllAccounts?: boolean) => Promise<void>;
}

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const router = useRouter();
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
  useVisibilityRouteTracker('profile', 'profile');
  const isRouteFocused = useVisibilityRouteIsActive('profile');

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
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'horizontal'>('list');

  // Ensure profile data is immediately available from cache
  const profileData = cachedProfile || (colorsHandle ? ProfileCache.getProfileFromCacheSync(colorsHandle) : null);
  
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setProfileError(null);
    try {
      if (colorsHandle) {
        await invalidateProfile(colorsHandle);

        const userDid = profileData?.did;
        if (userDid) {
          queryClient.invalidateQueries({ queryKey: ['feed', 'profile', userDid] });
          queryClient.invalidateQueries({ queryKey: ['feed', 'reposts', userDid] });
          queryClient.invalidateQueries({ queryKey: ['feed', 'likes', userDid] });
        }

        await refetchProfile();

        if (!providedHandle && profileData) {
          // Profile data managed by userStore and ProfileCache
        }
      } else if (!providedHandle && !providedDid) {
        // handled by hooks
      }
    } catch (error) {
      setProfileError("Failed to refresh profile.");
    } finally {
      setRefreshing(false);

    }
  }, [colorsHandle, invalidateProfile, refetchProfile, queryClient, profileData, providedHandle, providedDid]);

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

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: profileColors.backgroundColor,
      }
    ]}>
      {showErrorScreen ? (
        renderErrorScreen
      ) : (
            <FeedRenderer
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
                    showBackButton={!!(providedHandle || providedDid)}
                    isOwnProfile={isOwnProfileView}
                    onLogout={handleLogout}
                    onSwitchAccount={presentAccountSwitcher}
                    forceLoading={isProfileLoadingForced}
                    applySafeArea={true}
                    onColorsChange={setDynamicColors}
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
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={dynamicColors ? dynamicColors.textColor : profileColors.textColor}
                />
              }
              backgroundColor={Colors.black}
              secondaryColor={dynamicColors ? dynamicColors.textColor : profileColors.textColor}
              isProfileLoading={isProfileLoading && !profileData}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              isVisible={isRouteFocused}
              visibilityKey={profileVisibilityKey}
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
    minHeight: 280,
    backgroundColor: 'transparent',
    marginBottom: 0,
    paddingBottom: 0,
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
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: Colors.mediumGray,
  },
});

