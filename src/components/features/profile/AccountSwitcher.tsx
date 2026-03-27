import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, LAYOUT_INSETS } from '../../../utils/constants';
import { View, Pressable, StyleSheet, Alert } from 'react-native';
import { SavedAccount } from '../../../stores/userStore';
import { requiresReauth } from '../../../utils/errors/oauth';
import { shouldShowError, getErrorMessage } from '../../../utils/errors/errorHandler';
import ProfileService, { useProfile } from '../../../services/data/ProfileService';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { Colors } from '../../../theme';
import AuthorItem from '../../ui/AuthorItem';
import { ITEM_ROW_PADDING_VERTICAL, itemSizeConfig } from '../../ui/ItemStyles';
import VerticalListSheet from '../../ui/VerticalListSheet';
import { SHEET_SPACING, SHEET_STYLES } from '../../../utils/components/truesheet';
import { useAccountManagement, useAuth } from '../../../stores/userStore';
import LoginSheet from '../../ui/LoginSheet';
import SignUpSheet from '../../ui/SignUpSheet';
import { TypographyText } from '../../../utils/components/typography';
import { useSheetPresentation } from '../../../hooks';

const ACCOUNT_LIST_ROW_MIN_HEIGHT = itemSizeConfig.large.avatarSize + 2 * ITEM_ROW_PADDING_VERTICAL;

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
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([]);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showHandleInput, setShowHandleInput] = useState(false);
  const [showSignUpSheet, setShowSignUpSheet] = useState(false);
  const [, setIsAddingAccount] = useState(false);

  useSheetPresentation(visible, 'account-switcher');

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

  const toggleEditMode = useCallback(() => {
    setEditMode(prev => !prev);
  }, []);

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
              t('auth.sessionExpired'),
              t('auth.sessionExpiredMessage', { handle: account.handle }),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('auth.signIn'),
                  onPress: async () => {
                    await signIn(account.originalIdentifier);
                    await loadAccounts();
                  },
                },
              ]
            );
          }, 300);
        } else {
          Alert.alert(t('common.error'), t('errors.accountSwitchFailed'));
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
      t,
    ]
  );

  const handleRemoveAccount = useCallback(
    async (account: AccountWithProfile) => {
      const isActiveAccount = account.did === activeAccountDid;
      const name = account.displayName || account.handle;
      const alertMessage = isActiveAccount
        ? t('auth.removeAccountConfirm', { name })
        : t('auth.removeAccountConfirmInactive', { name });

      Alert.alert(t('auth.removeAccount'), alertMessage, [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.remove'),
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
              if (shouldShowError(error)) {
                Alert.alert(t('common.error'), getErrorMessage(error));
              }
            }
          },
        },
      ]);
    },
    [removeAccount, activeAccountDid, onDismiss, t]
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
              if (savedAccounts.length > 1) {
                handleSwitchAccount(account);
              }
            }
          }}
        />
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
        onPress={toggleEditMode}
        disabled={isSwitchingAccount || isAuthenticating}
        style={[
          styles.headerEditButton,
          (isSwitchingAccount || isAuthenticating) && styles.headerEditButtonDisabled,
        ]}
      >
        <TypographyText variant="body" weight="semibold">
          {editMode ? t('common.done') : t('common.edit')}
        </TypographyText>
      </Pressable>
    ) : null;

  return (
    <>
      <VerticalListSheet
        name="account-switcher"
        onDismiss={onDismiss}
        title={t('auth.accounts')}
        customHeaderButton={customHeaderButton}
        scrollable={false}
      >
        <View>
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
              <TypographyText variant="title" weight="semibold">
                {t('auth.addAccount')}
              </TypographyText>
            </Pressable>
          )}
        </View>
      </VerticalListSheet>

      <LoginSheet
        visible={showHandleInput}
        onDismiss={() => setShowHandleInput(false)}
        onSignIn={handleLoginSignIn}
        title={t('auth.addAccount')}
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
    ...SHEET_STYLES.headerActionButton,
    paddingHorizontal: SHEET_SPACING.headerActionHorizontalTight,
  },
  addAccountButton: {
    marginBottom: SHEET_SPACING.headerBottom,
    marginHorizontal: 0,
    paddingVertical: ITEM_ROW_PADDING_VERTICAL,
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
    minHeight: ACCOUNT_LIST_ROW_MIN_HEIGHT,
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
  headerEditButtonDisabled: {
    opacity: 0.5,
  },
});

export default AccountSwitcher;
