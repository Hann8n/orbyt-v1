import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon, { Loading3FillIcon } from '../../src/components/ui/Icon';
import { Colors } from '../../src/components/ui/UI';
import { useAlgorithmicFeedProvider, ALGORITHMIC_FEED_PROVIDERS } from '../../src/stores/userStore';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';

interface FeedProviderOption {
  id: string;
  uri: string | null;
  displayName: string;
  description: string;
}

const FEED_OPTIONS: FeedProviderOption[] = [
  {
    id: 'bluesky-video',
    uri: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri,
    displayName: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.displayName,
    description: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.description,
  },
  {
    id: 'videos-for-you',
    uri: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri,
    displayName: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.displayName,
    description: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.description,
  },
  {
    id: 'none',
    uri: null,
    displayName: 'None',
    description: 'Only show content from your subscribed channels',
  },
];

const AlgorithmicFeedScreen: React.FC = () => {
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const { algorithmicFeedProvider, setAlgorithmicFeedProvider } = useAlgorithmicFeedProvider();
  const [selectedUri, setSelectedUri] = useState<string | null>(algorithmicFeedProvider);
  const [isSaving, setIsSaving] = useState(false);

  // Sync with store when it changes
  useEffect(() => {
    setSelectedUri(algorithmicFeedProvider);
  }, [algorithmicFeedProvider]);

  const handleSelectProvider = async (uri: string | null) => {
    if (uri === selectedUri) return;
    
    setIsSaving(true);
    setSelectedUri(uri);
    
    try {
      await setAlgorithmicFeedProvider(uri);
      // Invalidate feed queries to refresh with new provider
      queryClient.invalidateQueries({ queryKey: ['feed', 'your-mix'] });
    } catch (error) {
      console.error('Error setting algorithmic feed provider:', error);
      // Revert on error
      setSelectedUri(algorithmicFeedProvider);
    } finally {
      setIsSaving(false);
    }
  };

  const isSelected = (uri: string | null) => {
    if (uri === null && selectedUri === null) return true;
    return uri === selectedUri;
  };

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title="algorithmic feed"
        showCloseButton
        onClosePress={() => navigation.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={settingsLayoutStyles.contentContainer} 
        showsVerticalScrollIndicator={false}
      >
        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            Choose an algorithmic feed to blend personalized recommendations into your mix. 
            These feeds learn from your interactions to show more of what you like.
          </Text>
        </View>

        {/* Feed Provider Options */}
        <View style={settingsLayoutStyles.section}>
          {FEED_OPTIONS.map((option) => {
            const selected = isSelected(option.uri);
            return (
              <TouchableOpacity
                key={option.id}
                style={settingsButtonStyles.menuOption}
                onPress={() => handleSelectProvider(option.uri)}
                activeOpacity={0.7}
                disabled={isSaving}
              >
                <View style={styles.optionContent}>
                  <View style={styles.optionHeader}>
                    <Text style={[
                      settingsTextStyles.menuOptionText,
                      selected && { color: Colors.lightGreen },
                    ]}>
                      {option.displayName}
                    </Text>
                  </View>
                  <Text style={styles.optionDescription}>
                    {option.description}
                  </Text>
                </View>
                <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                  {isSaving && selected ? (
                    <Loading3FillIcon size={24} color={Colors.lightGreen} />
                  ) : selected ? (
                    <Icon name="check" size={24} color={Colors.lightGreen} />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Additional Info */}
        <View style={styles.footerSection}>
          <Text style={styles.footerText}>
            When you interact with videos (like, share, watch longer), your selected feed learns your preferences. 
            Switch providers anytime to try different recommendation styles.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  infoText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 20,
  },
  optionContent: {
    flex: 1,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  optionDescription: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 20,
  },
  footerSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  footerText: {
    color: Colors.gray,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});

export default AlgorithmicFeedScreen;
