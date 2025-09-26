import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../ui/Icon';
import { SavedAccount } from '../../../stores/userStore';
import ProfileCache, { useProfile, CachedProfile } from '../../../services/cache/ProfileCache';
import { Colors, Avatar } from '../../ui/UI';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import UI from '../../ui/UI';
import { useQueryClient } from '@tanstack/react-query';
import VerticalListSheet from '../../ui/VerticalListSheet';
import { useAccountManagement, useAuth } from '../../../stores/userStore';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

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
  const DEBUG = __DEV__ && false;
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  
  // Glass effect support
  const shouldUseGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();


  // User store hooks
  const { 
    savedAccounts, 
    switchAccount, 
    removeAccount,
    activeAccountDid,
  } = useAccountManagement();
  
  const { 
    isAuthenticating, 
    isSwitchingAccount,
    signIn 
  } = useAuth();

  // Get current active account from store DID to avoid stale isActive flags
  const inferredActive = accounts.find(acc => acc.did === activeAccountDid);
  const { data: activeProfile } = useProfile(inferredActive?.handle || null);
  
  // Get custom colors for active account
  const customColors = activeProfile?.profileColors;

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      if (DEBUG) console.log('[AccountSwitcher] loadAccounts: start');
      // Use savedAccounts from the user store
      const savedAccountsData = savedAccounts;
      if (DEBUG) console.log('[AccountSwitcher] loadAccounts: savedAccounts len =', savedAccountsData.length);
      
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
      if (DEBUG) console.log('[AccountSwitcher] loadAccounts: done, accounts len =', accountsWithProfiles.length);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  }, [savedAccounts]);

  // Load accounts when modal opens or savedAccounts change
  useEffect(() => {
    if (visible) {
      if (DEBUG) console.log('[AccountSwitcher] visible = true, reloading accounts');
      loadAccounts();
      setEditMode(false); // Reset edit mode when modal opens
    }
  }, [visible, loadAccounts]);

  const handleSwitchAccount = useCallback(async (account: AccountWithProfile) => {
    if (account.did === activeAccountDid) {
      if (DEBUG) console.log('[AccountSwitcher] press ignored: account matches activeAccountDid but flagged isActive=', account.isActive);
      return;
    }

    if (DEBUG) console.log('[AccountSwitcher] handleSwitchAccount: begin', { did: account.did, handle: account.handle, activeAccountDid });
    setSwitchingAccount(account.did);
    // Proactively dismiss the sheet before switching to avoid a blank sheet during app refresh
    // This is safe even if the callback also dismisses later
    try {
      onDismiss();
    } catch (e) {
      // no-op safeguard
    }
    try {
      // Use the user store to switch accounts with completion callback
      await switchAccount(account.did, () => {
        // This callback is called when all data is loaded
        // Call the parent callback
        onAccountSwitch(account);
        
        // Close the modal
        onDismiss();
      });
      if (DEBUG) console.log('[AccountSwitcher] handleSwitchAccount: success', { did: account.did });
      
    } catch (error) {
      console.error('Error switching account:', error);
      if (DEBUG) console.log('[AccountSwitcher] handleSwitchAccount: error', error);
      Alert.alert('Error', 'Failed to switch account. Please try again.');
    } finally {
      if (DEBUG) console.log('[AccountSwitcher] handleSwitchAccount: end');
      setSwitchingAccount(null);
    }
  }, [onAccountSwitch, onDismiss, switchAccount]);

  const handleRemoveAccount = useCallback(async (account: AccountWithProfile) => {
    if (DEBUG) console.log('[AccountSwitcher] handleRemoveAccount prompt for', account.did);
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
              if (DEBUG) console.log('[AccountSwitcher] removing account', account.did);
              await removeAccount(account.did);
              // Reload accounts after removal
              await loadAccounts();
              if (DEBUG) console.log('[AccountSwitcher] removed account and reloaded');
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
      if (DEBUG) console.log('[AccountSwitcher] handleAddAccount: begin');

      await signIn('https://bsky.social');
      
      // Reload accounts to show the new one
      await loadAccounts();
      if (DEBUG) console.log('[AccountSwitcher] handleAddAccount: success, accounts reloaded');
      

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
      if (DEBUG) console.log('[AccountSwitcher] handleAddAccount: error', errorMessage);
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
          style={[
            styles.addAccountButton,
            shouldUseGlass && styles.addAccountButtonGlass
          ]}
          onPress={handleAddAccount}
          activeOpacity={0.8}
          disabled={isAuthenticating}
        >
          {shouldUseGlass && (
            <GlassView
              style={StyleSheet.absoluteFill}
              glassEffectStyle="clear"
              tintColor="rgba(24,28,34,0.15)"
              isInteractive
            />
          )}
          <View style={styles.buttonContent}>
            {isAuthenticating ? (
              <ActivityIndicator color={Colors.white} size="small" style={{ marginRight: 8 }} />
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
          onPress={() => {
            if (DEBUG) console.log('[AccountSwitcher] toggle editMode ->', !editMode);
            setEditMode(!editMode);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.editButtonText}>
            {editMode ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      );
    }

    const account = item.data as AccountWithProfile;
    const isActive = account.did === activeAccountDid; // derive from store to avoid stale flags
    const isSwitching = isSwitchingAccount && switchingAccount === account.did;
    
    const displayName = account.cachedProfile?.displayName || account.displayName || account.handle;
    const handle = account.cachedProfile?.handle || account.handle;
    
    return (
      <TouchableOpacity
        style={[
          styles.accountButton,
          isActive && styles.activeAccountButton,
          shouldUseGlass && styles.accountButtonGlass,
        ]}
        onPress={() => {
          if (DEBUG) {
            const staleFlag = account.isActive !== isActive;
            if (staleFlag) {
              console.warn('[AccountSwitcher] isActive discrepancy', { did: account.did, itemFlag: account.isActive, derived: isActive, activeAccountDid });
            }
            console.log('[AccountSwitcher] account row press', { did: account.did, isActive, editMode, activeAccountDid });
          }
          if (!isActive && !editMode) handleSwitchAccount(account);
        }}
        activeOpacity={0.7}
        disabled={isSwitching}
      >
        {shouldUseGlass && (
          <GlassView
            style={styles.accountButtonGlassView}
            glassEffectStyle="clear"
            tintColor="rgba(24,28,34,0.15)"
            isInteractive
          />
        )}
        {isSwitching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.white} size="small" />
            <Text style={styles.loadingText}>
              Switching to <Text 
                style={styles.loadingAccountName}
                allowFontScaling={false}
              >
                {displayName}
              </Text>
            </Text>
          </View>
        ) : (
          <View style={styles.accountButtonContent}>
            <View style={styles.avatarContainer}>
              <Avatar
                uri={account.cachedProfile?.avatar}
                type="profile"
                size={48}
                ringColor="transparent"
              />
            </View>
            <View style={styles.accountInfoContainer}>
              <Text 
                style={[
                  styles.accountDisplayName,
                  isActive && styles.activeAccountDisplayName
                ]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {displayName}
              </Text>
              <Text 
                style={styles.accountHandle}
                numberOfLines={1}
                allowFontScaling={false}
              >
                @{handle}
              </Text>
            </View>
            {!editMode && (
              <View style={styles.accountArrow}>
                <Icon name="chevron-right" size={20} color={Colors.lightGray} />
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
      showCancelButton={true}
    >
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.lightGray} />
        </View>
      ) : (
        <FlashList
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
    lineHeight: 18,
    includeFontPadding: false,
  },
  loadingAccountName: {
    color: Colors.white,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
    lineHeight: 18,
    includeFontPadding: false,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  accountButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  accountButtonGlass: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  accountButtonGlassView: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.LARGE,
  },
  activeAccountButton: {
    backgroundColor: Colors.darkGray,
  },
  addAccountButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  addAccountButtonGlass: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    marginRight: 8,
  },
  addAccountIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfoContainer: {
    flex: 1,
    paddingLeft: 4,
  },
  accountDisplayName: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Firma-Black',
    marginBottom: 2,
    lineHeight: 18,
    includeFontPadding: false,
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
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  accountHandle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 16,
    includeFontPadding: false,
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
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default AccountSwitcher; 