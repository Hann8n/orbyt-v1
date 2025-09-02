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
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/ui/Icon';
import { Colors } from '../../components/ui/UI';
import ListHeader from '../../components/ui/ListHeader';
import { useFeedSettings, useAuth, useCurrentUser } from '../../stores/userStore';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, useLogout } from '../../navigation/types';
import AccountSwitcher from '../../components/features/profile/AccountSwitcher';

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;
type SettingsScreenRouteProp = RouteProp<RootStackParamList, 'Settings'>;

declare let window: any;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const route = useRoute<SettingsScreenRouteProp>();
  const onLogout = useLogout();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExperimentalFeedsEnabled, setIsExperimentalFeedsEnabled] = useState(true);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const insets = useSafeAreaInsets();
  const { getExperimentalFeedsEnabled, setExperimentalFeedsEnabled } = useFeedSettings();
  const { currentUser } = useCurrentUser();

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
      await Clipboard.setString(profileUrl);
      Alert.alert('Copied!', 'Your profile link has been copied to clipboard.');
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

  const handleAccountSwitch = async (account: any) => {
    try {
      // Account switching is handled by the AccountSwitcher component
      // This callback is called when account switch is successful
      console.log('Account switched to:', account.handle);
    } catch (error) {
      console.error('Error in account switch callback:', error);
    }
  };



  const settingsSections = [
    {
      title: '', // No title for profile section
      items: [
        {
          id: 'switch-account',
          label: 'Switch account',
          icon: 'user',
          onPress: () => setShowAccountSwitcher(true),
          showChevron: true
        },
        {
          id: 'insights',
          label: 'Insights',
          icon: 'insights',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate({ name: 'Insights', params: {} }), 100);
          },
          showChevron: true
        },
        {
          id: 'followers',
          label: 'Your followers',
          icon: 'users',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate('Followers'), 100);
          },
          showChevron: true
        },
        {
          id: 'following',
          label: 'People you follow',
          icon: 'user-plus',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate('Following'), 100);
          },
          showChevron: true
        },
        {
          id: 'channels',
          label: 'Your channels',
          icon: 'device-tv',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate('ChannelManagement'), 100);
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
            navigation.goBack();
            setTimeout(() => navigation.navigate('BlockedUsers'), 100);
          },
          showChevron: true
        },
        {
          id: 'muted-users',
          label: 'Muted accounts',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate('MutedUsers'), 100);
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
            navigation.goBack();
            setTimeout(() => navigation.navigate('ContentFilters'), 100);
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
        {
          id: 'color-palette',
          label: 'Color palette',
          icon: 'color-picker-fill',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate('ColorPalette'), 100);
          },
          showChevron: true
        },
        {
          id: 'about',
          label: 'About orbyt',
          icon: 'device-tv',
          onPress: () => {
            navigation.goBack();
            setTimeout(() => navigation.navigate('About'), 100);
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
    | { kind: 'setting'; id: string; label: string; showChevron?: boolean; onPress: () => void }
    | { kind: 'toggle'; id: string; label: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void }
    | { kind: 'logout'; id: 'logout' }; // This is actually "remove account" now

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

  // Add remove account row at the end
  listData.push({ kind: 'logout', id: 'logout' });

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
          onClosePress={() => navigation.goBack()}
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
                <View key={key} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    style={settingsButtonStyles.menuOption}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    <View style={styles.menuOptionLeft}>
                      <Text style={settingsTextStyles.menuOptionText}>{item.label}</Text>
                    </View>
                    {item.showChevron && (
                      <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            case 'toggle':
              return (
                <View key={key} style={{ marginBottom: 12 }}>
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
            case 'logout':
              return (
                <View key={key} style={settingsLayoutStyles.logoutSection}>
                  <TouchableOpacity
                    style={settingsButtonStyles.logoutButton}
                    onPress={handleRemoveAccount}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    <Text style={settingsTextStyles.logoutButtonText}>Remove Account</Text>
                  </TouchableOpacity>
                </View>
              );
            default:
              return null;
          }
        })}
      </ScrollView>

      {/* Account Switcher Modal */}
      <AccountSwitcher
        visible={showAccountSwitcher}
        onDismiss={() => setShowAccountSwitcher(false)}
        onAccountSwitch={handleAccountSwitch}
        onAddAccount={async () => {
          setShowAccountSwitcher(false);
          // Navigate to login to add new account
          await onLogout(false);
        }}
        onLogout={onLogout}
      />
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