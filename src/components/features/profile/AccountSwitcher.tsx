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
  TextInput,
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
import { PDSDiscoveryService } from '../../../services/PDSDiscoveryService';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

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
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const [username, setUsername] = useState('');
  const [pdsError, setPdsError] = useState<string | null>(null);
  const [isValidatingPds, setIsValidatingPds] = useState(false);
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
      // Get fresh savedAccounts from the user store to ensure we have the latest state
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
              // Add a small delay to ensure the store state is updated
              await new Promise(resolve => setTimeout(resolve, 100));
              // Force reload accounts after removal to ensure state is synchronized
              setLoading(true);
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

  const handleBlueskyLogin = useCallback(async () => {
    setIsAddingAccount(true);
    
    try {
      if (DEBUG) console.log('[AccountSwitcher] handleBlueskyLogin: begin');

      await signIn('https://bsky.social');
      
      // Reload accounts to show the new one
      await loadAccounts();
      if (DEBUG) console.log('[AccountSwitcher] handleBlueskyLogin: success, accounts reloaded');
      

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
      if (DEBUG) console.log('[AccountSwitcher] handleBlueskyLogin: error', errorMessage);
    } finally {
      setIsAddingAccount(false);
    }
  }, [signIn, loadAccounts]);

  const handleUsernameLogin = useCallback(async () => {
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      setPdsError('Please enter your username or handle');
      return;
    }

    // Basic validation for common formats
    if (!trimmedUsername.includes('.') && !trimmedUsername.includes('@')) {
      setPdsError('Please enter a full handle (e.g., user.domain.com) or email');
      return;
    }

    setPdsError(null);
    setIsAddingAccount(true);
    setIsValidatingPds(true);
    setShowUsernameInput(false);
    
    // Use TrueSheet global method to dismiss the username input sheet before OAuth
    try {
      await TrueSheet.dismiss('username-input');
      // Small delay to ensure the username input sheet is properly dismissed
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
      console.error('[AccountSwitcher] Error dismissing username input:', e);
    }
    
    try {
      if (DEBUG) console.log('[AccountSwitcher] handleUsernameLogin: begin', { username: trimmedUsername });

      // Prepare identifier and let expo-atproto-auth handle the rest
      const identifier = await PDSDiscoveryService.prepareIdentifier(trimmedUsername);
      if (DEBUG) console.log('[AccountSwitcher] prepared identifier:', identifier);
      
      await signIn(identifier);
      
      // Reload accounts to show the new one
      await loadAccounts();
      if (DEBUG) console.log('[AccountSwitcher] handleUsernameLogin: success, accounts reloaded');
      

    } catch (error) {
      // Check if this is a user cancellation vs actual error
      const errorMessage = error instanceof Error ? error.message : 'OAuth sign-in failed';
      const isUserCancellation = errorMessage.includes('cancelled') || 
                                errorMessage.includes('Authentication was cancelled') ||
                                errorMessage.includes('user_cancelled');
      
      if (!isUserCancellation) {
        // More specific error messages based on common issues
        let userFriendlyMessage = `Could not connect to ${trimmedUsername}`;
        
        if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
          userFriendlyMessage = `Network error connecting to ${trimmedUsername}. Please check your internet connection and try again.`;
        } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
          userFriendlyMessage = `Could not find the server for ${trimmedUsername}. Please check the handle and try again.`;
        } else if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
          userFriendlyMessage = `Invalid handle format: ${trimmedUsername}. Please enter a valid handle (e.g., user.domain.com).`;
        }
        
        Alert.alert(
          'Connection Failed',
          userFriendlyMessage,
          [{ text: 'OK' }]
        );
      }
      if (DEBUG) console.log('[AccountSwitcher] handleUsernameLogin: error', errorMessage);
    } finally {
      setIsAddingAccount(false);
      setIsValidatingPds(false);
      setUsername('');
    }
  }, [signIn, loadAccounts, onDismiss, username]);

  const handleBlueskyAddAccount = useCallback(async () => {
    // Use TrueSheet global method to dismiss the main sheet first
    try {
      await TrueSheet.dismiss('account-switcher');
      // Wait for dismissal to complete before proceeding with OAuth
      await new Promise(resolve => setTimeout(resolve, 200));
      await handleBlueskyLogin();
    } catch (e) {
      console.error('[AccountSwitcher] Error in handleBlueskyAddAccount:', e);
    }
  }, [handleBlueskyLogin]);

  const handleCustomPDSAddAccount = useCallback(async () => {
    console.log('[AccountSwitcher] Dismissing main sheet and showing username input');
    // Use TrueSheet global method to dismiss the main sheet first, then present the username input
    try {
      await TrueSheet.dismiss('account-switcher'); // Dismiss the parent sheet first
      // Wait a bit for the dismissal to complete before showing the username input
      await new Promise(resolve => setTimeout(resolve, 200));
      setShowUsernameInput(true); // Set state to true first
      // Then use TrueSheet global method to present the username input sheet
      await TrueSheet.present('username-input');
    } catch (error) {
      console.error('[AccountSwitcher] Error in handleCustomPDSAddAccount:', error);
    }
  }, []);

  // Prepare list data including the add account options and edit button
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

    // Add the edit/done button
    accountItems.push({
      type: 'edit' as const,
      data: null,
    } as any);

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
                styles.addAccountButtonHalf,
                shouldUseGlass && styles.addAccountButtonGlass
              ]}
              onPress={handleBlueskyAddAccount}
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
                  {isAuthenticating ? 'Signing in...' : 'Bluesky'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.addAccountButton,
                styles.addAccountButtonHalf,
                shouldUseGlass && styles.addAccountButtonGlass
              ]}
              onPress={handleCustomPDSAddAccount}
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
                <Icon name="at" size={20} color={Colors.lightGray} style={{ marginRight: 8 }} />
                <Text style={styles.addAccountButtonText}>
                  Custom PDS
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
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
  }, [switchingAccount, editMode, customColors, handleSwitchAccount, handleRemoveAccount, handleBlueskyAddAccount, handleCustomPDSAddAccount, isAuthenticating]);

  const keyExtractor = useCallback((item: typeof listData[0]) => {
    const type = (item as any).type;
    if (type === 'addButtons') return 'addButtons';
    if (type === 'edit') return 'edit';
    return item.data.id;
  }, []);

  return (
    <>
      <VerticalListSheet
        visible={visible}
        onDismiss={onDismiss}
        title="Switch Account"
        showCancelButton={true}
        name="account-switcher"
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
      
       <VerticalListSheet
         visible={showUsernameInput}
         onDismiss={async () => {
           console.log('[AccountSwitcher] Username input dismissed');
           setShowUsernameInput(false);
           setUsername('');
           setPdsError(null);
         }}
         title="Add Account"
         showCancelButton={false}
         name="username-input"
       >
          <View style={styles.usernameInputContainer}>
            {pdsError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{pdsError}</Text>
              </View>
            )}
            
            <View style={styles.inputContainer}>
              <Icon name="at" size={20} color={Colors.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your handle (e.g., user.domain.com)"
                placeholderTextColor={Colors.gray}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  if (pdsError) setPdsError(null); // Clear error when user starts typing
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleUsernameLogin}
                editable={!isAddingAccount && !isValidatingPds}
                autoFocus
              />
            </View>
            
            <Text style={styles.helpText}>
              Enter your full handle (e.g., user.domain.com) or email address
            </Text>
            
            <TouchableOpacity
              style={[
                styles.liquidGlassButton,
                (!username.trim() || isAddingAccount || isValidatingPds) && styles.loginButtonDisabled
              ]}
              onPress={handleUsernameLogin}
              disabled={!username.trim() || isAddingAccount || isValidatingPds}
            >
              <BlurView
                intensity={20}
                tint="light"
                style={styles.blurContainer}
              >
                <LinearGradient
                  colors={
                    (!username.trim() || isAddingAccount || isValidatingPds)
                      ? ['rgba(128, 128, 128, 0.3)', 'rgba(128, 128, 128, 0.1)']
                      : ['rgba(3, 133, 255, 0.8)', 'rgba(3, 133, 255, 0.6)']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.glassGradient}
                >
                  <View style={styles.glassOverlay}>
                    {isAddingAccount || isValidatingPds ? (
                      <View style={styles.buttonContent}>
                        <ActivityIndicator color={Colors.white} size="small" style={{ marginRight: 8 }} />
                        <Text style={styles.loginButtonText}>
                          {isValidatingPds ? 'Connecting...' : 'Signing in...'}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.loginButtonText}>Sign In</Text>
                    )}
                  </View>
                </LinearGradient>
              </BlurView>
            </TouchableOpacity>
          </View>
        </VerticalListSheet>
    </>
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
  usernameInputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: 20,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.white,
    fontSize: 16,
    height: '100%',
    fontFamily: 'Firma-SemiBold',
  },
  liquidGlassButton: {
    borderRadius: BORDER_RADIUS.LARGE,
    marginTop: 8,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  blurContainer: {
    borderRadius: BORDER_RADIUS.LARGE,
    overflow: 'hidden',
  },
  glassGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  glassOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButton: {
    backgroundColor: Colors.bluesky,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.darkGray,
  },
  loginButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
  helpText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
  },
});

export default AccountSwitcher; 