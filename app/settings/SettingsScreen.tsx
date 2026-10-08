import React, { useState, useRef, useMemo, useCallback, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Alert, Platform, ScrollView, Linking } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';
import { NativePressable } from '@/components/ui/NativePressable';
import * as Clipboard from 'expo-clipboard';
import Icon, { GridViewIcon, ListViewIcon } from '@/components/ui/Icon';
import { getDeviceInfo, getBuildVersion } from '@/utils/version';
import { Colors } from '@/theme';
import ListHeader from '@/components/ui/ListHeader';
import { OptionsButton } from '@/components/ui/OptionsButton';
import { useAuth, useCurrentUser, useAccountManagement, useUserStore } from '@/stores/userStore';
import { settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { SHEET_VERTICAL_LIST_ROW_OUTER } from '@/utils/components/truesheet';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useAccountSwitcher } from '@/stores/modalStore';
import type { ViewMode } from '@/types';
import { FontFamily, Typography } from '@/utils/components/typography';

const SettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const onLogout = useAuth().signOut;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProfileLinkCopied, setIsProfileLinkCopied] = useState(false);
  const { presentAccountSwitcher } = useAccountSwitcher();
  const { currentUser } = useCurrentUser();
  const { savedAccounts } = useAccountManagement();

  const profileFeedViewMode = useUserStore(state => state.profileFeedViewMode);
  const setProfileFeedViewMode = useUserStore(state => state.setProfileFeedViewMode);
  const feedViewMenuRef = useRef<ComponentRef<typeof MenuView>>(null);

  const handleLogout = useCallback(async () => {
    if (isSubmitting) return;

    Alert.alert(t('alerts.logOut'), t('alerts.logOutConfirm'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('settings.logOut'),
        style: 'default',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            const eventProperties: Record<string, string> = {};
            if (currentUser?.did) {
              eventProperties.did = currentUser.did;
            }
            if (currentUser?.handle) {
              eventProperties.handle = currentUser.handle;
            }

            await onLogout(false);
          } catch (_error) {
            Alert.alert(t('common.error'), t('errors.logoutFailed'));
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  }, [isSubmitting, t, currentUser, onLogout]);

  const handleRemoveAccount = useCallback(async () => {
    if (isSubmitting) return;

    const hasMultipleAccounts = savedAccounts.length > 1;
    const title = hasMultipleAccounts
      ? t('settings.removeAccounts') + '?'
      : t('settings.removeAccount') + '?';
    const message = hasMultipleAccounts
      ? t('settings.removeAccountsMessage')
      : t('settings.removeAccountMessage');
    const confirmLabel = hasMultipleAccounts
      ? t('settings.removeAccounts')
      : t('settings.removeAccount');

    Alert.alert(title, message, [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            await onLogout(true);
          } catch (_error) {
            Alert.alert(t('common.error'), t('errors.accountSwitchFailed'));
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  }, [isSubmitting, savedAccounts, t, onLogout]);

  const handleCopyProfileLink = useCallback(async () => {
    if (!currentUser?.handle && !currentUser?.did) {
      Alert.alert(t('common.error'), t('errors.unexpected'));
      return;
    }

    try {
      const handle = currentUser?.handle;
      const identifier = handle && !handle.endsWith('.invalid') ? handle : currentUser?.did;
      if (!identifier) {
        Alert.alert(t('common.error'), t('errors.unexpected'));
        return;
      }

      const profileUrl = `https://getorbyt.com/@${identifier}`;
      await Clipboard.setStringAsync(profileUrl);
      setIsProfileLinkCopied(true);
      setTimeout(() => {
        setIsProfileLinkCopied(false);
      }, 4000);
    } catch {
      // ignore clipboard errors
    }
  }, [currentUser, t]);

  const handleClearCache = useCallback(async () => {
    Alert.alert(t('settings.clearCacheConfirm'), t('settings.clearCacheMessage'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('settings.clearCache'),
        style: 'default',
        onPress: async () => {
          try {
            queryClient.clear();
            Alert.alert(t('common.success'), t('settings.cacheCleared'));
          } catch {
            // ignore cache clear failures
          }
        },
      },
    ]);
  }, [t, queryClient]);

  const handleOpenLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  const handleOpenEmail = useCallback(
    async (email: string) => {
      try {
        const deviceInfo = await getDeviceInfo();
        const subject = encodeURIComponent(t('settings.emailSubjectSupport'));
        const body = encodeURIComponent(
          `

----------------------------------------
Device Information (do not edit below this line):
${deviceInfo}`
        );
        const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

        const canOpen = await Linking.canOpenURL(`mailto:${email}`);
        if (canOpen) {
          await Linking.openURL(mailtoUrl);
        } else {
          await Clipboard.setStringAsync(`${email}\n\n${deviceInfo}`);
          Alert.alert(t('settings.emailCopied'), t('settings.emailCopiedMessage'), [
            { text: t('common.ok') },
          ]);
        }
      } catch {
        Linking.openURL(`mailto:${email}`).catch(() => {});
      }
    },
    [t]
  );

  const formattedVersion = getBuildVersion();

  const handleVersionPress = async () => {
    try {
      const message = await getDeviceInfo();
      Alert.alert(t('settings.versionInfo'), message, [
        {
          text: t('common.copy'),
          onPress: async () => {
            await Clipboard.setStringAsync(message);
            Alert.alert(t('common.success'), t('settings.versionCopied'));
          },
        },
        {
          text: t('common.ok'),
          style: 'default',
        },
      ]);
    } catch (_error) {
      Alert.alert(t('common.error'), t('errors.unexpected'));
    }
  };

  const handleFeedViewModeChange = async (mode: ViewMode) => {
    await setProfileFeedViewMode(mode);
  };

  type SettingItem = {
    id: string;
    label: string;
    onPress: () => void;
    linkType?: 'internal' | 'external' | 'none';
    icon?: string;
    rightIcon?: React.ReactNode;
    destructive?: boolean;
  };

  type SettingsSection = {
    id: string;
    title: string;
    items: SettingItem[];
  };

  const settingsSections: SettingsSection[] = useMemo(
    () => [
      {
        id: 'profile',
        title: '', // No title for profile section
        items: [
          {
            id: 'followers',
            label: t('settings.yourFollowers'),
            icon: 'users',
            onPress: () => router.navigate('/settings/followers'),
            linkType: 'internal',
          },
          {
            id: 'following',
            label: t('settings.peopleYouFollow'),
            icon: 'user-plus',
            onPress: () => router.navigate('/settings/following'),
            linkType: 'internal',
          },
        ],
      },
      {
        id: 'sharing',
        title: t('settings.sharing'),
        items: [
          {
            id: 'copy-profile-link',
            label: t('settings.copyProfileLink'),
            onPress: handleCopyProfileLink,
            linkType: 'none',
          },
        ],
      },
      {
        id: 'privacy',
        title: t('settings.privacy'),
        items: [
          {
            id: 'blocked-users',
            label: t('settings.blockedAccounts'),
            onPress: () => router.navigate('/settings/blocked'),
            linkType: 'internal',
          },
          {
            id: 'muted-users',
            label: t('settings.mutedAccounts'),
            onPress: () => router.navigate('/settings/muted'),
            linkType: 'internal',
          },
        ],
      },
      {
        id: 'app-settings',
        title: t('settings.appSettings'),
        items: [
          {
            id: 'profile-feed-view',
            label: t('settings.defaultFeedLayout'),
            icon: 'grid',
            onPress: () => feedViewMenuRef.current?.show(),
            linkType: 'none',
          },
          {
            id: 'app-icon',
            label: t('settings.appIcon'),
            icon: 'device-tv',
            onPress: () => router.navigate('/settings/app-icon'),
            linkType: 'internal',
          },
          {
            id: 'content-filters',
            label: t('settings.contentFilters'),
            icon: 'external-link',
            onPress: () => handleOpenLink('https://bsky.app/moderation'),
            linkType: 'external',
          },
          // {
          //   id: 'data-usage',
          //   label: 'Data Usage',
          //   icon: 'radio-signal',
          //   onPress: () => handlePlaceholderAction('Data Usage'),
          //   showChevron: true
          // }
        ],
      },
      {
        id: 'labs',
        title: t('settings.labs'),
        items: [],
      },
      {
        id: 'troubleshooting',
        title: t('settings.troubleshooting'),
        items: [
          {
            id: 'clear-cache',
            label: t('settings.clearCache'),
            onPress: handleClearCache,
            linkType: 'none',
          },
          {
            id: 'support',
            label: t('settings.support'),
            onPress: () => handleOpenEmail('support@getorbyt.com'),
            linkType: 'none',
          },
        ],
      },
      {
        id: 'community',
        title: t('settings.community'),
        items: [
          {
            id: 'ideas',
            label: t('settings.ideasAndRequests'),
            icon: 'message-circle',
            onPress: () => router.navigate('/settings/community'),
            linkType: 'internal',
          },
        ],
      },
      {
        id: 'about',
        title: t('settings.about'),
        items: [
          {
            id: 'website',
            label: t('settings.website'),
            onPress: () => handleOpenLink('https://getorbyt.com'),
            linkType: 'external',
          },
          {
            id: 'forum',
            label: t('settings.forum'),
            onPress: () => handleOpenLink('https://community.getorbyt.com'),
            linkType: 'external',
          },
          {
            id: 'privacy',
            label: t('settings.privacyPolicy'),
            onPress: () => handleOpenLink('https://getorbyt.com/privacy'),
            linkType: 'external',
          },
          {
            id: 'terms',
            label: t('settings.termsOfService'),
            onPress: () => handleOpenLink('https://getorbyt.com/terms'),
            linkType: 'external',
          },
        ],
      },
      {
        id: 'accounts',
        title: t('settings.accounts'),
        items: [
          {
            id: 'switch-account',
            label:
              savedAccounts.length > 1 ? t('settings.switchAccount') : t('settings.addAccount'),
            icon: 'user',
            onPress: () => {
              router.dismiss();
              // Ensure modal close animation completes before presenting account switcher
              // Account switcher will show "Add Account" options by default if only one account
              setTimeout(() => presentAccountSwitcher(), 350);
            },
            linkType: 'none',
          },
          {
            id: 'logout',
            label: t('settings.logOut'),
            onPress: handleLogout,
            linkType: 'none',
          },
          {
            id: 'remove-account',
            label:
              savedAccounts.length > 1 ? t('settings.removeAccounts') : t('settings.removeAccount'),
            onPress: handleRemoveAccount,
            linkType: 'none',
            destructive: true,
          },
        ],
      },
    ],
    [
      t,
      router,
      handleLogout,
      handleOpenEmail,
      handleOpenLink,
      handleRemoveAccount,
      handleCopyProfileLink,
      handleClearCache,
      feedViewMenuRef,
      presentAccountSwitcher,
      savedAccounts,
    ]
  );

  type ListRow =
    | { kind: 'section-title'; id: string; title: string }
    | {
        kind: 'setting';
        id: string;
        label: string;
        linkType?: 'internal' | 'external' | 'none';
        onPress: () => void;
        rightIcon?: React.ReactNode;
        destructive?: boolean;
      }
    | {
        kind: 'toggle';
        id: string;
        label: string;
        subtitle?: string;
        value: boolean;
        onValueChange: (v: boolean) => void;
      }
    | { kind: 'spacer'; id: string; height?: number }
    | { kind: 'footer'; id: string };

  const listData = useMemo<ListRow[]>(() => {
    const data: ListRow[] = [];
    // eslint-disable-next-line react-hooks/refs
    settingsSections.forEach(section => {
      if (section.items.length === 0) return;
      if (section.title) {
        data.push({ kind: 'section-title', id: `title-${section.id}`, title: section.title });
      }
      (section.items as SettingItem[]).forEach((item: SettingItem) => {
        data.push({
          kind: 'setting',
          id: item.id,
          label: item.label,
          linkType: item.linkType,
          onPress: item.onPress,
          rightIcon: item.rightIcon,
          destructive: item.destructive,
        });
      });
    });
    data.push({ kind: 'footer', id: 'footer' });
    return data;
  }, [settingsSections]);

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title={t('settings.title')}
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={Platform.OS === 'android'}
        backgroundColor={Colors.transparent}
      />
      <ScrollView
        contentContainerStyle={settingsLayoutStyles.settingsRootScrollContent}
        showsVerticalScrollIndicator={true}
      >
        {listData.map((item, index) => {
          const key = `${item.kind}-${item.id}-${index}`;
          switch (item.kind) {
            case 'section-title':
              return (
                <View key={key} style={settingsLayoutStyles.section}>
                  <Text style={settingsTextStyles.sectionTitle}>{item.title}</Text>
                </View>
              );
            case 'setting':
              if (item.id === 'profile-feed-view') {
                const feedViewActions: MenuAction[] = [
                  {
                    id: 'list',
                    title: t('feed.listView'),
                    state: profileFeedViewMode === 'list' ? 'on' : 'off',
                  },
                  {
                    id: 'grid',
                    title: t('feed.gridView'),
                    state: profileFeedViewMode === 'grid' ? 'on' : 'off',
                  },
                ];
                return (
                  <MenuView
                    key={key}
                    ref={feedViewMenuRef}
                    title=""
                    actions={feedViewActions}
                    shouldOpenOnLongPress={false}
                    themeVariant="dark"
                    onPressAction={({ nativeEvent }: { nativeEvent: { event?: string } }) => {
                      const mode = nativeEvent?.event as ViewMode;
                      if (mode === 'list' || mode === 'grid') {
                        handleFeedViewModeChange(mode);
                      }
                    }}
                  >
                    <OptionsButton
                      label={item.label}
                      onPress={item.onPress}
                      linkType="internal"
                      destructive={item.destructive}
                      disabled={isSubmitting}
                      style={SHEET_VERTICAL_LIST_ROW_OUTER}
                      rightIcon={
                        profileFeedViewMode === 'grid' ? (
                          <GridViewIcon size={20} color={Colors.neutral[200]} />
                        ) : (
                          <ListViewIcon size={20} color={Colors.neutral[200]} />
                        )
                      }
                    />
                  </MenuView>
                );
              }
              return (
                <OptionsButton
                  key={key}
                  label={item.label}
                  onPress={item.onPress}
                  linkType={item.linkType}
                  destructive={item.destructive}
                  disabled={isSubmitting}
                  style={SHEET_VERTICAL_LIST_ROW_OUTER}
                  rightIcon={
                    item.id === 'copy-profile-link' && isProfileLinkCopied ? (
                      <Icon name="check" size={18} color={Colors.teal[300]} />
                    ) : (
                      item.rightIcon
                    )
                  }
                />
              );
            case 'toggle':
              return (
                <OptionsButton
                  key={key}
                  label={item.label}
                  subtitle={item.subtitle}
                  showSwitch={true}
                  switchValue={item.value}
                  onSwitchChange={item.onValueChange}
                  style={SHEET_VERTICAL_LIST_ROW_OUTER}
                />
              );
            case 'spacer':
              return <View key={key} style={{ height: item.height || 12 }} />;
            case 'footer':
              return (
                <View key={key} style={styles.footer}>
                  <View style={styles.footerContent}>
                    <View style={styles.footerHeartContainer}>
                      <Text style={styles.footerSubtext}>{t('settings.builtWith')}</Text>
                      <Icon name="heart" size={18} color={Colors.coral[400]} />
                      <Text style={styles.footerSubtext}>{t('settings.forCommunity')}</Text>
                    </View>
                    <NativePressable onPress={handleVersionPress}>
                      <Text style={styles.versionText}>v{formattedVersion}</Text>
                    </NativePressable>
                  </View>
                </View>
              );

            default:
              return null;
          }
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    marginTop: 12,
    marginBottom: 8,
  },
  footerContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerSubtext: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  footerHeartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  versionText: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
});

export default SettingsScreen;
