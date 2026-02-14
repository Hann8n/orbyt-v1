import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { SavedAccount } from '../../../stores/userStore';
import { requiresReauth } from '../../../utils/errors/oauth';
import ProfileService, { useProfile } from '../../../services/data/ProfileService';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { Colors } from '../../../theme';
import AuthorItem from '../../ui/AuthorItem';
import VerticalListSheet, { TrueSheet } from '../../ui/VerticalListSheet';
import { useAccountManagement, useAuth } from '../../../stores/userStore';
import LoginSheet from '../../ui/LoginSheet';
import SignUpSheet from '../../ui/SignUpSheet';

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
  const [showHandleInput, setShowHandleInput] = useState(false);
  const [showSignUpSheet, setShowSignUpSheet] = useState(false);
  const [, setIsAddingAccount] = useState(false);

  useEffect(() => {
    if (visible) TrueSheet.present('account-switcher');
  }, [visible]);

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
                cachedProfile = await ProfileService.getProfileByDid(account.did);
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
        if (requiresReauth(error)) {
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

  const handleAddAccount = useCallback(async () => {
    try {
      onDismiss();
      await new Promise(resolve => setTimeout(resolve, 200));
      setShowHandleInput(true);
    } catch (_error: unknown) {
      // ignore
    }
  }, [onDismiss]);

  const handleLoginSignIn = useCallback(
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

  type AccountListItem = {
    type: 'account';
    data: AccountWithProfile;
  };

  const listData: AccountListItem[] = useMemo(
    () =>
      accounts.map(account => ({
        type: 'account' as const,
        data: account,
      })),
    [accounts]
  );

  const showAddAccountLink = !!onAddAccount && (savedAccounts.length <= 1 || editMode);

  const renderAccountItem = useCallback(
    ({ item }: { item: AccountListItem }) => {
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
            did={account.did}
            displayName={displayName}
            avatar={account.cachedProfile?.avatar}
            size="large"
            showRing={true}
            showArrow={false}
            showDeleteButton={editMode && savedAccounts.length > 1}
            showCheckmark={shouldShowCheckmark}
            showCheckmarkSpinner={isSwitchTarget && !editMode}
            onDeletePress={() => handleRemoveAccount(account)}
            backgroundColor={Colors.neutral[900]}
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
      savedAccounts.length,
      activeAccountDid,
      isSwitchingAccount,
    ]
  );

  const keyExtractor = useCallback((item: AccountListItem) => item.data.id, []);

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
        name="account-switcher"
        onDismiss={onDismiss}
        title="Accounts"
        customHeaderButton={customHeaderButton}
        scrollable={false}
      >
        <View style={styles.listContent}>
          {listData.map(item => (
            <React.Fragment key={keyExtractor(item)}>{renderAccountItem({ item })}</React.Fragment>
          ))}
          {showAddAccountLink && (
            <Pressable
              style={({ pressed }) => [
                styles.addAccountButton,
                isAuthenticating && styles.addAccountButtonDisabled,
                pressed && styles.addAccountButtonPressed,
              ]}
              onPress={handleAddAccount}
              disabled={isAuthenticating}
            >
              <Text style={styles.addAccountButtonText}>Add account</Text>
            </Pressable>
          )}
        </View>
      </VerticalListSheet>

      <LoginSheet
        visible={showHandleInput}
        onDismiss={() => setShowHandleInput(false)}
        onSignIn={handleLoginSignIn}
        title="Add account"
        name="add-account-login-sheet"
        onOpenSignUp={() => setShowSignUpSheet(true)}
      />
      <SignUpSheet
        visible={showSignUpSheet}
        onDismiss={() => setShowSignUpSheet(false)}
        name="add-account-sign-up-sheet"
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
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  headerEditButtonText: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 0,
    paddingBottom: 0,
  },
  accountButton: {
    marginBottom: 0,
  },
  activeAccountButton: {
    // AuthorItem handles its own styling
  },
  addAccountButton: {
    marginBottom: 12,
    marginHorizontal: 0,
    paddingVertical: 20,
    paddingHorizontal: 20,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
    overflow: 'hidden',
  },
  addAccountButtonPressed: {
    opacity: 0.85,
  },
  addAccountButtonDisabled: {
    opacity: 0.5,
  },
  addAccountButtonText: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  headerEditButtonDisabled: {
    opacity: 0.5,
  },
});

export default AccountSwitcher;
