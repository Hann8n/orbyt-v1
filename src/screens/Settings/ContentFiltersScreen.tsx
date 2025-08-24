import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ListHeader from '../../components/ui/ListHeader';
import Icon from '../../components/ui/Icon';
import { Colors } from '../../components/ui/UI';
import UI from '../../components/ui/UI';
import { RootStackParamList } from '../../navigation/types';
import feedService, { createQueryKeys } from '../../services/FeedService';
import { ModerationService } from '../../services/ModerationService';
import { ModerationSettings, LabelPreference } from '../../services/ModerationTypes';
import { useModeration, useUserStoreState } from '../../stores/userStore';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles, settingsActiveStyles } from './SettingsStyles';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ContentFilters'>;

interface ContentTypeOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  preference: LabelPreference;
}

const ContentFiltersScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { saveModerationSettings } = useModeration();
  const { agent, isAuthenticated } = useUserStoreState();
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [adultContentEnabled, setAdultContentEnabled] = useState(false);
  
  // Debug: Check if agent is available
  useEffect(() => {
    console.log('[ContentFiltersScreen] Agent available:', !!agent);
    console.log('[ContentFiltersScreen] User authenticated:', isAuthenticated);
    
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
    }
  }, [agent, isAuthenticated]);

  const [contentOptions, setContentOptions] = useState<ContentTypeOption[]>([
    {
      id: 'nsfw',
      label: 'NSFW',
      description: 'Not safe for work content',
      icon: '',
      preference: 'hide'
    },
    {
      id: 'suggestive',
      label: 'Suggestive Content',
      description: 'Suggestive or provocative content',
      icon: '',
      preference: 'warn'
    },
    {
      id: 'nudity',
      label: 'Artistic Nudity',
      description: 'Nude or partially nude content',
      icon: '',
      preference: 'warn'
    },
    {
      id: 'gore',
      label: 'Graphic Media',
      description: 'Violent or graphic content',
      icon: '',
      preference: 'warn'
    }
  ]);

  useEffect(() => {
    // Prime UI immediately from cached settings for accurate initial state
    const cached = ModerationService.getCachedModerationSettings();
    setSettings(cached);
    setAdultContentEnabled(cached.adultContentEnabled);
    setContentOptions(prev => prev.map(option => ({
      ...option,
      preference: cached.labels[option.id] || option.preference
    })));

    // Then refresh from API without blocking UI
    (async () => {
      try {
        setLoading(true);
        const currentSettings = await ModerationService.getModerationSettings();
        setSettings(currentSettings);
        setAdultContentEnabled(currentSettings.adultContentEnabled);
        setContentOptions(prev => prev.map(option => ({
          ...option,
          preference: currentSettings.labels[option.id] || option.preference
        })));
      } catch (e) {
        console.error('Error loading content filters:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateContentPreference = async (contentId: string, preference: LabelPreference) => {
    console.log(`[ContentFiltersScreen] Updating content preference: ${contentId} = ${preference}`);
    
    // Check if user is authenticated
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setContentOptions(options => options.map(o => o.id === contentId ? { ...o, preference } : o));
    try {
      if (settings) {
        const updatedSettings: ModerationSettings = {
          ...settings,
          labels: {
            ...settings.labels,
            [contentId]: preference
          }
        };
        console.log('[ContentFiltersScreen] Saving moderation settings:', updatedSettings);
        await saveModerationSettings(updatedSettings);
        setSettings(updatedSettings);
        // Reset moderation/feeds so all content re-evaluates with new rules
        ModerationService.clearModerationCache();
        feedService.clearCurrentFeed();
        feedService.clearFeedCache();
        queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.all });
        console.log('[ContentFiltersScreen] Content preference updated successfully');
      }
    } catch (e) {
      console.error('Error saving content preference:', e);
      Alert.alert(
        'Error Saving Preference',
        `Failed to save content preference: ${e instanceof Error ? e.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  };

  const updateAdultContent = async (value: boolean) => {
    // Check if user is authenticated
    if (!isAuthenticated || !agent) {
      Alert.alert(
        'Authentication Required',
        'You must be logged in to change content filter settings.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setAdultContentEnabled(value);
    try {
      if (settings) {
        const updatedSettings: ModerationSettings = {
          ...settings,
          adultContentEnabled: value,
        };
        console.log('[ContentFiltersScreen] Saving adult content setting:', value);
        await saveModerationSettings(updatedSettings);
        setSettings(updatedSettings);
        // Reset moderation/feeds so all content re-evaluates with new rules
        ModerationService.clearModerationCache();
        feedService.clearCurrentFeed();
        feedService.clearFeedCache();
        queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.all });
        console.log('[ContentFiltersScreen] Adult content setting updated successfully');
      }
    } catch (e) {
      console.error('Error saving adult content preference:', e);
      Alert.alert(
        'Error Saving Setting',
        `Failed to save adult content setting: ${e instanceof Error ? e.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="stacked"
        title="content filters"
        showBackButton
        onBackPress={() => navigation.goBack()}
        applySafeAreaTop
      />

      <ScrollView style={styles.content} contentContainerStyle={settingsLayoutStyles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Content Type Settings */}
        <View style={settingsLayoutStyles.section}>
          <View style={{ marginBottom: 12, paddingHorizontal: 5 }}>
            {adultContentEnabled && (
              <View style={settingsButtonStyles.menuOption}>
                <View style={styles.menuOptionLeft}>
                  <Text style={settingsTextStyles.menuOptionText}>sensitive content</Text>
                </View>
                <Switch
                  value={adultContentEnabled}
                  onValueChange={updateAdultContent}
                  trackColor={{ false: Colors.mediumGray, true: Colors.lightGreen }}
                  thumbColor={adultContentEnabled ? Colors.white : Colors.lightGray}
                  ios_backgroundColor={Colors.mediumGray}
                />
              </View>
            )}
          </View>

          {contentOptions.map((option, index) => {
            const isAdult = ['nsfw'].includes(option.id);
            if (isAdult && !adultContentEnabled) return null;
            return (
              <View key={option.id} style={{ marginBottom: 12, paddingHorizontal: 5 }}>
                <View style={[settingsButtonStyles.menuOption, { alignItems: 'center' }]}>
                  <View style={[styles.menuOptionLeft, { paddingRight: 12 }]}>
                    <Text style={settingsTextStyles.menuOptionText}>{option.label}</Text>
                  </View>
                  <View style={[styles.toggleButtonsContainer, { justifyContent: 'center' }]}>
                    <View style={settingsButtonStyles.toggleButtonGroup}>
                      <TouchableOpacity
                        style={[settingsButtonStyles.toggleButton, option.preference === 'ignore' && [settingsActiveStyles.toggleButtonActive, { backgroundColor: UI.Colors.STATUS.SUCCESS, borderRightColor: UI.Colors.STATUS.SUCCESS }]]}
                        onPress={() => updateContentPreference(option.id, 'ignore')}
                        activeOpacity={0.7}
                        accessibilityLabel="Show"
                      >
                        <Icon
                          name="check"
                          size={16}
                          color={option.preference === 'ignore' ? Colors.black : Colors.lightGray}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[settingsButtonStyles.toggleButton, option.preference === 'warn' && [settingsActiveStyles.toggleButtonActive, { backgroundColor: UI.Colors.STATUS.WARNING, borderRightColor: UI.Colors.STATUS.WARNING }]]}
                        onPress={() => updateContentPreference(option.id, 'warn')}
                        activeOpacity={0.7}
                        accessibilityLabel="Warn"
                      >
                        <Icon
                          name="eye"
                        size={16}
                        color={option.preference === 'warn' ? Colors.black : Colors.lightGray}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[settingsButtonStyles.toggleButton, styles.toggleButtonLast, option.preference === 'hide' && [settingsActiveStyles.toggleButtonActive, { backgroundColor: UI.Colors.STATUS.ERROR, borderRightColor: UI.Colors.STATUS.ERROR }]]}
                        onPress={() => updateContentPreference(option.id, 'hide')}
                        activeOpacity={0.7}
                        accessibilityLabel="Hide"
                      >
                        <Icon
                          name="close"
                          size={16}
                          color={option.preference === 'hide' ? Colors.black : Colors.lightGray}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ marginTop: 4, paddingHorizontal: 5 }}>
          <TouchableOpacity
            style={settingsButtonStyles.menuOption}
            onPress={() => Linking.openURL('https://bsky.app/moderation')}
            activeOpacity={0.7}
          >
            <View style={styles.menuOptionLeft}>
              <Text style={settingsTextStyles.menuOptionText}>adjust on bsky.app</Text>
              <Text style={settingsTextStyles.menuOptionSubtitle}>open Bluesky content settings</Text>
            </View>
            <Icon name="external-link" size={20} color={Colors.gray} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  menuOptionLeft: {
    flexDirection: 'column',
    flex: 1,
  },
  toggleButtonsContainer: {
    marginTop: 0,
    alignItems: 'center',
    alignSelf: 'center',
  },
  toggleButtonLast: {
    borderRightWidth: 0,
  },
});

export default ContentFiltersScreen;


