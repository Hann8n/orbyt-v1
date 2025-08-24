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
import { SavedAccount } from '../../../stores/userStore';
import ProfileCache, { useProfile, CachedProfile } from '../../../services/cache/ProfileCache';
import { Colors, Avatar } from '../../ui/UI';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import UI from '../../ui/UI';
import { useQueryClient } from '@tanstack/react-query';
import VerticalListSheet from '../../ui/VerticalListSheet';
import { useAccountManagement, useAuth } from '../../../stores/userStore';

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

  // User store hooks
  const { 
    savedAccounts, 
    switchAccount, 
    removeAccount 
  } = useAccountManagement();
  
  const { 
    isAuthenticating, 
    isSwitchingAccount,
    signIn 
  } = useAuth();

  // Get current active account for custom colors (using DID)
  const activeAccount = accounts.find(acc => acc.isActive);
  const { data: activeProfile } = useProfile(activeAccount?.handle || null);
  
  // Get custom colors for active account
  const customColors = activeProfile?.profileColors;

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      // Use savedAccounts from the user store
      const savedAccountsData = savedAccounts;
      
      // Enhance accounts with cached profile data
      const accountsWithProfiles = await Promise.all(
        savedAccountsData.map(async (account) => {
          try {
            // Try to get cached profile data for each account (using DID)
            // First try to get from cache, then refresh if needed
            let cachedProfile = await ProfileCache.getProfileByDid(account.did);
            
            // If no cached data or cache is stale, try to refresh
            if (!cachedProfile) {
              try {
                cachedProfile = await ProfileCache.refreshProfileByDid(account.did);
              } catch (error) {
                console.warn(`Failed to refresh profile for ${account.did}:`, error);
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
  }, [savedAccounts]);

  // Load accounts when modal opens or savedAccounts change
  useEffect(() => {
    if (visible) {
      loadAccounts();
      setEditMode(false); // Reset edit mode when modal opens
    }
  }, [visible, loadAccounts]);

  const handleSwitchAccount = useCallback(async (account: AccountWithProfile) => {
    if (account.isActive) return;

    setSwitchingAccount(account.did);
    try {
      // Use the user store to switch accounts with completion callback
      await switchAccount(account.did, () => {
        // This callback is called when all data is loaded
        // Call the parent callback
        onAccountSwitch(account);
        
        // Close the modal
        onDismiss();
      });
      
    } catch (error) {
      console.error('Error switching account:', error);
      
      // Check if it's an OAuth session expiration error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('expired') || errorMessage.includes('re-authenticate')) {
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
              onPress: async () => {
                try {
                  await signIn(account.handle);
                  onAccountSwitch(account);
                  onDismiss();
                } catch (signInError) {
                  console.error('Error signing in again:', signInError);
                  Alert.alert('Error', 'Failed to sign in again. Please try again.');
                }
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to switch account. Please try again.');
      }
    } finally {
      setSwitchingAccount(null);
    }
  }, [onAccountSwitch, onDismiss, switchAccount, signIn]);

  const handleRemoveAccount = useCallback(async (account: AccountWithProfile) => {
    Alert.alert(
      'Remove Account',
      `Are you sure you want to remove ${account.displayName || account.handle}?`,
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
              await removeAccount(account.did);
              // Reload accounts after removal
              await loadAccounts();
            } catch (error) {
              console.error('Error removing account:', error);
              Alert.alert('Error', 'Failed to remove account. Please try again.');
            }
          },
        },
      ]
    );
  }, [removeAccount, loadAccounts]);

  const handleAddAccount = useCallback(async () => {
    setIsAddingAccount(true);
    try {

      await signIn('https://bsky.social');
      
      // Reload accounts to show the new one
      await loadAccounts();
      

    } catch (error) {
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
  }, [signIn, loadAccounts]);

  // Prepare list data including the add account option and edit button
  const listData = useMemo(() => {
    const accountItems = accounts.map(account => ({
      type: 'account' as const,
      data: account,
    }));

    // Add the "Add Account" option only when in edit mode and onAddAccount is provided
    if (editMode && onAddAccount) {
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
          disabled={isAuthenticating}
        >
          <View style={styles.buttonContent}>
            {isAuthenticating ? (
              <ActivityIndicator color={Colors.black} size="small" style={{ marginRight: 8 }} />
            ) : (
              <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.addAccountButtonText}>
              {isAuthenticating ? 'Signing in...' : 'Add Account'}
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
    const isSwitching = isSwitchingAccount && switchingAccount === account.did;
    
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
  }, [switchingAccount, editMode, customColors, handleSwitchAccount, handleRemoveAccount, handleAddAccount, isAuthenticating]);

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