import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import Icon, { Loading3FillIcon } from '../../ui/Icon';
import { SavedAccount } from '../../../stores/userStore';
import { analyzeOAuthError } from '../../../utils/oauthErrorHandler';
import ProfileCache, { useProfile, CachedProfile } from '../../../services/cache/ProfileCache';
import { Colors, Avatar } from '../../ui/UI';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import UI from '../../ui/UI';
import AuthorItem from '../../ui/AuthorItem';
import { useQueryClient } from '@tanstack/react-query';
import VerticalListSheet from '../../ui/VerticalListSheet';
import { useAccountManagement, useAuth } from '../../../stores/userStore';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { PDSDiscoveryService } from '../../../services/PDSDiscoveryService';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../../utils/truesheet/trueSheetUtils';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import CustomPDSInputSheet from '../../ui/CustomPDSInputSheet';
import { useVisibilityOverlay } from '../../../hooks';

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
  useVisibilityOverlay(visible);
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const queryClient = useQueryClient();
  
  // Glass effect support - disabled for consistent black background
  const shouldUseGlass = false;


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
    // Set accounts immediately with basic data to prevent sheet expansion
    const savedAccountsData = savedAccounts;
    setAccounts(savedAccountsData.map(account => ({ ...account })));
    
    setLoading(true);
    try {
      // Enhance accounts with cached profile data asynchronously
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
              }
            }
            
            return {
              ...account,
              cachedProfile,
            };
          } catch (error) {
            return account;
          }
        })
      );
      
      setAccounts(accountsWithProfiles);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, [savedAccounts]);

  // Preload accounts when savedAccounts change (proactive loading)
  useEffect(() => {
    if (savedAccounts.length > 0) {
      loadAccounts();
    }
  }, [savedAccounts, loadAccounts]);

  // Reset edit mode when modal opens
  useEffect(() => {
    if (visible) {
      setEditMode(false);
    }
  }, [visible]);

  const handleSwitchAccount = useCallback(async (account: AccountWithProfile) => {
    if (account.did === activeAccountDid) {
      return;
    }

    setSwitchingAccount(account.did);
    // Proactively dismiss the sheet before switching to avoid a blank sheet during app refresh
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
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch account';
      
      // Use universal OAuth error analysis
      const errorInfo = analyzeOAuthError(error);
      
      if (errorInfo.requiresReauth) {
        // Dismiss the account switcher first
        onDismiss();
        
        // Small delay to ensure modal is dismissed before showing alert
        setTimeout(() => {
          Alert.alert(
            'Session Expired', 
            `Your session for @${account.handle} has expired. You need to sign in again.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { 
                text: 'Sign In', 
                onPress: async () => {
                  await signIn(account.originalIdentifier);
                  await loadAccounts();
                }
              },
            ]
          );
        }, 300);
      } else {
        Alert.alert('Error', 'Failed to switch account. Please try again.');
      }
    } finally {
      setSwitchingAccount(null);
    }
  }, [onAccountSwitch, onDismiss, switchAccount]);

  const handleRemoveAccount = useCallback(async (account: AccountWithProfile) => {
    
    const isActiveAccount = account.did === activeAccountDid;
    const alertMessage = isActiveAccount 
      ? `Are you sure you want to remove ${account.displayName || account.handle}? This will sign you out.`
      : `Are you sure you want to remove ${account.displayName || account.handle}?`;
    
    Alert.alert(
      'Remove Account',
      alertMessage,
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
              
              // If this was the active account, the user will be signed out
              // so we should dismiss the modal
              if (isActiveAccount) {
                onDismiss();
              } else {
                // For non-active accounts, just update the local UI state
                setAccounts(prevAccounts => prevAccounts.filter(acc => acc.did !== account.did));
              }
              
            } catch (error) {
              
              // Use simple error handler
              const { shouldShowError, getErrorMessage } = await import('../../../utils/errorHandler');
              
              if (shouldShowError(error)) {
                Alert.alert('Error', getErrorMessage(error));
              }
            }
          },
        },
      ]
    );
  }, [removeAccount, activeAccountDid, onDismiss]);

  const handleBlueskyLogin = useCallback(async () => {
    setIsAddingAccount(true);
    
    try {

      await signIn('https://bsky.social');
      
      // Reload accounts to show the new one
      await loadAccounts();
      

    } catch (error) {
      // Use simple error handler
      const { isUserCancellation, getErrorMessage } = await import('../../../utils/errorHandler');
      
      // Don't show errors for user cancellation
      if (!isUserCancellation(error)) {
        const errorMessage = getErrorMessage(error);
        Alert.alert(
          'OAuth Sign-in Failed',
          errorMessage,
          [
            { text: 'OK', style: 'cancel' }
          ]
        );
      }
      
    } finally {
      setIsAddingAccount(false);
    }
  }, [signIn, loadAccounts]);


  const handleBlueskyAddAccount = useCallback(async () => {
    // Use TrueSheet global method to dismiss the main sheet first
    try {
      await safeDismiss('account-switcher');
      // Wait for dismissal to complete before proceeding with OAuth
      await new Promise(resolve => setTimeout(resolve, 200));
      await handleBlueskyLogin();
    } catch (e) {
    }
  }, [handleBlueskyLogin]);

  const handleCustomPDSAddAccount = useCallback(async () => {
    // Use TrueSheet global method to dismiss the main sheet first, then present the custom PDS input
    try {
      await safeDismiss('account-switcher'); // Dismiss the parent sheet first
      // Wait a bit for the dismissal to complete before showing the custom PDS input
      await new Promise(resolve => setTimeout(resolve, 200));
      setShowUsernameInput(true); // Set state to true first
      // Then use TrueSheet global method to present the custom PDS input sheet
      await safePresent('custom-pds-input');
    } catch (error) {
    }
  }, []);

  const handleCustomPDSSignIn = useCallback(async (identifier: string) => {
    setIsAddingAccount(true);
    
    try {

      await signIn(identifier);
      
      // Reload accounts to show the new one
      await loadAccounts();
      
    } catch (error) {
      // Re-throw the error so the CustomPDSInputSheet can handle it
      throw error;
    } finally {
      setIsAddingAccount(false);
    }
  }, [signIn, loadAccounts]);

  // Prepare list data including the add account options
  const listData = useMemo(() => {
    const accountItems = accounts.map(account => ({
      type: 'account' as const,
      data: account,
    }));

    // Add the "Add Account" options only when in edit mode and onAddAccount is provided
    if (editMode && onAddAccount) {
      accountItems.push({
        type: 'addButtons' as const,
        data: null,
      } as any);
    }

    return accountItems;
  }, [accounts, onAddAccount, editMode]);

  const renderAccountItem = useCallback(({ item }: { item: typeof listData[0] }) => {
    if ((item as any).type === 'addButtons') {
      return (
        <View style={styles.addAccountSection}>
          <Text style={styles.addAccountHeader}>Add Account</Text>
          <View style={styles.addButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.addAccountButton,
                styles.addAccountButtonHalf
              ]}
              onPress={handleBlueskyAddAccount}
              activeOpacity={0.8}
              disabled={isAuthenticating}
            >
              <View style={styles.buttonContent}>
                {isAuthenticating ? (
                  <Loading3FillIcon size={24} color={Colors.white} style={{ marginRight: 8 }} />
                ) : (
                  <Icon name="bluesky-icon" size={20} color={Colors.bluesky} style={{ marginRight: 8 }} />
                )}
                <Text style={styles.addAccountButtonText}>
                  {isAuthenticating ? 'Signing in...' : 'Bluesky'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.addAccountButton,
                styles.addAccountButtonHalf
              ]}
              onPress={handleCustomPDSAddAccount}
              activeOpacity={0.8}
              disabled={isAuthenticating}
            >
              <View style={styles.buttonContent}>
                <Icon name="at" size={20} color={Colors.lightGray} style={{ marginRight: 8 }} />
                <Text style={styles.addAccountButtonText}>
                  Custom
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      );
    }


    const account = item.data as AccountWithProfile;
    const isActive = account.did === activeAccountDid; // derive from store to avoid stale flags
    const isSwitching = isSwitchingAccount && switchingAccount === account.did;
    
    const displayName = account.cachedProfile?.displayName || account.displayName || account.handle;
    const handle = account.cachedProfile?.handle || account.handle;
    
    if (isSwitching) {
      return (
        <View style={[styles.accountButton, styles.loadingContainer]}>
          <Loading3FillIcon size={24} color={Colors.white} />
          <Text style={styles.loadingText}>
            Switching to <Text 
              style={styles.loadingAccountName}
              allowFontScaling={false}
            >
              {displayName}
            </Text>
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.accountButton}>
        <AuthorItem
          handle={handle}
          displayName={displayName}
          avatar={account.cachedProfile?.avatar}
          size="large"
          showRing={true}
          showArrow={!editMode && !isActive}
          showDeleteButton={editMode}
          onDeletePress={() => handleRemoveAccount(account)}
          backgroundColor={Colors.darkGray}
          onPress={() => {
            if (!isActive && !editMode) handleSwitchAccount(account);
          }}
          style={isActive ? styles.activeAccountButton : undefined}
        />
      </View>
    );
  }, [switchingAccount, editMode, customColors, handleSwitchAccount, handleRemoveAccount, handleBlueskyAddAccount, handleCustomPDSAddAccount, isAuthenticating]);

  const keyExtractor = useCallback((item: typeof listData[0]) => {
    const type = (item as any).type;
    if (type === 'addButtons') return 'addButtons';
    return item.data.id;
  }, []);

  // Custom header button for edit mode toggle
  const customHeaderButton = (
    <TouchableOpacity
      onPress={() => {
        setEditMode(!editMode);
      }}
      activeOpacity={0.7}
      style={styles.headerEditButton}
    >
      <Text style={styles.headerEditButtonText}>
        {editMode ? 'Done' : 'Edit'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <VerticalListSheet
        visible={visible}
        onDismiss={onDismiss}
        title="Switch Account"
        customHeaderButton={customHeaderButton}
        name="account-switcher"
        detents={['auto']}
        scrollable={false}
      >
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <Loading3FillIcon size={48} color={Colors.lightGray} />
          </View>
        ) : (
          <View style={styles.listContent}>
            {listData.map((item) => (
              <React.Fragment key={keyExtractor(item)}>
                {renderAccountItem({ item })}
              </React.Fragment>
            ))}
          </View>
        )}
      </VerticalListSheet>
      
       <CustomPDSInputSheet
         visible={showUsernameInput}
         onDismiss={async () => {
           setShowUsernameInput(false);
         }}
         onSignIn={handleCustomPDSSignIn}
         title="Add Account"
         name="custom-pds-input"
       />
    </>
  );
};

const styles = StyleSheet.create({
  headerEditButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  headerEditButtonText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
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
    marginBottom: 0,
  },
  activeAccountButton: {
    // AuthorItem handles its own styling
  },
  addAccountSection: {
    marginTop: 20,
    marginBottom: 12,
  },
  addAccountHeader: {
    color: Colors.lightGray,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
    textAlign: 'left',
  },
  addButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  addAccountButton: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    paddingHorizontal: 20,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  addAccountButtonHalf: {
    flex: 1,
    marginBottom: 0,
  },
  addAccountIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
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
});

export default AccountSwitcher; 