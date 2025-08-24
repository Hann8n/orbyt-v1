import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../ui/Icon';
import { PlusIcon } from '../../ui/Icon';
import AuthorItem from '../../ui/AuthorItem';
import AccountManager, { SavedAccount } from '../../../services/storage/AccountManager';
import ProfileCache, { useProfile, CachedProfile } from '../../../services/cache/ProfileCache';
import ChannelCache from '../../../services/cache/ChannelCache';

import { ModerationService } from '../../../services/ModerationService';
import { feedService } from '../../../services/FeedService';
import WatchHistory from '../../../services/WatchHistory';
import ChannelSubscriptionManager from '../../../services/storage/ChannelSubscriptionManager';
import { AtprotoService } from '../../../services/api/AtprotoService';
import { AtProtoOAuthService } from '../../../services/auth';
import { useOAuth } from '../../../services/auth/useOAuth';
import { Colors, Avatar } from '../../ui/UI';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import UI from '../../ui/UI';
import { useQueryClient } from '@tanstack/react-query';
import VerticalListSheet from '../../ui/VerticalListSheet';

interface AccountSwitcherProps {
  visible: boolean;
  onDismiss: () => void;
  onAccountSwitch: (account: SavedAccount) => void;
  onAddAccount?: () => void;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

// Extended interface to include cached profile data
interface AccountWithProfile extends SavedAccount {
  cachedProfile?: CachedProfile;
}

const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  visible,
  onDismiss,
  onAccountSwitch,
  onAddAccount,
  onLogout,
}) => {
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  // OAuth hook for direct authentication
  const { signIn: oauthSignIn, isSigningIn: isOAuthSigningIn, error: oauthError } = useOAuth();

  // Get current active account for custom colors
  const activeAccount = accounts.find(acc => acc.isActive);
  const { data: activeProfile } = useProfile(activeAccount?.handle || null);
  
  // Get custom colors for active account
  const customColors = activeProfile?.profileColors;

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const savedAccounts = await AccountManager.getSavedAccounts();
      
      // Enhance accounts with cached profile data
      const accountsWithProfiles = await Promise.all(
        savedAccounts.map(async (account) => {
          try {
            // Try to get cached profile data for each account
            // First try to get from cache, then refresh if needed
            let cachedProfile = await ProfileCache.getProfile(account.handle);
            
            // If no cached data or cache is stale, try to refresh
            if (!cachedProfile) {
              try {
                cachedProfile = await ProfileCache.refreshProfile(account.handle);
              } catch (error) {
                console.warn(`Failed to refresh profile for ${account.handle}:`, error);
              }
            }
            
            return {
              ...account,
              cachedProfile,
            };
          } catch (error) {
            console.warn(`Failed to load profile for ${account.handle}:`, error);
            return account;
          }
        })
      );
      
      setAccounts(accountsWithProfiles);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadAccounts();
      setEditMode(false); // Reset edit mode when modal opens
    }
  }, [visible, loadAccounts]);

  const handleSwitchAccount = useCallback(async (account: AccountWithProfile) => {
    if (account.isActive) return;

    setSwitchingAccount(account.id);
    try {
      // Clear all caches and data
      await Promise.all([
        ProfileCache.clearCache(),
        ChannelCache.clearCache(),
        feedService.clearCurrentFeed(),
        WatchHistory.clearWatchHistory(),
        ChannelSubscriptionManager.clearAllSubscriptions(),
        ModerationService.clearModerationCache(),
      ]);

      // Clear all queries
      queryClient.clear();

      // All accounts are now OAuth-only
      try {
        await AccountManager.switchAccount(account.id);
      } catch (oauthError) {
        // OAuth session might be expired, ask user to re-authenticate
        Alert.alert(
          'Session Expired',
          'Your OAuth session has expired. Please sign in again.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Sign In Again',
              onPress: () => {
                onDismiss();
                if (onAddAccount) {
                  onAddAccount(); // Redirect to login with OAuth
                }
              },
            },
          ]
        );
        return;
      }
      
      // Call the parent callback
      onAccountSwitch(account);
      
      // Close the modal
      onDismiss();
    } catch (error) {
      console.error('Error switching account:', error);
      Alert.alert('Error', 'Failed to switch account. Please try again.');
    } finally {
      setSwitchingAccount(null);
    }
  }, [onAccountSwitch, onDismiss, onAddAccount, queryClient]);

  const handleRemoveAccount = useCallback(async (account: AccountWithProfile) => {
    if (account.isActive) {
      Alert.alert('Cannot remove active account', 'Please switch to a different account first.');
      return;
    }

    Alert.alert(
      'Remove Account',
      `Are you sure you want to remove ${account.handle}? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await AccountManager.removeAccount(account.id);
              await loadAccounts(); // Reload the accounts list
            } catch (error) {
              console.error('Error removing account:', error);
              Alert.alert('Error', 'Failed to remove account. Please try again.');
            }
          },
        },
      ]
    );
  }, []);

  const handleAddAccount = useCallback(async () => {
    setIsAddingAccount(true);
    try {
      console.log('[AccountSwitcher] Starting OAuth flow for new account');
      await oauthSignIn('https://bsky.social');
      
      // Get the OAuth session and user profile
      const oauthService = AtProtoOAuthService.getInstance();
      const session = await oauthService.getCurrentSession();
      
      if (session) {
        // Get user profile information
        const userProfile = await AtprotoService.getCurrentUser();
        
        // Save the new OAuth account
        await AccountManager.saveOAuthAccount(
          session,
          userProfile?.displayName,
          userProfile?.avatar,
          userProfile?.handle
        );
        
        // Cache the user's profile data
        if (userProfile?.handle) {
          await ProfileCache.cacheProfiles([userProfile]);
          ProfileCache.setCurrentUserDid(userProfile.did);
        }
        
        // Reload accounts to show the new one
        await loadAccounts();
        
        console.log('[AccountSwitcher] OAuth account added successfully');
      }
    } catch (error) {
      console.error('[AccountSwitcher] OAuth sign-in failed:', error);
      
      // Check if this is a user cancellation vs actual error
      const errorMessage = error instanceof Error ? error.message : 'OAuth sign-in failed';
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('Authentication was cancelled') ||
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        Alert.alert(
          'OAuth Sign-in Failed',
          'Failed to sign in with Bluesky. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsAddingAccount(false);
    }
  }, [oauthSignIn, loadAccounts]);

  // Prepare list data including the add account option and edit button
  const listData = useMemo(() => {
    const accountItems = accounts.map(account => ({
      type: 'account' as const,
      data: account,
    }));

    // Add the "Add Account" option if onAddAccount is provided
    if (onAddAccount) {
      accountItems.push({
        type: 'add' as const,
        data: null,
      } as any);
    }

    // Add the edit/done button
    accountItems.push({
      type: 'edit' as const,
      data: null,
    } as any);

    return accountItems;
  }, [accounts, onAddAccount, editMode]);

  const renderAccountItem = useCallback(({ item }: { item: typeof listData[0] }) => {
    if ((item as any).type === 'add') {
      return (
        <TouchableOpacity
          style={styles.addAccountButton}
          onPress={handleAddAccount}
          activeOpacity={0.8}
          disabled={isAddingAccount || isOAuthSigningIn}
        >
          <View style={styles.buttonContent}>
            {isAddingAccount || isOAuthSigningIn ? (
              <ActivityIndicator color={Colors.black} size="small" style={{ marginRight: 8 }} />
            ) : (
              <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.addAccountButtonText}>
              {isAddingAccount || isOAuthSigningIn ? 'Signing in...' : 'Sign in with Bluesky'}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    if ((item as any).type === 'edit') {
      return (
        <TouchableOpacity
          onPress={() => setEditMode(!editMode)}
          activeOpacity={0.8}
        >
          <Text style={styles.editButtonText}>
            {editMode ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      );
    }

    const account = item.data as AccountWithProfile;
    const isActive = account.isActive;
    const isSwitching = switchingAccount === account.id;
    
    const displayName = account.cachedProfile?.displayName || account.displayName || account.handle;
    const handle = account.cachedProfile?.handle || account.handle;
    
    return (
      <TouchableOpacity
        style={[
          styles.accountButton,
          isActive && styles.activeAccountButton,
        ]}
        onPress={() => !isActive && !editMode && handleSwitchAccount(account)}
        activeOpacity={0.8}
        disabled={isSwitching}
      >
        {isSwitching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.white} size="small" />
            <Text style={styles.loadingText}>
              Switching to <Text style={styles.loadingAccountName}>{displayName}</Text>
            </Text>
          </View>
        ) : (
          <View style={styles.accountButtonContent}>
            <View style={styles.avatarContainer}>
              <Avatar
                uri={account.cachedProfile?.avatar}
                type="profile"
                size={48}
              />
            </View>
            <View style={styles.accountInfoContainer}>
              <Text style={[
                styles.accountDisplayName,
                isActive && styles.activeAccountDisplayName
              ]}>
                {displayName}
              </Text>
              <Text style={styles.accountHandle}>
                @{handle}
              </Text>
            </View>
            {!editMode && (
              <View style={styles.accountArrow}>
                <Icon name="chevron-right" size={20} color={Colors.gray} />
              </View>
            )}
            {editMode && !isActive && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleRemoveAccount(account)}
                activeOpacity={0.7}
              >
                <Icon name="delete-2-fill" size={16} color={UI.Colors.STATUS.ERROR} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [switchingAccount, editMode, customColors, handleSwitchAccount, handleRemoveAccount, handleAddAccount, isAddingAccount, isOAuthSigningIn]);

  const keyExtractor = useCallback((item: typeof listData[0]) => {
    const type = (item as any).type;
    if (type === 'add') return 'add';
    if (type === 'edit') return 'edit';
    return item.data.id;
  }, []);

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={onDismiss}
      title="switch account"
      showCancelButton={false}
      snapPoints={['90%']}
    >
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.lightGray} />
        </View>
      ) : (
        <BottomSheetFlatList
          data={listData}
          renderItem={renderAccountItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  editButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
    marginTop: 8,
    marginBottom: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  loadingText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginLeft: 12,
  },
  loadingAccountName: {
    color: Colors.white,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  accountButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  activeAccountButton: {
    backgroundColor: Colors.darkGray,
  },
  addAccountButton: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    marginRight: 12,
  },
  addAccountIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfoContainer: {
    flex: 1,
    paddingLeft: 8,
  },
  accountDisplayName: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginBottom: 2,
  },
  activeAccountDisplayName: {
    color: Colors.white,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAccountButtonText: {
    color: Colors.black,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  accountHandle: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  accountArrow: {
    marginLeft: 8,
  },
  accountButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'left',
    fontFamily: 'Firma-SemiBold',
  },
  deleteButton: {
    padding: 8,
    backgroundColor: hexToRGBA(UI.Colors.STATUS.ERROR, 0.1),
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default AccountSwitcher; 