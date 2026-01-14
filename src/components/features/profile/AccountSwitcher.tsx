import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import Icon, { Loading3FillIcon } from '../../ui/Icon';
import { SavedAccount } from '../../../stores/userStore';
import { analyzeOAuthError } from '../../../utils/errors/oauth';
import ProfileService, { useProfile } from '../../../services/data/ProfileService';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { Colors } from '../../ui/UI';
import AuthorItem from '../../ui/AuthorItem';
import VerticalListSheet from '../../ui/VerticalListSheet';
import { useAccountManagement, useAuth } from '../../../stores/userStore';
import { safeDismiss, safePresent } from '../../../utils/components/truesheet/utils';
import CustomPDSInputSheet from '../../ui/CustomPDSInputSheet';

interface AccountSwitcherProps {
  visible: boolean;
  onDismiss: () => void;
  onAccountSwitch: (account: SavedAccount) => void;
  onAddAccount?: () => void;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

// Extended interface to include cached profile data
interface AccountWithProfile extends SavedAccount {
  cachedProfile?: ProfileViewWithOrbyt;
}

const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  visible,
  onDismiss,
  onAccountSwitch,
  onAddAccount,
}) => {
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([]);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const [_isAddingAccount, setIsAddingAccount] = useState(false);

  // User store hooks
  const { savedAccounts, switchAccount, removeAccount, activeAccountDid } = useAccountManagement();

  const { isAuthenticating, isSwitchingAccount, signIn } = useAuth();

  // Get current active account from store DID to avoid stale isActive flags
  const inferredActive = accounts.find(acc => acc.did === activeAccountDid);
  useProfile(inferredActive?.handle || null);

  const loadAccounts = useCallback(async () => {
    const savedAccountsData = savedAccounts;

    // Only seed basic accounts if we don't already have a list, to avoid flicker
    if (accounts.length === 0) {
      setAccounts(savedAccountsData.map(account => ({ ...account })));
    }

    try {
      // Enhance accounts with cached profile data asynchronously
      const accountsWithProfiles = await Promise.all(
        savedAccountsData.map(async account => {
          try {
            // Try to get cached profile data for each account (using DID)
            // First try to get from cache, then refresh if needed
            let cachedProfile = await ProfileService.getProfileByDid(account.did);

            // If no cached data or cache is stale, try to refresh
            if (!cachedProfile) {
              try {
                cachedProfile = await ProfileService.refreshProfileByDid(account.did);
              } catch (_error: unknown) {
                // ignore
              }
            }

            return {
              ...account,
              cachedProfile: cachedProfile || undefined,
            };
          } catch (_error) {
            return account;
          }
        })
      );

      setAccounts(accountsWithProfiles);
    } catch (_error) {
      // no-op: account loading failures are handled per-account above
    } finally {
      // no-op: loading state is not used in UI; kept for potential future enhancements
    }
  }, [savedAccounts, accounts.length]);

  // Preload accounts when savedAccounts change (proactive loading)
  useEffect(() => {
    if (savedAccounts.length > 0) {
      loadAccounts();
    }
  }, [savedAccounts, loadAccounts]);

  // Reset edit mode when modal opens, and disable edit mode if only one account
  useEffect(() => {
    if (visible) {
      // Always reset to non-edit mode when opening
      // Edit mode is automatically disabled when there's only one account
      setEditMode(false);
    }
  }, [visible]);

  const handleSwitchAccount = useCallback(
    async (account: AccountWithProfile) => {
      if (account.did === activeAccountDid) {
        return;
      }

      // Prevent starting another switch while one is in progress
      if (isSwitchingAccount || isAuthenticating) {
        return;
      }

      setSwitchingAccount(account.did);
      try {
        // Use the user store to switch accounts with completion callback
        await switchAccount(account.did, () => {
          // This callback is called when all data is loaded
          onAccountSwitch(account);
          // Close the account switcher once the new account is fully ready
          onDismiss();
        });
      } catch (error) {
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
                  },
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
    },
    [
      onAccountSwitch,
      onDismiss,
      switchAccount,
      activeAccountDid,
      isSwitchingAccount,
      isAuthenticating,
      signIn,
      loadAccounts,
    ]
  );

  const handleRemoveAccount = useCallback(
    async (account: AccountWithProfile) => {
      const isActiveAccount = account.did === activeAccountDid;
      const alertMessage = isActiveAccount
        ? `Are you sure you want to remove ${account.displayName || account.handle}? This will sign you out.`
        : `Are you sure you want to remove ${account.displayName || account.handle}?`;

      Alert.alert('Remove Account', alertMessage, [
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
              const { shouldShowError, getErrorMessage } =
                await import('../../../utils/errors/errorHandler');

              if (shouldShowError(error)) {
                Alert.alert('Error', getErrorMessage(error));
              }
            }
          },
        },
      ]);
    },
    [removeAccount, activeAccountDid, onDismiss]
  );

  const handleBlueskyLogin = useCallback(async () => {
    setIsAddingAccount(true);

    try {
      await signIn('https://bsky.social');

      // Reload accounts to show the new one
      await loadAccounts();
    } catch (error) {
      // Use simple error handler
      const { isUserCancellation, getErrorMessage } =
        await import('../../../utils/errors/errorHandler');

      // Don't show errors for user cancellation
      if (!isUserCancellation(error)) {
        const errorMessage = getErrorMessage(error);
        Alert.alert('OAuth Sign-in Failed', errorMessage, [{ text: 'OK', style: 'cancel' }]);
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
    } catch (_error: unknown) {
      // ignore
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
    } catch (_error: unknown) {
      // ignore
    }
  }, []);

  const handleCustomPDSSignIn = useCallback(
    async (identifier: string) => {
      setIsAddingAccount(true);

      try {
        await signIn(identifier);

        // Reload accounts to show the new one
        await loadAccounts();
      } finally {
        setIsAddingAccount(false);
      }
    },
    [signIn, loadAccounts]
  );

  type AccountListItem =
    | {
        type: 'account';
        data: AccountWithProfile;
      }
    | {
        type: 'addButtons';
        data: null;
      };

  // Prepare list data including the add account options
  const listData: AccountListItem[] = useMemo(() => {
    const accountItems: AccountListItem[] = accounts.map(account => ({
      type: 'account',
      data: account,
    }));

    // Add the "Add Account" options when:
    // 1. There's only one account (show by default)
    // 2. OR when in edit mode and onAddAccount is provided (multiple accounts)
    const shouldShowAddButtons = (savedAccounts.length <= 1 || editMode) && !!onAddAccount;
    if (shouldShowAddButtons) {
      accountItems.push({
        type: 'addButtons',
        data: null,
      });
    }

    return accountItems;
  }, [accounts, onAddAccount, editMode, savedAccounts.length]);

  const renderAccountItem = useCallback(
    ({ item }: { item: AccountListItem }) => {
      if (item.type === 'addButtons') {
        return (
          <View style={styles.addAccountSection}>
            <Text style={styles.addAccountHeader}>Add Account</Text>
            <View style={styles.addButtonsContainer}>
              <Pressable
                style={[styles.addAccountButton, styles.addAccountButtonHalf]}
                onPress={handleBlueskyAddAccount}
                disabled={isAuthenticating}
              >
                <View style={styles.buttonContent}>
                  {isAuthenticating ? (
                    <Loading3FillIcon size={24} color={Colors.white} style={styles.iconSpacing} />
                  ) : (
                    <Icon
                      name="bluesky-icon"
                      size={20}
                      color={Colors.bluesky}
                      style={styles.iconSpacing}
                    />
                  )}
                  <Text style={styles.addAccountButtonText}>
                    {isAuthenticating ? 'Signing in...' : 'Bluesky'}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.addAccountButton, styles.addAccountButtonHalf]}
                onPress={handleCustomPDSAddAccount}
                disabled={isAuthenticating}
              >
                <View style={styles.buttonContent}>
                  <Icon name="at" size={20} color={Colors.white} style={styles.iconSpacing} />
                  <Text style={styles.addAccountButtonText}>Network</Text>
                </View>
              </Pressable>
            </View>
          </View>
        );
      }

      const account = item.data;
      const isActive = account.did === activeAccountDid; // derive from store to avoid stale flags
      const isSwitchTarget = isSwitchingAccount && switchingAccount === account.did;
      const currentAccountDid = switchingAccount || activeAccountDid;
      const isCurrentAccount = account.did === currentAccountDid;

      const displayName =
        account.cachedProfile?.displayName || account.displayName || account.handle;
      const handle = account.cachedProfile?.handle || account.handle;

      // Only show a static check on the "current" account (latest selected)
      // When a switch is in progress, the previous active account immediately loses the check
      const shouldShowCheckmark = !editMode && isCurrentAccount && !isSwitchTarget;

      return (
        <View style={styles.accountButton}>
          <AuthorItem
            handle={handle}
            displayName={displayName}
            avatar={account.cachedProfile?.avatar}
            size="large"
            showRing={true}
            showArrow={false}
            showDeleteButton={editMode && savedAccounts.length > 1}
            showCheckmark={shouldShowCheckmark}
            showCheckmarkSpinner={isSwitchTarget && !editMode}
            onDeletePress={() => handleRemoveAccount(account)}
            backgroundColor={Colors.darkGray}
            onPress={() => {
              if (!isActive && !editMode) {
                // Only allow switching if there are multiple accounts
                if (savedAccounts.length > 1) {
                  handleSwitchAccount(account);
                }
              }
            }}
            style={isActive ? styles.activeAccountButton : undefined}
          />
        </View>
      );
    },
    [
      switchingAccount,
      editMode,
      handleSwitchAccount,
      handleRemoveAccount,
      handleBlueskyAddAccount,
      handleCustomPDSAddAccount,
      isAuthenticating,
      savedAccounts.length,
      activeAccountDid,
      isSwitchingAccount,
    ]
  );

  const keyExtractor = useCallback((item: AccountListItem) => {
    const type = item.type;
    if (type === 'addButtons') return 'addButtons';
    return item.data.id;
  }, []);

  // Custom header button for edit mode toggle (only show when there are multiple accounts)
  const customHeaderButton =
    savedAccounts.length > 1 ? (
      <Pressable
        onPress={() => {
          setEditMode(!editMode);
        }}
        disabled={isSwitchingAccount || isAuthenticating}
        style={[
          styles.headerEditButton,
          (isSwitchingAccount || isAuthenticating) && styles.headerEditButtonDisabled,
        ]}
      >
        <Text style={styles.headerEditButtonText}>{editMode ? 'Done' : 'Edit'}</Text>
      </Pressable>
    ) : null;

  return (
    <>
      <VerticalListSheet
        visible={visible}
        onDismiss={onDismiss}
        title="Accounts"
        customHeaderButton={customHeaderButton}
        name="account-switcher"
        detents={['auto']}
        scrollable={false}
      >
        <View style={styles.listContent}>
          {listData.map(item => (
            <React.Fragment key={keyExtractor(item)}>{renderAccountItem({ item })}</React.Fragment>
          ))}
        </View>
      </VerticalListSheet>

      <CustomPDSInputSheet
        visible={showUsernameInput}
        onDismiss={async () => {
          setShowUsernameInput(false);
        }}
        onSignIn={handleCustomPDSSignIn}
        title="Network sign in"
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
    height: 32,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  headerEditButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 0,
    paddingBottom: 12,
  },
  accountButton: {
    marginBottom: 0,
  },
  activeAccountButton: {
    // AuthorItem handles its own styling
  },
  addAccountSection: {
    marginTop: 0,
    marginBottom: 12,
  },
  addAccountHeader: {
    color: Colors.gray,
    fontSize: 16,

    fontFamily: 'Figtree-SemiBold',
    paddingHorizontal: 10,
    paddingVertical: 12,
    letterSpacing: 0.5,
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
    borderColor: Colors.transparent,
  },
  addAccountButtonHalf: {
    flex: 1,
    marginBottom: 0,
  },
  iconSpacing: {
    marginRight: 8,
  },
  headerEditButtonDisabled: {
    opacity: 0.5,
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
    fontFamily: 'Figtree-SemiBold',
  },
});

export default AccountSwitcher;
