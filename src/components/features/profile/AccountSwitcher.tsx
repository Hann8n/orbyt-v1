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
import { Colors, hexToRGBA, Avatar } from '../../ui/UI';
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
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  // Get current active account for custom colors
  const activeAccount = accounts.find(acc => acc.isActive);
  const { data: activeProfile } = useProfile(activeAccount?.handle || null);
  
  // Get custom colors for active account
  const customColors = activeProfile?.profileColors;

  useEffect(() => {
    if (visible) {
      loadAccounts();
      setEditMode(false); // Reset edit mode when modal opens
    }
  }, [visible]);

  const loadAccounts = async () => {
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
  };

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

      // Switch to the new account
      await AccountManager.switchAccount(account.id);
      
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
  }, [onAccountSwitch, onDismiss, queryClient]);

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

  const handleAddAccount = useCallback(() => {
    onDismiss(); // Close the modal first
    if (onAddAccount) {
      onAddAccount(); // Open the add account flow
    }
  }, [onDismiss, onAddAccount]);

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
          style={styles.accountButton}
          onPress={handleAddAccount}
          activeOpacity={0.7}
        >
          <View style={styles.accountButtonContent}>
            <Text style={styles.accountButtonText}>Add Account</Text>
            <Icon name="user-plus" size={20} color={Colors.lightGray} />
          </View>
        </TouchableOpacity>
      );
    }

    if ((item as any).type === 'edit') {
      return (
        <TouchableOpacity
          onPress={() => setEditMode(!editMode)}
          activeOpacity={0.7}
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
          isActive && {
            backgroundColor: Colors.darkGray
          },
        ]}
        onPress={() => !isActive && !editMode && handleSwitchAccount(account)}
        activeOpacity={0.7}
        disabled={isSwitching}
      >
        <View style={styles.accountButtonContent}>
          <View style={styles.avatarContainer}>
            <Avatar
              uri={account.cachedProfile?.avatar}
              type="profile"
              size={40}
            />
          </View>
          <Text style={[
            styles.accountButtonText,
            isActive && { 
              color: Colors.white, 
              fontWeight: '600', 
              fontFamily: 'Firma-Bold' 
            }
          ]}>
            {displayName}
          </Text>
          {isSwitching && (
            <ActivityIndicator size="small" color={Colors.lightGray} />
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
      </TouchableOpacity>
    );
  }, [switchingAccount, editMode, customColors, handleSwitchAccount, handleRemoveAccount, handleAddAccount]);

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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
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

  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    marginRight: 12,
  },
  accountButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'left',
    fontFamily: 'Firma-SemiBold',
    paddingLeft: 8,
    flex: 1,
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