import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { BottomSheetModal, BottomSheetFlatList, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../ui/UI';
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
import { BRAND, TEXT, UI } from '../../../utils/formatting/Colors';
import { useQueryClient } from '@tanstack/react-query';

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

  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['60%'], []);

  // Show/hide bottom sheet based on visible prop
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

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
              } catch (refreshError) {
                console.warn(`Failed to refresh profile for ${account.handle}:`, refreshError);
              }
            }
            
            // Update saved account data with fresh profile information if available
            if (cachedProfile) {
              try {
                await AccountManager.updateAccountProfile(account.id, {
                  displayName: cachedProfile.displayName,
                  avatar: cachedProfile.avatar,
                  handle: cachedProfile.handle,
                });
              } catch (updateError) {
                console.warn(`Failed to update account profile for ${account.handle}:`, updateError);
              }
            }
            
            return {
              ...account,
              cachedProfile: cachedProfile || undefined
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
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (editMode) return; // Don't switch in edit mode
    try {
      setSwitchingAccount(account.id);
      
      // Clear all caches and data before switching accounts
      console.log('Clearing all data for account switch...');
      
      // Clear React Query cache completely
      queryClient.clear();
      
      // Clear ProfileCache
      await ProfileCache.clearCache();
      
      // Clear ChannelCache
      await ChannelCache.clearCache();
      
      // Clear ModerationService cache
      ModerationService.clearModerationCache();
      
      // Clear FeedStore
      feedService.clearCurrentFeed();
      
      // Clear WatchHistory
      await WatchHistory.clearWatchHistory();
      
      // Clear ChannelSubscriptionManager subscriptions
      await ChannelSubscriptionManager.clearAllSubscriptions();
      
      // VideoPreloadManager removed
      
      // Switch account (this will handle authentication)
      await AccountManager.switchAccount(account.id);
      
      // VideoPreloadManager removed
      
      // Call the parent's onAccountSwitch callback
      onAccountSwitch(account);
      onDismiss();
    } catch (error) {
      // console.error('Error switching account:', error);
      Alert.alert('Error', 'Failed to switch account. Please try again.');
    } finally {
      setSwitchingAccount(null);
    }
  };

  const handleRemoveAccount = async (account: SavedAccount) => {
    // Check if this is the currently active account
    if (account.isActive) {
      Alert.alert(
        'Remove Current Account',
        `You are currently logged in as:\n@${account.handle}\n\nRemoving this account will log you out.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Log Out & Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                // First log out the user
                if (onLogout) {
                  await onLogout(false); // Don't clear all accounts, just log out
                } else {
                  // Fallback to direct logout if no callback provided
                  await AtprotoService.logout(false);
                }
                
                // Then remove the account
                await AccountManager.removeAccount(account.id);
                await loadAccounts(); // Reload the list
                // Close the modal since user is now logged out
                onDismiss();
              } catch (error) {
                console.error('Error removing active account:', error);
                Alert.alert('Error', 'Failed to remove account. Please try again.');
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Remove Account',
        `Are you sure you want to remove @${account.handle}? This will delete the saved credentials.`,
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
                await loadAccounts(); // Reload the list
              } catch (error) {
                console.error('Error removing account:', error);
                Alert.alert('Error', 'Failed to remove account. Please try again.');
              }
            },
          },
        ]
      );
    }
  };

  const handleAddAccount = () => {
    if (onAddAccount) {
      onAddAccount();
    } else {
      onDismiss();
    }
  };

  // Prepare data for the flat list
  const listData = useMemo(() => {
    const accountItems = accounts.map(account => ({
      type: 'account' as const,
      data: account,
    }));
    
    if (editMode) {
      accountItems.push({
        type: 'add' as const,
        data: { id: 'add', handle: '', did: '', displayName: '', avatar: '', lastUsed: 0, isActive: false },
      } as any);
    }
    
    return accountItems;
  }, [accounts, editMode]);

  const renderAccountItem = useCallback(({ item }: { item: typeof listData[0] }) => {
    if ((item as any).type === 'add') {
      return (
        <TouchableOpacity
          style={styles.addAccountItem}
          onPress={handleAddAccount}
          activeOpacity={0.7}
        >
          <View style={styles.addAccountContent}>
            <View style={styles.addAccountIcon}>
              <PlusIcon size={20} color={TEXT.SECONDARY} strokeWidth={2.0} />
            </View>
            <View style={styles.addAccountTextContainer}>
              <Text style={styles.addAccountText}>Add Account</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    const account = item.data as AccountWithProfile;
    const isActive = account.isActive;
    const isSwitching = switchingAccount === account.id;
    
    // Use cached profile data if available, otherwise fall back to saved account data
    const displayName = account.cachedProfile?.displayName || account.displayName || account.handle;
    const avatar = account.cachedProfile?.avatar || account.avatar;
    const handle = account.cachedProfile?.handle || account.handle;
    
    return (
      <View style={styles.accountItemContainer}>
        <AuthorItem
          handle={handle}
          displayName={displayName}
          avatar={avatar}
          textColor={TEXT.PRIMARY}
          backgroundColor={isActive ? (customColors?.backgroundColor || UI.BACKGROUND.ITEM) : UI.BACKGROUND.ITEM}
          size="large"
          showArrow={false}
          onPress={() => !isActive && !editMode && handleSwitchAccount(account)}
          style={[
            styles.accountItem,
            isActive && styles.activeAccountItem,
          ]}
        />
        {editMode && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleRemoveAccount(account)}
            activeOpacity={0.7}
          >
            <Icon name="trash" size={16} color="#FE4359" />
          </TouchableOpacity>
        )}
        {isSwitching && (
          <View style={styles.switchingIndicator}>
            <ActivityIndicator size="small" color={TEXT.SECONDARY} />
          </View>
        )}
      </View>
    );
  }, [switchingAccount, editMode, customColors, handleSwitchAccount, handleRemoveAccount]);

  const keyExtractor = useCallback((item: typeof listData[0]) => {
    return (item as any).type === 'add' ? 'add' : item.data.id;
  }, []);

  // Backdrop component
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      enablePanDownToClose={true}
      enableOverDrag={false}
      enableDynamicSizing={false}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            Switch Account
          </Text>
        </View>
        <View style={styles.headerActions}>
          {!editMode && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditMode(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
          {editMode && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setEditMode(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TEXT.SECONDARY} />
        </View>
      ) : (
        <>
          <BottomSheetFlatList
            data={listData}
            renderItem={renderAccountItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
          <View style={[styles.closeButtonContainer, { paddingBottom: insets.bottom }]}>
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
    justifyContent: 'flex-end',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: TEXT.SECONDARY,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  doneButtonText: {
    color: TEXT.SECONDARY,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  accountItemContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  accountItem: {
    marginBottom: 0,
  },
  activeAccountItem: {
    borderWidth: 2,
    borderColor: TEXT.SECONDARY,
  },
  deleteButton: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -12 }],
    padding: 8,
    backgroundColor: 'rgba(254, 67, 89, 0.1)',
    borderRadius: 8,
  },
  switchingIndicator: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -8 }],
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 8,
  },
  addAccountItem: {
    marginTop: 8,
    marginBottom: 8,
  },
  addAccountContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: UI.BACKGROUND.ITEM,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  addAccountIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addAccountTextContainer: {
    flex: 1,
  },
  addAccountText: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-SemiBold',
  },
  closeButtonContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  closeButton: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  bottomSheetBackground: {
    backgroundColor: '#000',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleIndicator: {
    backgroundColor: '#666',
    width: 40,
    height: 5,
  },
});

export default AccountSwitcher; 