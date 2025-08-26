import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../utils/constants';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import AtprotoService from '../services/api/AtprotoService';
// Use plain FlashList via FeedRenderer; no adapter/converter
import FeedRenderer from '../components/features/feed/FeedRenderer';
import { extractColorsFromImage } from '../utils/formatting/colorUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileCache, { 
  useProfile, 
  useProfileColors,
  useProfileColorsMutation,
  useProfileInvalidation,
  profileKeys
} from '../services/cache/ProfileCache';
import { useRoute } from '@react-navigation/native';
import Icon from '../components/ui/Icon';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { ProfileHeader, TabNavigation, TabOption } from '../components/layout/header';
import AccountSwitcher from '../components/features/profile/AccountSwitcher';
import { useCurrentUser, useAccountManagement, useUserStore } from '../stores/userStore';
import { Colors } from '../components/ui/UI';
 

type RootParamList = {
  Main: undefined;
  AuthorProfile: { handle: string };
};

interface ProfileScreenProps {
  onLogout: (clearAllAccounts?: boolean) => Promise<void>;
}

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const route = useRoute<any>();
  const navigation = useNavigation<NavigationProp<RootParamList>>();
  const providedHandle = route.params?.handle || null;
  
  // User store hooks
  const { currentUser } = useCurrentUser();
  const { savedAccounts, switchAccount } = useAccountManagement();
  
  // State for the current user's handle (loaded from userStore)
  const userHandle = currentUser?.handle || null;
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState<boolean>(false);

  const invalidateProfile = useProfileInvalidation();
  const queryClient = useQueryClient();

  // Use DID as primary identifier for profile fetching
  // If a handle is provided, we need to resolve it to a DID
  // If no handle is provided, use the current user's DID
  const targetHandle = providedHandle || userHandle;
  const targetDid = providedHandle ? null : currentUser?.did || null;
  
  // Determine if we're viewing our own profile
  const isViewingOwnProfile = !providedHandle;



  // Use DID-based profile fetching (following ATProto best practices)
  // If viewing own profile, use DID-based fetching, otherwise use handle-based fetching
  const {
    data: cachedProfile,
    refetch: refetchProfile,
    isLoading: isProfileLoading,
    isError: isProfileFetchError,
  } = useProfile(targetHandle);
  
  // Use DID-based profile colors (following ATProto best practices)
  const { colors: profileColors } = useProfileColors(targetHandle);
  const colorsMutation = useProfileColorsMutation();

  // Force shimmer state for testing
  const forceShimmer = false; // Force loading state
  
  // Show loading when:
  // 1. Force shimmer is enabled, OR
  // 2. Profile is loading and no cached data, OR
  // 3. We don't have a target handle yet (initial loading state)
  const isProfileLoadingForced = forceShimmer || 
    (isProfileLoading && !cachedProfile) || 
    (!targetHandle && !providedHandle);

  // Tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'reposts' | 'likes'>('profile');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Ensure profile data is immediately available from cache
  // If viewing another profile (providedHandle), use that profile's data
  // If viewing own profile, use current user's data
  const profileData = cachedProfile || (targetHandle ? ProfileCache.getProfileFromCacheSync(targetHandle) : null);
  


  // Memoized query options for profile feed
  const queryOptions = useMemo(() => ({ 
    enabled: !!profileData?.did
  }), [profileData?.did]);

  // Set current user DID in ProfileCache when userStore changes
  useEffect(() => {
    if (currentUser?.handle) {
      ProfileCache.setCurrentUserHandle(currentUser.handle);
    }
  }, [currentUser?.did]);

  // Fallback: if no current user but we're authenticated, try to restore session
  useEffect(() => {
    const checkAndRestoreSession = async () => {
      const state = useUserStore.getState();
      if (state.isAuthenticated && !currentUser && !providedHandle) {
        try {
          const activeAccountDid = state.activeAccountDid;
          if (activeAccountDid) {
    
            await state.restoreSession(activeAccountDid);
          }
        } catch (error) {
          console.error('[ProfileScreen] Failed to restore session:', error);
        }
      }
    };
    
    checkAndRestoreSession();
  }, [currentUser, providedHandle]);

  // Extract and save colors when profile data is available
  useEffect(() => {
    if (profileData?.avatar && profileData?.handle) {
      extractAndSaveColors(profileData.handle, profileData.avatar);
    }
  }, [profileData?.avatar, profileData?.handle]);

  // Function to extract and save profile colors
  const extractAndSaveColors = async (handle: string, avatarUrl: string) => {
     try {
        const colors = await extractColorsFromImage(avatarUrl);
        colorsMutation.mutate({
          handle: handle,
          backgroundColor: colors.backgroundColor,
          foregroundColor: colors.foregroundColor
        });
     } catch (error) {
        console.error("Error extracting/saving colors:", error);
     }
  };

  // Effect to handle profile fetching logic
  useEffect(() => {
    if (targetHandle) {
      // Only extract colors if we have a cached profile without colors
      if (profileData && profileData.handle === targetHandle && !profileData.profileColors && profileData.avatar) {
        extractAndSaveColors(profileData.handle, profileData.avatar);
      }
    } else if (!providedHandle && !userHandle) {
      // Only fetch current user profile if we don't have a handle and no cached profile
      // This prevents unnecessary API calls when app comes back to foreground
      const shouldFetch = !profileData && !isProfileLoading;
      if (shouldFetch) {
        // Profile data will be fetched by the useProfile hook when targetHandle is available
        // No need to manually fetch here as userStore manages the current user state
      }
    }
  }, [targetHandle, profileData, providedHandle, userHandle, isProfileLoading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setProfileError(null);
    try {
      if (targetHandle) {
        await invalidateProfile(targetHandle);

        const userDid = profileData?.did;
        if (userDid) {
          queryClient.invalidateQueries({ queryKey: ['feed', 'profile', userDid] });
          queryClient.invalidateQueries({ queryKey: ['feed', 'reposts', userDid] });
          queryClient.invalidateQueries({ queryKey: ['feed', 'likes', userDid] });
        }

        await refetchProfile();

                  if (!providedHandle && profileData) {
            // Profile data is already managed by userStore and ProfileCache
            // No additional saving needed
          }
        } else if (!providedHandle) {
          // Profile data will be fetched by the useProfile hook when targetHandle is available
          // No need to manually fetch here
        }
    } catch (error) {
      console.error('Error during refresh:', error);
      setProfileError("Failed to refresh profile.");
    } finally {
      setRefreshing(false);

    }
  }, [targetHandle, invalidateProfile, refetchProfile, queryClient, profileData, providedHandle]);

  const handleLogout = async (clearAllAccounts: boolean = false) => {
    try {
      setRefreshing(true);

              // Clear ProfileCache and call onLogout
      ProfileCache.setCurrentUserHandle('');
      ProfileCache.clearCache();
      await onLogout(clearAllAccounts);
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAccountSwitch = async (account: any) => {
    try {
      // The AccountManager.switchAccount already handles the authentication
      // Data clearing is now handled in AccountSwitcher component
      
      // User data is now managed by userStore, no need to set local state
      
                      // Set the current user DID in ProfileCache
        ProfileCache.setCurrentUserHandle(account.handle);
      
      // Refresh the profile data after switching accounts
      await refetchProfile();
      
      // console.log(`Switched to account: ${account.handle}`);
    } catch (error) {
      console.error('Error handling account switch:', error);
    }
  };

  // Determine if the currently viewed profile is the active account
  const isOwnProfileView = useMemo(() => {
    // If we're in the tab (no providedHandle), it's own profile
    if (isViewingOwnProfile) return true;
    const normalizedTarget = (targetHandle || '').trim().toLowerCase();
    const normalizedSelfHandle = (userHandle || '').trim().toLowerCase();
    if (normalizedTarget && normalizedSelfHandle && normalizedTarget === normalizedSelfHandle) {
      return true;
    }
    const currentDid = ProfileCache.getCurrentUserDid?.();
    if (currentDid && profileData?.did) {
      return currentDid === profileData.did;
    }
    return false;
  }, [isViewingOwnProfile, targetHandle, userHandle, profileData?.did]);

  // Memoized tab options to prevent recreation
  const tabOptions: TabOption[] = useMemo(() => [
    { id: 'profile', label: 'videos' },
    { id: 'reposts', label: 'reposts' },
    ...(isOwnProfileView ? [{ id: 'likes', label: 'likes' }] : []),
  ], [isOwnProfileView]);




  // Memoized error screen state
  const showErrorScreen = useMemo(() => 
    (isProfileFetchError || profileError) && !refreshing,
    [isProfileFetchError, profileError, refreshing]
  );

  // Memoized error screen component
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
          onPress={() => navigation.goBack()}
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
    navigation,
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
                    handle={targetHandle}
                    showBackButton={!!providedHandle}
                    isOwnProfile={isOwnProfileView}
                    onLogout={handleLogout}
                    onSwitchAccount={() => setShowAccountSwitcher(true)}
                    forceLoading={isProfileLoadingForced}
                     applySafeArea={true}
                  >
                    <TabNavigation
                      tabs={tabOptions}
                      activeTab={activeTab}
                      onTabPress={(tabId) => setActiveTab(tabId as any)}
                      textColor={profileColors.textColor}
                      backgroundColor="transparent"
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      showViewToggle={true}
                    />
                  </ProfileHeader>
                </View>
              )}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={profileColors.textColor}
                />
              }
              backgroundColor={Colors.black}
              secondaryColor={profileColors.textColor}
              isProfileLoading={isProfileLoading && !profileData}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              isVisible={true}
            />
      
      )}

      {/* Account Switcher Modal */}
      <AccountSwitcher
        visible={showAccountSwitcher}
        onDismiss={() => setShowAccountSwitcher(false)}
        onAccountSwitch={handleAccountSwitch}
        onAddAccount={async () => {
          setShowAccountSwitcher(false);
          await handleLogout(false);
        }}
        onLogout={onLogout}
      />
    </View>
  );
});

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

export default ProfileScreen;