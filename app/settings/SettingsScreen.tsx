import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  Linking,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import Icon from '../../src/components/ui/Icon';
import { getBuildVersion, getUpdateVersion, getFormattedVersion } from '../../src/utils/version';
import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';
import { OptionsButton } from '../../src/components/ui/OptionsButton';
import {
  useFeedSettings,
  useAuth,
  useCurrentUser,
  useUserStore,
  useAccountManagement,
} from '../../src/stores/userStore';
import { settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import ProfileService from '../../src/services/data/ProfileService';
import ChannelService from '../../src/services/data/ChannelService';
import { getOrbytProfileUrl } from '../../src/utils/links/bluesky';

const SettingsScreen: React.FC = () => {
  const router = useRouter();
  const onLogout = useAuth().signOut;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExperimentalFeedsEnabled, setIsExperimentalFeedsEnabled] = useState(true);
  const [isNativeTabsEnabled, setIsNativeTabsEnabled] = useState(false);
  const [isProfileLinkCopied, setIsProfileLinkCopied] = useState(false);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const {
    getExperimentalFeedsEnabled,
    setExperimentalFeedsEnabled,
    getNativeTabsEnabled,
    setNativeTabsEnabled,
  } = useFeedSettings();
  const { currentUser } = useCurrentUser();
  const { isDeveloper } = useUserStore();
  const { savedAccounts } = useAccountManagement();

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const experimentalFeedsEnabled = await getExperimentalFeedsEnabled();
        const nativeTabsEnabled = await getNativeTabsEnabled();
        setIsExperimentalFeedsEnabled(experimentalFeedsEnabled);
        setIsNativeTabsEnabled(nativeTabsEnabled);
      } catch (_error) {
        // Intentionally ignore setting load failures
      }
    };
    loadSettings();
  }, [getExperimentalFeedsEnabled, getNativeTabsEnabled]);

  const handleLogout = async () => {
    if (isSubmitting) return;

    Alert.alert('Log out', 'Are you sure you want to log out?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Log out',
        style: 'default',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            // Use userStore to handle logout without removing accounts (clearAllAccounts = false)
            await onLogout(false);
          } catch (_error) {
            Alert.alert('Error', 'Failed to log out. Please try again.');
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleRemoveAccount = async () => {
    if (isSubmitting) return;

    const hasMultipleAccounts = savedAccounts.length > 1;
    const title = hasMultipleAccounts ? 'Remove accounts?' : 'Remove account?';
    const message = hasMultipleAccounts
      ? 'This will remove all accounts from this device. You will need to sign in again.'
      : 'You will need to sign in again.';
    const confirmLabel = hasMultipleAccounts ? 'Remove accounts' : 'Remove account';

    Alert.alert(title, message, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            // Use userStore to handle account removal (clearAllAccounts = true)
            await onLogout(true);
          } catch (_error) {
            Alert.alert('Error', 'Failed to remove account. Please try again.');
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleCopyProfileLink = async () => {
    if (!currentUser?.handle && !currentUser?.did) {
      Alert.alert('Error', 'Unable to get your profile information.');
      return;
    }

    try {
      const profileUrl = getOrbytProfileUrl(
        currentUser?.handle || undefined,
        currentUser?.did || undefined
      );
      await Clipboard.setStringAsync(profileUrl);
      setIsProfileLinkCopied(true);
      // Reset the copied state after 4 seconds
      setTimeout(() => {
        setIsProfileLinkCopied(false);
      }, 4000);
    } catch (_error) {
      // Ignore clipboard errors
    }
  };

  const handleToggleExperimentalFeeds = async (value: boolean) => {
    try {
      await setExperimentalFeedsEnabled(value);
      setIsExperimentalFeedsEnabled(value);

      // Invalidate queries that depend on experimental feeds setting
      queryClient.invalidateQueries({ queryKey: ['suggestedFeeds'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedSearch'] });
    } catch (_error) {
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const handleToggleNativeTabs = async (value: boolean) => {
    // Optimistically update UI immediately
    const previousValue = isNativeTabsEnabled;
    setIsNativeTabsEnabled(value);

    try {
      await setNativeTabsEnabled(value);
    } catch (_error) {
      // Revert on error
      setIsNativeTabsEnabled(previousValue);
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear app cache',
      'This will clear all cached data including profiles, channels, and other app data. You may need to reload some content.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear Cache',
          style: 'default',
          onPress: async () => {
            try {
              // Clear all caches
              await Promise.all([ProfileService.clearCache(), ChannelService.clearCache()]);

              // Clear React Query cache
              queryClient.clear();

              Alert.alert('Success', 'App cache has been cleared successfully.');
            } catch (_error) {
              // Ignore cache clear failures
            }
          },
        },
      ]
    );
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleOpenEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`).catch(() => {});
  };

  const formattedVersion = getFormattedVersion();
  const buildVersion = getBuildVersion();
  const updateVersion = getUpdateVersion();

  const handleVersionPress = () => {
    if (__DEV__) {
      Alert.alert('Version Info', 'Updates are disabled in development mode.');
      return;
    }

    try {
      const updateId = Updates.updateId || 'N/A';
      const channel = Updates.channel || 'N/A';
      const groupId =
        (Constants.manifest2?.metadata as { updateGroup?: string })?.updateGroup || 'N/A';

      // Build detailed version message
      const buildInfo = `Build Version: ${buildVersion}`;
      const updateInfo = updateVersion ? `Update Version: ${updateVersion}` : 'Update Version: N/A';
      const updateDetails = `Update ID: ${updateId}\nChannel: ${channel}`;
      const groupInfo = `Group ID: ${groupId}`;

      const message = `${buildInfo}\n${updateInfo}\n\n${updateDetails}\n${groupInfo}`;

      Alert.alert('Version Information', message, [
        {
          text: 'Copy Version',
          onPress: async () => {
            await Clipboard.setStringAsync(formattedVersion);
            Alert.alert('Copied', 'Version copied to clipboard');
          },
        },
        {
          text: 'Copy Update ID',
          onPress: async () => {
            await Clipboard.setStringAsync(updateId);
            Alert.alert('Copied', 'Update ID copied to clipboard');
          },
        },
        {
          text: 'OK',
          style: 'default',
        },
      ]);
    } catch (_error) {
      Alert.alert('Error', 'Unable to get update information.');
    }
  };

  const settingsSections = [
    {
      title: '', // No title for profile section
      items: [
        {
          id: 'followers',
          label: 'Your followers',
          icon: 'users',
          onPress: () => router.push('/settings/followers'),
          showChevron: false,
        },
        {
          id: 'following',
          label: 'People you follow',
          icon: 'user-plus',
          onPress: () => router.push('/settings/following'),
          showChevron: false,
        },
        {
          id: 'saves',
          label: 'Your saves',
          icon: 'bookmark',
          onPress: () => router.push('/settings/saves'),
          showChevron: false,
        },
        {
          id: 'watched',
          label: 'Watched videos',
          icon: 'eye',
          onPress: () => router.push('/settings/watched'),
          showChevron: false,
        },
      ],
    },
    {
      title: 'Sharing',
      items: [
        {
          id: 'copy-profile-link',
          label: 'Copy your profile link',
          icon: 'link',
          onPress: handleCopyProfileLink,
          showChevron: false,
        },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          id: 'blocked-users',
          label: 'Blocked accounts',
          onPress: () => router.push('/settings/blocked'),
          showChevron: false,
        },
        {
          id: 'muted-users',
          label: 'Muted accounts',
          onPress: () => router.push('/settings/muted'),
          showChevron: false,
        },
      ],
    },
    {
      title: 'App Settings',
      items: [
        {
          id: 'content-filters',
          label: 'Content filters',
          icon: 'filter',
          onPress: () => router.push('/settings/content-filters'),
          showChevron: true,
        },
        {
          id: 'algorithmic-feed',
          label: 'Your mix',
          icon: 'sparkles',
          onPress: () => router.push('/settings/algorithmic-feed'),
          showChevron: true,
        },
        ...(isDeveloper
          ? [
              {
                id: 'app-icon',
                label: 'App icon',
                icon: 'device-tv',
                onPress: () => router.push('/settings/app-icon'),
                showChevron: true,
              },
            ]
          : []),
        ...(__DEV__
          ? [
              {
                id: 'route-navigator',
                label: 'Route Navigator',
                icon: 'information-line',
                onPress: () => router.push('/settings/route-navigator'),
                showChevron: true,
              },
            ]
          : []),
        // {
        //   id: 'experimental-feeds',
        //   label: 'Experimental Feeds',
        //   icon: 'lightbulb',
        //   onPress: () => handlePlaceholderAction('Experimental Feeds'),
        //   showChevron: true
        // },
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
      title: 'Labs',
      items: [],
    },
    {
      title: 'Troubleshooting',
      items: [
        {
          id: 'clear-cache',
          label: 'Clear cache',
          onPress: handleClearCache,
          showChevron: false,
        },
        {
          id: 'support',
          label: 'Support',
          onPress: () => handleOpenEmail('support@getorbyt.com'),
          showChevron: true,
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          id: 'website',
          label: 'Website',
          onPress: () => handleOpenLink('https://getorbyt.com'),
          showChevron: true,
        },
        {
          id: 'privacy',
          label: 'Privacy policy',
          onPress: () => handleOpenLink('https://getorbyt.com/privacy'),
          showChevron: true,
        },
        {
          id: 'terms',
          label: 'Terms of service',
          onPress: () => handleOpenLink('https://getorbyt.com/terms'),
          showChevron: true,
        },
      ],
    },
    {
      title: 'Accounts',
      items: [
        {
          id: 'switch-account',
          label: savedAccounts.length > 1 ? 'Switch account' : 'Add an account',
          icon: 'user',
          onPress: () => {
            router.back();
            // Ensure modal close animation completes before presenting account switcher
            // Account switcher will show "Add Account" options by default if only one account
            setTimeout(() => presentAccountSwitcher(), 350);
          },
          showChevron: false,
        },
        {
          id: 'logout',
          label: 'Log out',
          onPress: handleLogout,
          showChevron: false,
        },
        {
          id: 'remove-account',
          label: savedAccounts.length > 1 ? 'Remove accounts' : 'Remove account',
          onPress: handleRemoveAccount,
          showChevron: false,
          destructive: true,
        },
      ],
    },
  ];

  // Build flat list data for FlashList
  type SettingItem = {
    id: string;
    label: string;
    onPress: () => void;
    showChevron?: boolean;
    icon?: string;
    destructive?: boolean;
  };

  type ListRow =
    | { kind: 'section-title'; id: string; title: string }
    | {
        kind: 'setting';
        id: string;
        label: string;
        showChevron?: boolean;
        onPress: () => void;
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

  const listData: ListRow[] = [];

  settingsSections.forEach(section => {
    // Only add section title if it's not empty
    if (section.title) {
      listData.push({ kind: 'section-title', id: `title-${section.title}`, title: section.title });
    }

    section.items.forEach((item: SettingItem) => {
      listData.push({
        kind: 'setting',
        id: item.id,
        label: item.label,
        showChevron: item.showChevron,
        onPress: item.onPress,
        destructive: item.destructive,
      });
    });

    if (section.title === 'Labs') {
      listData.push({
        kind: 'toggle',
        id: 'experimental-feeds',
        label: 'Experimental feeds',
        subtitle: 'Show non-video feeds',
        value: isExperimentalFeedsEnabled,
        onValueChange: handleToggleExperimentalFeeds,
      });
      listData.push({
        kind: 'toggle',
        id: 'native-tabs',
        label: 'New tabs layout',
        subtitle: 'Use native navigation bar',
        value: isNativeTabsEnabled,
        onValueChange: handleToggleNativeTabs,
      });
    }
  });

  // Add footer with version and built with love message
  listData.push({
    kind: 'footer',
    id: 'footer',
  });

  return (
    <View style={[settingsLayoutStyles.container, { backgroundColor: Colors.black }]}>
      <ListHeader
        mode="sheet"
        title="Settings"
        showCloseButton
        onClosePress={() => router.back()}
        applySafeAreaTop={Platform.OS === 'android'}
        backgroundColor={Colors.black}
        titleIndent={true}
      />
      <ScrollView
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
        showsVerticalScrollIndicator={false}
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
              return (
                <OptionsButton
                  key={key}
                  label={item.label}
                  onPress={item.onPress}
                  showChevron={item.showChevron}
                  destructive={item.destructive}
                  disabled={isSubmitting}
                  rightIcon={
                    item.id === 'copy-profile-link' && isProfileLinkCopied ? (
                      <Icon name="check" size={24} color={Colors.lightGreen} />
                    ) : undefined
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
                />
              );
            case 'spacer':
              return <View key={key} style={{ height: item.height || 12 }} />;
            case 'footer':
              return (
                <View key={key} style={styles.footer}>
                  <View style={styles.footerContent}>
                    <View style={styles.footerHeartContainer}>
                      <Text style={styles.footerSubtext}>built with </Text>
                      <Icon name="heart" size={18} color={Colors.lightRed} />
                      <Text style={styles.footerSubtext}> for the community</Text>
                    </View>
                    <TouchableOpacity onPress={handleVersionPress} activeOpacity={0.7}>
                      <Text style={styles.versionText}>v{formattedVersion}</Text>
                    </TouchableOpacity>
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
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
  footerHeartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  versionText: {
    color: Colors.mediumGray,
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
  },
});

export default SettingsScreen;
