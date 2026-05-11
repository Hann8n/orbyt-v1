import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SquircleButton } from '@/components/ui/Squircle';
import { AuthFlowError, SavedAccount } from '../../../stores/userStore';
import {
  shouldShowError,
  getErrorMessage,
  isUserCancellation,
} from '../../../utils/errors/errorHandler';
import { useProfileByDid } from '../../../services/data/ProfileService';
import type { ProfileViewWithOrbyt } from '../../../services/api/types';
import { Colors } from '../../../theme';
import AuthorItem from '../../ui/AuthorItem';
import VerticalListSheet, { VerticalListButton } from '../../ui/VerticalListSheet';
import { SHEET_SPACING, SHEET_STYLES } from '../../../utils/components/truesheet';
import { useAccountManagement, useAuth } from '../../../stores/userStore';
import { useSheetPresentation } from '../../../hooks';
import { dismissSheet } from '../../../utils/navigation';
import { hydrateAccountsWithCachedProfiles } from '@/utils/atproto/accountSwitching';

interface AccountSwitcherProps {
  visible: boolean;
  onDismiss: () => void;
  onAccountSwitch: (account: SavedAccount) => void;
  onAddAccount?: () => void;
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

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
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountWithProfile[]>([]);
  const [switchingAccount, setSwitchingAccount] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  useSheetPresentation(visible, 'account-switcher');

  const { savedAccounts, switchAccount, removeAccount, activeAccountDid } = useAccountManagement();

  const { isAuthenticating, isSwitchingAccount, signIn } = useAuth();

  const inferredActive = accounts.find(acc => acc.did === activeAccountDid);
  useProfileByDid(inferredActive?.did || null);

  const loadAccounts = useCallback(async () => {
    const savedAccountsData = savedAccounts;

    setAccounts(savedAccountsData.map(account => ({ ...account })));

    try {
      const accountsWithProfiles = await hydrateAccountsWithCachedProfiles(savedAccountsData);
      setAccounts(accountsWithProfiles);
    } catch {
      void 0;
    }
  }, [savedAccounts]);

  useEffect(() => {
    if (savedAccounts.length > 0) {
      loadAccounts();
    }
  }, [savedAccounts, loadAccounts]);

  const toggleEditMode = useCallback(() => {
    setEditMode(prev => !prev);
  }, []);

  const closeAccountSwitcherSheets = useCallback(() => {
    setEditMode(false);
    dismissSheet('account-switcher');
  }, []);

  const handleSwitchAccount = useCallback(
    async (account: AccountWithProfile) => {
      if (account.did === activeAccountDid || isSwitchingAccount || isAuthenticating) {
        return;
      }

      setSwitchingAccount(account.did);
      try {
        closeAccountSwitcherSheets();
        await switchAccount(account.did);
        onAccountSwitch(account);
      } catch (error) {
        if (isUserCancellation(error)) return;

        if (error instanceof AuthFlowError && error.kind === 'reauth_required') {
          try {
            await signIn(account.originalIdentifier);
            await switchAccount(account.did);
            onAccountSwitch(account);
          } catch {
            void 0;
          }
          return;
        }

        Alert.alert(t('common.error'), t('errors.accountSwitchFailed'));
      } finally {
        setSwitchingAccount(null);
      }
    },
    [
      onAccountSwitch,
      switchAccount,
      activeAccountDid,
      isSwitchingAccount,
      isAuthenticating,
      closeAccountSwitcherSheets,
      signIn,
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

              if (isActiveAccount) {
                onDismiss();
              } else {
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
      router.push('/add-account');
    } catch {
      void 0;
    }
  }, [onDismiss, router]);

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
      const isActive = account.did === activeAccountDid;
      const isSwitchTarget = isSwitchingAccount && switchingAccount === account.did;
      const currentAccountDid = switchingAccount || activeAccountDid;
      const isCurrentAccount = account.did === currentAccountDid;

      const displayName =
        account.cachedProfile?.displayName || account.displayName || account.handle;
      const handle = account.cachedProfile?.handle || account.handle;

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
          backgroundColor={Colors.neutral[925]}
          style={styles.accountRow}
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

  return (
    <>
      <VerticalListSheet name="account-switcher" onDismiss={onDismiss} scrollable={false}>
        {savedAccounts.length > 1 ? (
          <View style={SHEET_STYLES.sheetScreenTitleRow}>
            <Text
              style={[SHEET_STYLES.sheetScreenTitle, SHEET_STYLES.sheetScreenTitleFlex]}
              numberOfLines={1}
            >
              {t('auth.accounts')}
            </Text>
            <SquircleButton
              onPress={toggleEditMode}
              disabled={isSwitchingAccount || isAuthenticating}
              style={[
                styles.headerEditButton,
                (isSwitchingAccount || isAuthenticating) && styles.headerEditButtonDisabled,
              ]}
            >
              <Text style={SHEET_STYLES.headerActionButtonText}>
                {editMode ? t('common.done') : t('common.edit')}
              </Text>
            </SquircleButton>
          </View>
        ) : (
          <Text style={SHEET_STYLES.sheetScreenTitle} numberOfLines={1}>
            {t('auth.accounts')}
          </Text>
        )}
        <View>
          {listData.map(item => (
            <React.Fragment key={keyExtractor(item)}>{renderAccountItem({ item })}</React.Fragment>
          ))}
          {showAddAccountLink && (
            <VerticalListButton
              label={t('auth.addAccount')}
              onPress={handleAddAccount}
              disabled={isAuthenticating}
            />
          )}
        </View>
      </VerticalListSheet>
    </>
  );
};

const styles = StyleSheet.create({
  accountRow: {
    marginBottom: 12,
  },
  headerEditButton: {
    ...SHEET_STYLES.headerActionButton,
    /** Visible on neutral[975] sheet (`headerActionButton` was same fill as sheet). */
    backgroundColor: Colors.neutral[925],
    paddingHorizontal: SHEET_SPACING.headerActionHorizontalComfortable,
    minWidth: 72,
    flexShrink: 0,
  },
  headerEditButtonDisabled: {
    opacity: 0.5,
  },
});

export default AccountSwitcher;
