import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, useLogout } from '../../navigation/types';
import Icon, { BackArrowIcon } from '../../components/ui/Icon';
import ListHeader from '../../components/ui/ListHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModerationDebug from '../../components/features/moderation/ModerationDebug';
import AccountManager from '../../services/storage/AccountManager';
 

// global flag for immediate effect without re-mounts
declare global {
  // eslint-disable-next-line no-var
  var __ORBYT_FEED_DEBUG_OVERLAY__: boolean | undefined;
}
import { useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../components/ui/UI';

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
  const [isFeedDebugEnabled, setIsFeedDebugEnabled] = useState<boolean>(false);
  const insets = useSafeAreaInsets();

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const enabled = await AccountManager.getExperimentalFeedsEnabled();
        setIsExperimentalFeedsEnabled(enabled);
        const debugEnabled = await AccountManager.getFeedDebugOverlayEnabled();
        setIsFeedDebugEnabled(debugEnabled);
        // set global for immediate effect
        (global as any).__ORBYT_FEED_DEBUG_OVERLAY__ = debugEnabled;
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleLogout = async () => {
    if (isSubmitting) return;
    
    Alert.alert(
      'log out',
      'are you sure you want to log out?',
      [
        {
          text: 'cancel',
          style: 'cancel',
        },
        {
          text: 'log out',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await onLogout();
            } catch (error) {
              console.error('error during logout:', error);
              Alert.alert('error', 'failed to log out. please try again.');
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



  const handleToggleExperimentalFeeds = async (value: boolean) => {
    try {
      await AccountManager.setExperimentalFeedsEnabled(value);
      setIsExperimentalFeedsEnabled(value);
      
      // Invalidate queries that depend on experimental feeds setting
      queryClient.invalidateQueries({ queryKey: ['suggestedFeeds'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedSearch'] });
    } catch (error) {
      console.error('error saving experimental feeds setting:', error);
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const handleToggleFeedDebug = async (value: boolean) => {
    try {
      await AccountManager.setFeedDebugOverlayEnabled(value);
      setIsFeedDebugEnabled(value);
      // set global for immediate effect
      (global as any).__ORBYT_FEED_DEBUG_OVERLAY__ = value;
    } catch (error) {
      console.error('error saving feed debug overlay setting:', error);
      Alert.alert('error', 'failed to save setting. please try again.');
    }
  };

  const settingsSections = [
    {
      title: 'account',
      items: [
        
        {
          id: 'channels',
          label: 'manage channels',
          icon: 'device-tv',
          onPress: () => navigation.navigate('ChannelManagement'),
          showChevron: true
        },
        {
          id: 'insights',
          label: 'insights',
          icon: 'insights',
          onPress: () => navigation.navigate({ name: 'Insights', params: {} }),
          showChevron: true
        },
        // {
        //   id: 'notifications',
        //   label: 'Notifications',
        //   icon: 'notification',
        //   onPress: () => handlePlaceholderAction('Notifications'),
        //   showChevron: true
        // }
      ]
    },
    {
      title: 'privacy',
      items: [
        {
          id: 'blocked-users',
          label: 'blocked accounts',
          onPress: () => navigation.navigate('BlockedUsers'),
          showChevron: true
        },
        {
          id: 'muted-users',
          label: 'muted accounts',
          onPress: () => navigation.navigate('MutedUsers'),
          showChevron: true
        },
      ]
    },
    {
      title: 'content',
      items: [
        {
          id: 'content-filters',
          label: 'content filters',
          icon: 'filter',
          onPress: () => navigation.navigate('ContentFilters'),
          showChevron: true
        },
        {
          id: 'watch-history',
          label: 'watch history',
          icon: 'mingcute:history-anticlockwise-line',
          onPress: () => navigation.navigate('WatchHistory'),
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
      title: 'app',
      items: [
        {
          id: 'color-palette',
          label: 'color palette',
          icon: 'color-picker-fill',
          onPress: () => navigation.navigate('ColorPalette'),
          showChevron: true
        },
        {
          id: 'about',
          label: 'about orbyt',
          icon: 'device-tv',
          onPress: () => navigation.navigate('About'),
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
    {
      title: 'debug',
      items: []
    }
  ];

  // Build flat list data for FlashList
  type ListRow =
    | { kind: 'section-title'; id: string; title: string }
    | { kind: 'setting'; id: string; label: string; showChevron?: boolean; onPress: () => void }
    | { kind: 'toggle'; id: string; label: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void }
    | { kind: 'logout'; id: 'logout' };

  const listData: ListRow[] = [];

  settingsSections.forEach((section) => {
    if (section.title !== 'account') {
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

    if (section.title === 'content') {
      listData.push({
        kind: 'toggle',
        id: 'experimental-feeds',
        label: 'experimental feeds',
        subtitle: 'show non-video feeds',
        value: isExperimentalFeedsEnabled,
        onValueChange: handleToggleExperimentalFeeds,
      });
    }

    if (section.title === 'debug') {
      listData.push({
        kind: 'toggle',
        id: 'feed-debug-overlay',
        label: 'feed debug overlay',
        subtitle: 'show realtime feed/debug info',
        value: isFeedDebugEnabled,
        onValueChange: handleToggleFeedDebug,
      });
    }
  });

  // Add logout row at the end
  listData.push({ kind: 'logout', id: 'logout' });

  return (
    <View style={styles.container}>
      <FlashList
        data={listData}
        contentContainerStyle={[styles.contentContainer, { paddingHorizontal: 5 }]}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        ListHeaderComponent={(
          <ListHeader 
            mode="root"
            title="settings"
            showBackButton
            onBackPress={() => navigation.goBack()}
            applySafeAreaTop
            style={{ marginHorizontal: -5 }}
          />
        )}
        renderItem={({ item }) => {
          switch (item.kind) {
            case 'section-title':
              return (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                </View>
              );
            case 'setting':
              return (
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    style={styles.menuOption}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    <View style={styles.menuOptionLeft}>
                      <Text style={styles.menuOptionText}>{item.label}</Text>
                    </View>
                    {item.showChevron && (
                      <Icon name="chevron-right" size={20} color={Colors.gray} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            case 'toggle':
              return (
                <View style={{ marginBottom: 12 }}>
                  <View style={styles.menuOption}>
                    <View style={styles.menuOptionLeft}>
                      <Text style={styles.menuOptionText}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={styles.menuOptionSubtitle}>{item.subtitle}</Text>
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
                <View style={styles.logoutSection}>
                  <TouchableOpacity
                    style={styles.logoutMenuOption}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.logoutMenuOptionText}>log out</Text>
                  </TouchableOpacity>
                </View>
              );
            default:
              return null;
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
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
  contentContainer: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    color: Colors.gray,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginHorizontal: 0,
  },
  menuOption: {
    backgroundColor: Colors.darkGray,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuOptionLeft: {
    flexDirection: 'column',
    flex: 1,
  },
  menuOptionText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  menuOptionSubtitle: {
    color: Colors.gray,
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Firma-Regular',
    marginTop: 4,
  },
  logoutSection: {
    marginTop: 32,
    paddingHorizontal: 0,
  },
  logoutMenuOption: {
    backgroundColor: Colors.darkRed,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutMenuOptionText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
});

export default SettingsScreen; 