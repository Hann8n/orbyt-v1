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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/ui/Icon';
import { Colors } from '../../components/ui/UI';
import ListHeader from '../../components/ui/ListHeader';
import { useFeedSettings, useAuth } from '../../stores/userStore';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, useLogout } from '../../navigation/types';

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
  const insets = useSafeAreaInsets();
  const { getExperimentalFeedsEnabled, setExperimentalFeedsEnabled } = useFeedSettings();

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
              // Use userStore to handle logout
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



  const settingsSections = [
    {
      title: 'account',
      items: [
        
        {
          id: 'channels',
          label: 'channels',
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


  });

  // Add logout row at the end
  listData.push({ kind: 'logout', id: 'logout' });

  return (
    <View style={settingsLayoutStyles.container}>
      <ScrollView
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
        showsVerticalScrollIndicator={false}
      >
        <ListHeader 
          mode="root"
          title="settings"
          showBackButton
          onBackPress={() => navigation.goBack()}
          applySafeAreaTop
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
                    onPress={handleLogout}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    <Text style={settingsTextStyles.logoutButtonText}>log out</Text>
                  </TouchableOpacity>
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