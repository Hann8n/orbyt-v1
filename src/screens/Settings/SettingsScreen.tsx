import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, useLogout } from '../../navigation/types';
import Icon from '../../components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;
type SettingsScreenRouteProp = RouteProp<RootStackParamList, 'Settings'>;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const route = useRoute<SettingsScreenRouteProp>();
  const onLogout = useLogout();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

  const handleLogout = async () => {
    if (isSubmitting) return;
    
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await onLogout();
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handlePlaceholderAction = (action: string) => {
    Alert.alert('Coming Soon', `${action} will be available in a future update.`);
  };

  const settingsSections = [
    {
      title: 'Account',
      items: [
        {
          id: 'moderation',
          label: 'Content Moderation',
          icon: 'shield',
          onPress: () => navigation.navigate({ name: 'ModerationControls', params: {} }),
          showChevron: true
        },
        {
          id: 'channels',
          label: 'Manage Channels',
          icon: 'device-tv',
          onPress: () => navigation.navigate('ChannelManagement'),
          showChevron: true
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: 'notification',
          onPress: () => handlePlaceholderAction('Notifications'),
          showChevron: true
        }
      ]
    },
    {
      title: 'Content',
      items: [
        {
          id: 'watch-history',
          label: 'Watch History',
          icon: 'clock',
          onPress: () => navigation.navigate('WatchHistory'),
          showChevron: true
        },
        {
          id: 'auto-play',
          label: 'Auto-play Videos',
          icon: 'play',
          onPress: () => handlePlaceholderAction('Auto-play Videos'),
          showChevron: true
        },
        {
          id: 'data-usage',
          label: 'Data Usage',
          icon: 'radio-signal',
          onPress: () => handlePlaceholderAction('Data Usage'),
          showChevron: true
        },
        {
          id: 'download-quality',
          label: 'Download Quality',
          icon: 'download',
          onPress: () => handlePlaceholderAction('Download Quality'),
          showChevron: true
        }
      ]
    },
    {
      title: 'App',
      items: [
        {
          id: 'about',
          label: 'About Orbyt',
          icon: 'device-tv',
          onPress: () => handlePlaceholderAction('About Orbyt'),
          showChevron: true
        },
        {
          id: 'help',
          label: 'Help & Support',
          icon: 'headset',
          onPress: () => handlePlaceholderAction('Help & Support'),
          showChevron: true
        },
        {
          id: 'feedback',
          label: 'Send Feedback',
          icon: 'message-text',
          onPress: () => handlePlaceholderAction('Send Feedback'),
          showChevron: true
        }
      ]
    }
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {settingsSections.map((section, sectionIndex) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.lastItem
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                  disabled={isSubmitting}
                >
                  <View style={styles.settingItemLeft}>
                    <View style={styles.iconContainer}>
                      <Icon name={item.icon} size={20} color="#fff" />
                    </View>
                    <Text style={styles.settingItemText}>{item.label}</Text>
                  </View>
                  {item.showChevron && (
                    <Icon name="chevron-right" size={20} color="#666" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <View style={styles.logoutSection}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <Icon name="logout" size={20} color="#FE4359" />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
    paddingHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: '#1C1C1E',
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  logoutSection: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#FE4359',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  logoutButtonText: {
    color: '#FE4359',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginLeft: 8,
  },
});

export default SettingsScreen; 