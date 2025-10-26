import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  Switch,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import ListHeader from '../../src/components/ui/ListHeader';
import { useFeedSettings, useAuth, useCurrentUser, useUserStore, useAccountManagement } from '../../src/stores/userStore';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { AtprotoService } from '../../src/services/api/AtprotoService';
import { ModerationService } from '../../src/services/ModerationService';
import { ModerationSettings, LabelPreference } from '../../src/services/ModerationTypes';
import { CommonErrorHandlers } from '../../src/utils/errorHandler';
import { useProfile } from '../../src/services/cache/ProfileCache';
import { useChannelColors } from '../../src/services/cache/ChannelCache';
import { useGlobalAccountSwitcher } from '../../src/hooks/useGlobalModals';
import ProfileCache from '../../src/services/cache/ProfileCache';
import ChannelCache from '../../src/services/cache/ChannelCache';
import { clearVideoCache, clearThumbnailColorCache } from '../../src/utils/helpers/video';
 



declare let window: any;

const SettingsScreen: React.FC = () => {
  const navigation = useRouter();
  const onLogout = useAuth().signOut;
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExperimentalFeedsEnabled, setIsExperimentalFeedsEnabled] = useState(true);
  const [isProfileLinkCopied, setIsProfileLinkCopied] = useState(false);
  const { presentAccountSwitcher } = useGlobalAccountSwitcher();
  const insets = useSafeAreaInsets();
  const { getExperimentalFeedsEnabled, setExperimentalFeedsEnabled } = useFeedSettings();
  const { currentUser } = useCurrentUser();
  const { isDeveloper } = useUserStore();
  const { savedAccounts } = useAccountManagement();

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const enabled = await getExperimentalFeedsEnabled();
        setIsExperimentalFeedsEnabled(enabled);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleLogout = async () => {
    if (isSubmitting) return;
    
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
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
            } catch (error) {
              console.error('error during logout:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleRemoveAccount = async () => {
    if (isSubmitting) return;
    
    Alert.alert(
      'Are you sure?',
      'You will need to sign in again',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove Account',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // Use userStore to handle account removal (clearAllAccounts = true)
              await onLogout(true);
            } catch (error) {
              console.error('error during account removal:', error);
              Alert.alert('Error', 'Failed to remove account. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handlePlaceholderAction = (action: string) => {
    Alert.alert('coming soon', `${action.toLowerCase()} will be available in a future update.`);
  };

  const handleCopyProfileLink = async () => {
    if (!currentUser?.handle) {
      Alert.alert('Error', 'Unable to get your profile information.');
      return;
    }

    try {
      const profileUrl = `https://bsky.app/profile/${currentUser.handle}`;
      await Clipboard.setStringAsync(profileUrl);
      setIsProfileLinkCopied(true);
      // Reset the copied state after 4 seconds
      setTimeout(() => {
        setIsProfileLinkCopied(false);
      }, 4000);
    } catch (error) {
      console.error('Error copying profile link:', error);
      Alert.alert('Error', 'Failed to copy profile link. Please try again.');
    }
  };



  const handleToggleExperimentalFeeds = async (value: boolean) => {
    try {
      await setExperimentalFeedsEnabled(value);
      setIsExperimentalFeedsEnabled(value);
      
      // Invalidate queries that depend on experimental feeds setting
      queryClient.invalidateQueries({ queryKey: ['suggestedFeeds'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedSearch'] });
    } catch (error) {
      console.error('error saving experimental feeds setting:', error);
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
              await Promise.all([
                ProfileCache.clearCache(),
                ChannelCache.clearCache(),
              ]);
              
              // Clear video and thumbnail caches
              clearVideoCache();
              clearThumbnailColorCache();
              
              // Clear React Query cache
              queryClient.clear();
              
              Alert.alert('Success', 'App cache has been cleared successfully.');
            } catch (error) {
              console.error('Error clearing cache:', error);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          },
        },
      ]
    );
  };




  const settingsSections = [
    {
      title: '', // No title for profile section
      items: [
        {
          id: 'switch-account',
          label: 'Switch account',
          icon: 'user',
          onPress: () => {
            navigation.back();
            setTimeout(() => presentAccountSwitcher(), 100);
          },
          showChevron: true
        },
        // Only show insights for developers
        ...(isDeveloper ? [{
          id: 'insights',
          label: 'Insights',
          icon: 'insights',
          onPress: () => {
            navigation.back();
            setTimeout(() => navigation.push('/insights'), 100);
          },
          showChevron: true
        }] : []),
        {
          id: 'followers',
          label: 'Your followers',
          icon: 'users',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/followers'), 100);
            },
          showChevron: true
        },
        {
          id: 'following',
          label: 'People you follow',
          icon: 'user-plus',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/following'), 100);
            },
          showChevron: true
        },
        {
          id: 'channels',
          label: 'Your channels',
          icon: 'device-tv',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/channels'), 100);
            },
          showChevron: true
        }
      ]
    },
    {
      title: 'Sharing',
      items: [
        {
          id: 'copy-profile-link',
          label: 'Copy your profile link',
          icon: 'link',
          onPress: handleCopyProfileLink,
          showChevron: false
        }
      ]
    },
    {
      title: 'Privacy',
      items: [
        {
          id: 'blocked-users',
          label: 'Blocked accounts',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/blocked'), 100);
            },
          showChevron: true
        },
        {
          id: 'muted-users',
          label: 'Muted accounts',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/muted'), 100);
            },
          showChevron: true
        },
      ]
    },
    {
      title: 'Content',
      items: [
        {
          id: 'content-filters',
          label: 'Content filters',
          icon: 'filter',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/content-filters'), 100);
            },
          showChevron: true
        },

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
      ]
    },
    {
      title: 'App',
      items: [
        // Only show color palette for developers
        ...(isDeveloper ? [{
          id: 'color-palette',
          label: 'Color palette',
          icon: 'color-picker-fill',
          onPress: () => {
            navigation.back();
            setTimeout(() => navigation.push('/settings/color-palette'), 100);
          },
          showChevron: true
        }] : []),
        {
          id: 'clear-cache',
          label: 'Clear app cache',
          onPress: handleClearCache,
          showChevron: false
        },
        {
          id: 'about',
          label: 'About orbyt',
          icon: 'device-tv',
                      onPress: () => {
              navigation.back();
              setTimeout(() => navigation.push('/settings/about'), 100);
            },
          showChevron: true
        },
        // {
        //   id: 'help',
        //   label: 'Help & Support',
        //   icon: 'headset',
        //   onPress: () => handlePlaceholderAction('Help & Support'),
        //   showChevron: true
        // },
        // {
        //   id: 'feedback',
        //   label: 'Send Feedback',
        //   icon: 'message-text',
        //   onPress: () => handlePlaceholderAction('Send Feedback'),
        //   showChevron: true
        // }
      ]
    },

  ];

  // Build flat list data for FlashList
  type ListRow =
    | { kind: 'section-title'; id: string; title: string }
    | { kind: 'setting'; id: string; label: string; showChevron?: boolean; onPress: () => void; destructive?: boolean }
    | { kind: 'toggle'; id: string; label: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void };

  const listData: ListRow[] = [];

  settingsSections.forEach((section) => {
    // Only add section title if it's not empty
    if (section.title) {
      listData.push({ kind: 'section-title', id: `title-${section.title}`, title: section.title });
    }

    section.items.forEach((item) => {
      listData.push({
        kind: 'setting',
        id: (item as any).id,
        label: (item as any).label,
        showChevron: (item as any).showChevron,
        onPress: (item as any).onPress,
      });
    });

    if (section.title === 'Content') {
      listData.push({
        kind: 'toggle',
        id: 'experimental-feeds',
        label: 'Experimental feeds',
        subtitle: 'Show non-video feeds',
        value: isExperimentalFeedsEnabled,
        onValueChange: handleToggleExperimentalFeeds,
      });
    }
  });

  // Add logout and remove account rows at the end
  listData.push({
    kind: 'setting',
    id: 'logout',
    label: 'Log out',
    showChevron: false,
    onPress: handleLogout,
    destructive: false,
  });

  listData.push({
    kind: 'setting',
    id: 'remove-account',
    label: savedAccounts.length > 1 ? 'Remove Accounts' : 'Remove Account',
    showChevron: false,
    onPress: handleRemoveAccount,
    destructive: true,
  });

  return (
    <View style={[settingsLayoutStyles.container, { backgroundColor: Colors.black }]}>
      <ScrollView
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
        showsVerticalScrollIndicator={false}
      >
        <ListHeader 
          mode="sheet"
          title="Settings"
          showCloseButton
                      onClosePress={() => navigation.back()}
          applySafeAreaTop={false}
          style={{ marginHorizontal: -5 }}
        />
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
                <View key={key} style={{ marginBottom: 0 }}>
                  <TouchableOpacity
                    style={[
                      settingsButtonStyles.menuOption,
                      item.destructive ? { backgroundColor: Colors.red } : null,
                    ]}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    <View style={styles.menuOptionLeft}>
                      <Text style={[
                        settingsTextStyles.menuOptionText,
                        item.destructive ? { color: Colors.darkGray } : null,
                      ]}>
                        {item.label}
                      </Text>
                    </View>
                    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                      {item.id === 'copy-profile-link' && isProfileLinkCopied ? (
                        <Icon name="check" size={24} color={Colors.lightGreen} />
                      ) : item.showChevron ? (
                        <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            case 'toggle':
              return (
                <View key={key} style={{ marginBottom: 0 }}>
                  <View style={settingsButtonStyles.menuOption}>
                    <View style={styles.menuOptionLeft}>
                      <Text style={settingsTextStyles.menuOptionText}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={settingsTextStyles.menuOptionSubtitle}>{item.subtitle}</Text>
                      ) : null}
                    </View>
                    <Switch
                      value={item.value}
                      onValueChange={item.onValueChange}
                      trackColor={{ false: Colors.mediumGray, true: Colors.lightGreen }}
                      thumbColor={item.value ? Colors.white : Colors.lightGray}
                      ios_backgroundColor={Colors.mediumGray}
                    />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: -5,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    backgroundColor: Colors.black,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 22,
    fontFamily: 'Firma-Bold',
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  optionsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginHorizontal: 0,
  },
  menuOptionLeft: {
    flexDirection: 'column',
    flex: 1,
  },

});

export default SettingsScreen;