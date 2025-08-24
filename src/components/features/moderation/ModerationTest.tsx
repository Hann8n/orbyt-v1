import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { ModerationService } from '../../../services/ModerationService';
import { useModeration, useUserStoreState } from '../../../stores/userStore';
import { Colors } from '../../ui/UI';

const ModerationTest: React.FC = () => {
  const { agent, isAuthenticated } = useUserStoreState();
  const { getModerationSettings, saveModerationSettings } = useModeration();
  const [settings, setSettings] = useState<any>(null);
  const [labelDefs, setLabelDefs] = useState<any>(null);
  const [preferences, setPreferences] = useState<any>(null);

  useEffect(() => {
    if (isAuthenticated && agent) {
      loadModerationData();
    }
  }, [isAuthenticated, agent]);

  const loadModerationData = async () => {
    try {
      console.log('[ModerationTest] Loading moderation data...');
      
      // Get moderation settings
      const currentSettings = await getModerationSettings();
      setSettings(currentSettings);
      console.log('[ModerationTest] Current settings:', currentSettings);

      // Get moderation options to see available labels
      const moderationOpts = await ModerationService.getModerationOpts();
      if (moderationOpts) {
        setLabelDefs(moderationOpts.labelDefs);
        setPreferences(moderationOpts.prefs);
        console.log('[ModerationTest] Available labels:', Object.keys(moderationOpts.labelDefs));
        console.log('[ModerationTest] Current preferences:', moderationOpts.prefs);
      }
    } catch (error) {
      console.error('[ModerationTest] Error loading moderation data:', error);
      Alert.alert('Error', 'Failed to load moderation data');
    }
  };

  const testModeration = async () => {
    try {
      console.log('[ModerationTest] Testing moderation with current settings...');
      
      // Create a test post with potentially sensitive content
      const testPost = {
        post: {
          uri: 'at://test.did/app.bsky.feed.post/test',
          cid: 'test-cid',
          author: {
            did: 'did:plc:test',
            handle: 'test.bsky.app'
          },
          text: 'Test post with potentially sensitive content',
          labels: [
            {
              $type: 'com.atproto.label.defs#label',
              src: 'did:plc:test',
              uri: 'at://test.did/app.bsky.feed.post/test',
              cid: 'test-cid',
              val: 'nsfw'
            }
          ]
        }
      };

      const decision = await ModerationService.moderatePost(testPost, 'contentList');
      console.log('[ModerationTest] Moderation decision:', decision);
      
      Alert.alert(
        'Moderation Test Result',
        `Filter: ${decision.filter}\nBlur: ${decision.blur}\nReason: ${decision.reason || 'None'}\nInforms: ${decision.informs.join(', ')}`
      );
    } catch (error) {
      console.error('[ModerationTest] Error testing moderation:', error);
      Alert.alert('Error', 'Failed to test moderation');
    }
  };

  const testSpecificLabels = async () => {
    try {
      console.log('[ModerationTest] Testing specific labels...');
      
      const labelsToTest = ['nsfw', 'suggestive', 'nudity', 'gore'];
      
      for (const label of labelsToTest) {
        const testPost = {
          post: {
            uri: `at://test.did/app.bsky.feed.post/test-${label}`,
            cid: `test-cid-${label}`,
            author: {
              did: 'did:plc:test',
              handle: 'test.bsky.app'
            },
            text: `Test post with ${label} label`,
            labels: [
              {
                $type: 'com.atproto.label.defs#label',
                src: 'did:plc:test',
                uri: `at://test.did/app.bsky.feed.post/test-${label}`,
                cid: `test-cid-${label}`,
                val: label
              }
            ]
          }
        };

        const decision = await ModerationService.moderatePost(testPost, 'contentList');
        console.log(`[ModerationTest] ${label} label - Filter: ${decision.filter}, Blur: ${decision.blur}, Reason: ${decision.reason}`);
      }
      
      Alert.alert('Label Test Complete', 'Check console for results');
    } catch (error) {
      console.error('[ModerationTest] Error testing labels:', error);
      Alert.alert('Error', 'Failed to test labels');
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Please log in to test moderation</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Moderation System Test</Text>
      
      <TouchableOpacity style={styles.button} onPress={loadModerationData}>
        <Text style={styles.buttonText}>Reload Moderation Data</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testModeration}>
        <Text style={styles.buttonText}>Test Moderation</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button} onPress={testSpecificLabels}>
        <Text style={styles.buttonText}>Test Specific Labels</Text>
      </TouchableOpacity>

      {settings && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Settings</Text>
          <Text style={styles.text}>Adult Content Enabled: {settings.adultContentEnabled ? 'Yes' : 'No'}</Text>
          <Text style={styles.text}>Labels:</Text>
          {Object.entries(settings.labels).map(([label, preference]) => (
            <Text key={label} style={styles.text}>  {label}: {preference}</Text>
          ))}
        </View>
      )}

      {labelDefs && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Labels</Text>
          {Object.keys(labelDefs).map(label => (
            <Text key={label} style={styles.text}>• {label}</Text>
          ))}
        </View>
      )}

      {preferences && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Preferences</Text>
          <Text style={styles.text}>Adult Content: {preferences.adultContentEnabled ? 'Enabled' : 'Disabled'}</Text>
          <Text style={styles.text}>Label Preferences:</Text>
          {Object.entries(preferences.labels || {}).map(([label, preference]) => (
            <Text key={label} style={styles.text}>  {label}: {preference}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.black,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginTop: 20,
    padding: 15,
    backgroundColor: Colors.darkGray,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 10,
  },
  text: {
    color: Colors.white,
    fontSize: 14,
    marginBottom: 5,
  },
  button: {
    backgroundColor: Colors.lightGreen,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default ModerationTest;
