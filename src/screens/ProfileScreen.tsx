import React, { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import AtprotoService from '../services/api/AtprotoService';
import { Tabs } from 'react-native-collapsible-tab-view';
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
import AccountManager, { SavedAccount } from '../services/storage/AccountManager';
 
import { Colors } from '../components/ui/UI';
 

type RootParamList = {
  Main: undefined;
  AuthorProfile: { handle: string };
};

// Cache keys for current user handle/DID persistence
const CURRENT_USER_HANDLE_KEY = 'currentUserHandle';
const CURRENT_USER_DID_KEY = 'currentUserDid';

interface ProfileScreenProps {
  onLogout: (clearAllAccounts?: boolean) => Promise<void>;
}

const ProfileScreen: React.FC<ProfileScreenProps> = memo(({ onLogout }) => {
  const route = useRoute<any>();
  const navigation = useNavigation<NavigationProp<RootParamList>>();
  const providedHandle = route.params?.handle || null;
  
  
  // Removed header visibility hook and janky fade logic; header remains static and always visible

  // State for the current user's handle (loaded from storage or fetched)
  const [userHandle, setUserHandle] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState<boolean>(false);

  const invalidateProfile = useProfileInvalidation();
  const queryClient = useQueryClient();

  // Determine the handle to use for fetching profile data
  const targetHandle = providedHandle || userHandle;

  // Use React Query hooks for profile data and colors
  const {
    data: cachedProfile,
    refetch: refetchProfile,
    isLoading: isProfileLoading,
    isError: isProfileFetchError,
  } = useProfile(targetHandle);

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

  // Header visibility logic removed

  // Ensure profile data is immediately available from cache
  const profileData = cachedProfile || (targetHandle ? ProfileCache.getProfileFromCacheSync(targetHandle) : null);

  // Memoized query options for profile feed
  const queryOptions = useMemo(() => ({ 
    enabled: !!profileData?.did
  }), [profileData?.did]);

  // Load current user handle from AsyncStorage on mount
  useEffect(() => {
    const loadCurrentUserHandle = async () => {
      if (!providedHandle && !userHandle) {
        try {
          const storedDid = await AsyncStorage.getItem(CURRENT_USER_DID_KEY);
          const storedHandle = await AsyncStorage.getItem(CURRENT_USER_HANDLE_KEY);
          
          if (storedDid) {
            // console.log("Loaded user DID from storage:", storedDid);
            ProfileCache.setCurrentUserDid(storedDid);
            
            // If we have a stored handle, use it for display, but don't rely on it for authentication
            if (storedHandle) {
              setUserHandle(storedHandle);
            } else {
              // If no stored handle, fetch current user to get the latest handle
              fetchCurrentUserProfile();
            }
          } else {
            // console.log("No user DID in storage, fetching current user...");
            fetchCurrentUserProfile();
          }
        } catch (error) {
          console.error('Error loading current user data:', error);
          fetchCurrentUserProfile();
        }
      }
    };
    loadCurrentUserHandle();
  }, [providedHandle, userHandle]);

  // Save profile to AsyncStorage for persistence between sessions
  const saveCurrentUserProfile = useCallback(async (profileData: any) => {
    if (!profileData || !profileData.did) return;

    try {
      // console.log("Saving current user DID to storage:", profileData.did);
      // Always save DID as primary identifier
      await AsyncStorage.setItem(CURRENT_USER_DID_KEY, profileData.did);
      
      // Save handle for display purposes, but don't rely on it for authentication
      if (profileData.handle) {
        await AsyncStorage.setItem(CURRENT_USER_HANDLE_KEY, profileData.handle);
      }
    } catch (error) {
      console.error('Error saving current user profile info:', error);
    }
  }, []);

  // Fetch current user profile data
  const fetchCurrentUserProfile = useCallback(async () => {
    try {
      const user = await AtprotoService.getCurrentUser();
      if (user) {
        setUserHandle(user.handle);
        ProfileCache.setCurrentUserDid(user.did);
        saveCurrentUserProfile(user);

        if (user.avatar && user.handle) {
          extractAndSaveColors(user.handle, user.avatar);
        }
        // Don't invalidate queries here - let React Query handle caching
        // Only refetch if we don't have cached data
        if (!profileData) {
          refetchProfile();
        }
      } else {
         setProfileError("Could not load your profile.");
      }
    } catch (error) {
      console.error('Error fetching current user profile:', error);
      setProfileError("Error loading your profile.");
    }
  }, [saveCurrentUserProfile, profileData, refetchProfile]);

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
        fetchCurrentUserProfile();
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
           saveCurrentUserProfile(profileData);
           if (profileData.avatar && !profileData.profileColors) {
             extractAndSaveColors(profileData.handle, profileData.avatar);
           }
        }
      } else if (!providedHandle) {
        console.log("No target handle during refresh, fetching current user...");
        await fetchCurrentUserProfile();
      }
    } catch (error) {
      console.error('Error during refresh:', error);
      setProfileError("Failed to refresh profile.");
    } finally {
      setRefreshing(false);
      console.log("Refresh finished.");
    }
  }, [targetHandle, invalidateProfile, refetchProfile, queryClient, profileData, providedHandle, fetchCurrentUserProfile, saveCurrentUserProfile]);

  const handleLogout = async (clearAllAccounts: boolean = false) => {
    try {
      setRefreshing(true);

              // console.log("Clearing current user handle/DID from storage...");
      await AsyncStorage.removeItem(CURRENT_USER_HANDLE_KEY);
      await AsyncStorage.removeItem(CURRENT_USER_DID_KEY);

      ProfileCache.setCurrentUserDid('');
      ProfileCache.clearCache();

      await onLogout(clearAllAccounts);

    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAccountSwitch = async (account: SavedAccount) => {
    try {
      // The AccountManager.switchAccount already handles the authentication
      // Data clearing is now handled in AccountSwitcher component
      
      // Update the current user handle for display
      setUserHandle(account.handle);
      
      // Save the new user info to storage - prioritize DID over handle
      await AsyncStorage.setItem(CURRENT_USER_DID_KEY, account.did);
      await AsyncStorage.setItem(CURRENT_USER_HANDLE_KEY, account.handle);
      
      // Set the current user DID in ProfileCache
      ProfileCache.setCurrentUserDid(account.did);
      
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
    if (!providedHandle) return true;
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
  }, [providedHandle, targetHandle, userHandle, profileData?.did]);

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
        <Tabs.Container renderTabBar={() => null}>
          <Tabs.Tab name="feed">
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
              backgroundColor={profileColors.backgroundColor}
              secondaryColor={profileColors.textColor}
              isProfileLoading={isProfileLoading && !profileData}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              ListComponent={Tabs.FlashList}
              isVisible={true}
            />
          </Tabs.Tab>
        </Tabs.Container>
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
    borderRadius: 12,
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