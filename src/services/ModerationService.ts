import AtprotoService from './api/AtprotoService';
import { ModerationSettings, LabelPreference, ModerationFilters, ModerationDecision, ModerationOpts, LabelDefinition } from './ModerationTypes';

export class ModerationService {
  private static readonly DEBUG_MODE = __DEV__;
  
  /**
   * Debug logging with context
   */
  private static debugLog(context: string, message: string, data?: any) {
    if (this.DEBUG_MODE && (context.includes('error') || context.includes('warning'))) {
      const timestamp = new Date().toISOString();
      console.log(`[ModerationService:${context}] ${timestamp} - ${message}`, data || '');
    }
  }

  /**
   * Get user-friendly description for a label value
   */
  private static getLabelDescription(labelValue: string): string {
    const labelMap: Record<string, string> = {
      'porn': 'adult content',
      'sexual': 'sexual content',
      'nudity': 'nudity',
      'violence': 'violence',
      'gore': 'graphic violence',
      'spam': 'spam',
      'misleading': 'misleading content',
      'hate': 'hate speech',
      'intolerant': 'intolerant content',
      'impersonation': 'impersonation',
      'scam': 'scam',
      'graphic-media': 'graphic content',
    };
    
    return labelMap[labelValue] || labelValue;
  }
  
  /**
   * Get current moderation settings from Bluesky API
   */
  static async getModerationSettings(): Promise<ModerationSettings> {
    try {
      this.debugLog('getModerationSettings', 'Fetching moderation settings from API');
      
      // Get preferences from Bluesky API
      const apiPreferences = await AtprotoService.getModerationPreferences();
      
      if (apiPreferences) {
        this.debugLog('getModerationSettings', 'Raw API response:', JSON.stringify(apiPreferences, null, 2));
        this.debugLog('getModerationSettings', 'Successfully fetched API preferences', apiPreferences);
        
        // Extract adult content setting
        const adultContentPref = apiPreferences.preferences?.find((pref: any) => 
          pref.$type === 'app.bsky.actor.defs#adultContentPref'
        );
        const adultContentEnabled = adultContentPref?.enabled ?? false; // Use nullish coalescing to handle false values
        
        // Extract label preferences
        const labelPrefs = apiPreferences.preferences?.filter((pref: any) => 
          pref.$type === 'app.bsky.actor.defs#contentLabelPref'
        ) || [];
        
        // Convert label preferences to our format
        const labels: Record<string, LabelPreference> = {};
        
        labelPrefs.forEach((pref: any) => {
          // Map Bluesky visibility to our LabelPreference
          let preference: LabelPreference = 'warn';
          switch (pref.visibility) {
            case 'hide':
              preference = 'hide';
              break;
            case 'warn':
              preference = 'warn';
              break;
            case 'ignore':
              preference = 'ignore';
              break;
            default:
              preference = 'warn';
          }
          labels[pref.label] = preference;
        });
        
        // Convert API preferences to our ModerationSettings format
        const settings: ModerationSettings = {
          hideSensitiveContent: true,
          hideAdultContent: true,
          hideViolence: true,
          hideSpam: true,
          hideMisleading: true,
          hideBlockedUsers: true,
          hideMutedUsers: true,
          showContentWarnings: true,
          autoExpandContentWarnings: false,
          adultContentEnabled: adultContentEnabled,
          adultContentOnlyMode: false,
          labels: {
            // Default labels if not set in API
            'porn': labels.porn || 'hide',
            'sexual': labels.sexual || 'warn',
            'nudity': labels.nudity || 'warn',
            'violence': labels.violence || 'warn',
            'gore': labels.gore || 'hide',
            'spam': labels.spam || 'hide',
            'misleading': labels.misleading || 'warn',
            'hate': labels.hate || 'hide',
            'intolerant': labels.intolerant || 'warn',
            'impersonation': labels.impersonation || 'hide',
            'scam': labels.scam || 'hide',
            // Add any additional labels from API
            ...labels
          },
          labelers: apiPreferences.labelers || [],
          mutedWords: [],
          hiddenPosts: [],
        };
        
        return settings;
      }
    } catch (error) {
      this.debugLog('getModerationSettings', 'Error fetching settings from API', error);
    }
    
    // Return default settings if API call fails
    const defaultSettings: ModerationSettings = {
      hideSensitiveContent: true,
      hideAdultContent: true,
      hideViolence: true,
      hideSpam: true,
      hideMisleading: true,
      hideBlockedUsers: true,
      hideMutedUsers: true,
      showContentWarnings: true,
      autoExpandContentWarnings: false,
      adultContentEnabled: false,
      adultContentOnlyMode: false,
      labels: {
        'porn': 'hide',
        'sexual': 'warn',
        'nudity': 'warn',
        'violence': 'warn',
        'gore': 'hide',
        'spam': 'hide',
        'misleading': 'warn',
        'hate': 'hide',
        'intolerant': 'warn',
        'impersonation': 'hide',
        'scam': 'hide',
      },
      labelers: [],
      mutedWords: [],
      hiddenPosts: [],
    };
    
    return defaultSettings;
  }
  
  /**
   * Save moderation settings to Bluesky API
   */
  static async saveModerationSettings(settings: ModerationSettings): Promise<void> {
    try {
      this.debugLog('saveModerationSettings', 'Saving settings to API', settings);
      
      // Get current preferences first to preserve other settings
      const currentPreferences = await AtprotoService.getModerationPreferences();
      if (!currentPreferences) {
        throw new Error('Failed to get current preferences');
      }
      
      // Convert our settings to Bluesky API format
      const updatedPreferences = {
        preferences: [
          // Update adult content preference
          {
            $type: 'app.bsky.actor.defs#adultContentPref',
            enabled: settings.adultContentEnabled
          },
          // Update label preferences
          ...Object.entries(settings.labels).map(([label, preference]) => ({
            $type: 'app.bsky.actor.defs#contentLabelPref',
            label,
            visibility: preference // 'hide', 'warn', or 'ignore'
          })),
          // Keep other preferences unchanged
          ...currentPreferences.preferences.filter((pref: any) => 
            pref.$type !== 'app.bsky.actor.defs#adultContentPref' &&
            pref.$type !== 'app.bsky.actor.defs#contentLabelPref'
          )
        ]
      };
      
      this.debugLog('saveModerationSettings', 'Saving preferences to API:', JSON.stringify(updatedPreferences, null, 2));
      const success = await AtprotoService.updateModerationPreferences(updatedPreferences);
      
      if (success) {
        this.debugLog('saveModerationSettings', 'Settings saved successfully to API');
      } else {
        this.debugLog('saveModerationSettings', 'Failed to save settings to API');
        throw new Error('Failed to save settings to API');
      }
    } catch (error) {
      this.debugLog('saveModerationSettings', 'Error saving settings to API', error);
      throw error;
    }
  }
  
  /**
   * Get blocked users from Bluesky API
   */
  static async getBlockedUsers(): Promise<Set<string>> {
    try {
      this.debugLog('getBlockedUsers', 'Fetching blocked users from API');
      const blockedUsers = await AtprotoService.getBlockedUsersFromAPI();
      this.debugLog('getBlockedUsers', `Fetched ${blockedUsers.length} blocked users from API`);
      return new Set(blockedUsers);
    } catch (error) {
      this.debugLog('getBlockedUsers', 'Error fetching blocked users from API', error);
      return new Set();
    }
  }
  
  /**
   * Get muted users from Bluesky API
   */
  static async getMutedUsers(): Promise<Set<string>> {
    try {
      this.debugLog('getMutedUsers', 'Fetching muted users from API');
      const mutedUsers = await AtprotoService.getMutedUsersFromAPI();
      this.debugLog('getMutedUsers', `Fetched ${mutedUsers.length} muted users from API`);
      return new Set(mutedUsers);
    } catch (error) {
      this.debugLog('getMutedUsers', 'Error fetching muted users from API', error);
      return new Set();
    }
  }
  

  
  /**
   * Moderate a post using Bluesky-compatible logic
   */
  static async moderatePost(post: any, context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList'): Promise<ModerationDecision> {
    if (!post || !post.post) {
      return { filter: false, blur: false, informs: [] };
    }
    
    const settings = await this.getModerationSettings();
    const blockedUsers = await this.getBlockedUsers();
    const mutedUsers = await this.getMutedUsers();
    
    const decision: ModerationDecision = {
      filter: false,
      blur: false,
      informs: [],
    };
    
    // Check if author is blocked or muted
    if (post.post.author?.did) {
      const authorDid = post.post.author.did;
      
      if (settings.hideBlockedUsers && blockedUsers.has(authorDid)) {
        decision.filter = true;
        decision.reason = 'Author is blocked';
        decision.source = 'user_block';
        return decision;
      }
      
      if (settings.hideMutedUsers && mutedUsers.has(authorDid)) {
        decision.filter = true;
        decision.reason = 'Author is muted';
        decision.source = 'user_mute';
        return decision;
      }
    }
    
    // Check if adult content is disabled - this should override label preferences
    if (!settings.adultContentEnabled) {
      const labels = post.post.labels || [];
      const hasAdultLabels = labels.some((label: any) => 
        ['porn', 'sexual', 'nudity'].includes(label.val?.toLowerCase() || '')
      );
      
      if (hasAdultLabels) {
        decision.filter = true;
        decision.reason = 'Adult content is disabled';
        decision.source = 'adult_content_disabled';
        return decision;
      }
    }

    // NEW: Check if adult-only mode is enabled - filter out non-adult content
    if (settings.adultContentOnlyMode) {
      const labels = post.post.labels || [];
      const contentWarnings = post.post.contentWarnings || [];
      
      // Check if post has adult labels or content warnings
      const hasAdultLabels = labels.some((label: any) => 
        ['porn', 'sexual', 'nudity'].includes(label.val?.toLowerCase() || '')
      );
      
      const hasAdultContentWarnings = contentWarnings.some((warning: string) => 
        ['adult', 'nsfw', 'nudity', 'sexual'].some(keyword => 
          warning.toLowerCase().includes(keyword)
        )
      );
      
      // If post doesn't have adult content, filter it out
      if (!hasAdultLabels && !hasAdultContentWarnings) {
        decision.filter = true;
        decision.reason = 'Non-adult content filtered in adult-only mode';
        decision.source = 'adult_only_mode';
        return decision;
      }
    }
    
    // Check content labels
    const labels = post.post.labels || [];
    
    for (const label of labels) {
      const labelValue = label.val?.toLowerCase() || '';
      const labelerDid = label.src || 'unknown';
      
      // Check label preferences
      const labelPreference = settings.labels[labelValue] || 'warn';
      
      switch (labelPreference) {
        case 'hide':
          this.debugLog('moderatePost', `Filtering content with label ${labelValue}`);
          decision.filter = true;
          decision.reason = `Content labeled as ${labelValue}`;
          decision.source = labelerDid;
          return decision;
          
        case 'warn':
          this.debugLog('moderatePost', `Blurring content with label ${labelValue}`);
          decision.blur = true;
          decision.informs.push(labelValue);
          break;
          
        case 'ignore':
          this.debugLog('moderatePost', `Ignoring label ${labelValue}`);
          break;
      }
    }
    
    // Check content warnings
    const contentWarnings = post.post.contentWarnings || [];
    this.debugLog('moderatePost', `Checking ${contentWarnings.length} content warnings`, contentWarnings);
    
    for (const warning of contentWarnings) {
      const warningText = warning.toLowerCase();
      this.debugLog('moderatePost', `Processing content warning: ${warningText}`);
      
      // Apply content warning logic based on settings
      if (settings.hideSensitiveContent && 
          (warningText.includes('sensitive') || warningText.includes('nsfw'))) {
        this.debugLog('moderatePost', 'Filtering sensitive content');
        decision.filter = true;
        decision.reason = 'Sensitive content';
        decision.source = 'content_warning';
        return decision;
      }
      
      if (settings.hideAdultContent && 
          (warningText.includes('adult') || warningText.includes('nsfw') || warningText.includes('nudity'))) {
        this.debugLog('moderatePost', 'Filtering adult content');
        decision.filter = true;
        decision.reason = 'Adult content';
        decision.source = 'content_warning';
        return decision;
      }
      
      if (settings.hideViolence && 
          (warningText.includes('violence') || warningText.includes('gore'))) {
        this.debugLog('moderatePost', 'Filtering violent content');
        decision.filter = true;
        decision.reason = 'Violent content';
        decision.source = 'content_warning';
        return decision;
      }
    }
    
    // Check muted words
    if (settings.mutedWords.length > 0) {
      const postText = post.post.record?.text?.toLowerCase() || '';
      this.debugLog('moderatePost', `Checking muted words against post text`);
      
      for (const mutedWord of settings.mutedWords) {
        if (postText.includes(mutedWord.toLowerCase())) {
          this.debugLog('moderatePost', `Filtering content with muted word: ${mutedWord}`);
          decision.filter = true;
          decision.reason = `Contains muted word: ${mutedWord}`;
          decision.source = 'muted_word';
          return decision;
        }
      }
    }
    
    // Check if post is in hidden posts list
    if (settings.hiddenPosts.includes(post.post.uri)) {
      this.debugLog('moderatePost', 'Filtering hidden post');
      decision.filter = true;
      decision.reason = 'Post is hidden';
      decision.source = 'user_hide';
      return decision;
    }
    
    this.debugLog('moderatePost', 'Post passed moderation checks', decision);
    return decision;
  }
  

  

  
  /**
   * Sync moderation settings from Bluesky API
   */
  static async syncModerationSettings(): Promise<void> {
    try {
      this.debugLog('syncModerationSettings', 'Starting moderation settings sync');
      
      // Get current user
      const currentUser = await AtprotoService.getCurrentUser();
      if (!currentUser?.did) {
        this.debugLog('syncModerationSettings', 'No current user found, skipping sync');
        return;
      }
      
      this.debugLog('syncModerationSettings', `Syncing settings for user ${currentUser.did}`);
      
      // Fetch moderation preferences from API
      const apiPreferences = await AtprotoService.getModerationPreferences();
      if (apiPreferences) {
        this.debugLog('syncModerationSettings', 'Successfully synced moderation preferences from API', apiPreferences);
      } else {
        this.debugLog('syncModerationSettings', 'Failed to fetch moderation preferences from API');
      }
      
      // Fetch blocked and muted users from API
      const [blockedUsers, mutedUsers] = await Promise.all([
        AtprotoService.getBlockedUsersFromAPI(),
        AtprotoService.getMutedUsersFromAPI()
      ]);
      
      this.debugLog('syncModerationSettings', `Synced ${blockedUsers.length} blocked users and ${mutedUsers.length} muted users from API`);
      
      this.debugLog('syncModerationSettings', 'Moderation settings sync completed successfully');
      
    } catch (error) {
      this.debugLog('syncModerationSettings', 'Error syncing moderation settings', error);
    }
  }
  
  /**
   * Open Bluesky moderation settings in the browser
   */
  static async openBlueskyModerationSettings(): Promise<void> {
    try {
      this.debugLog('openBlueskyModerationSettings', 'Opening Bluesky moderation settings');
      
      // Get current user to construct the settings URL
      const currentUser = await AtprotoService.getCurrentUser();
      if (currentUser?.did) {
        const settingsUrl = `https://bsky.app/settings/moderation`;
        
        this.debugLog('openBlueskyModerationSettings', `Opening URL: ${settingsUrl}`);
        
        // For React Native, you would typically use Linking to open the URL
        // This is a placeholder - you'll need to implement the actual URL opening
        console.log('Opening Bluesky moderation settings:', settingsUrl);
        
        // In a real implementation, you would use:
        // import { Linking } from 'react-native';
        // await Linking.openURL(settingsUrl);
      } else {
        this.debugLog('openBlueskyModerationSettings', 'No current user found');
      }
    } catch (error) {
      this.debugLog('openBlueskyModerationSettings', 'Error opening Bluesky moderation settings', error);
    }
  }
  
  /**
   * Get moderation statistics for debugging
   */
  static async getModerationStats(): Promise<{
    blockedUsers: number;
    mutedUsers: number;
    mutedWords: number;
    hiddenPosts: number;
    labelPreferences: Record<string, LabelPreference>;
  }> {
    try {
      const settings = await this.getModerationSettings();
      const blockedUsers = await this.getBlockedUsers();
      const mutedUsers = await this.getMutedUsers();
      
      const stats = {
        blockedUsers: blockedUsers.size,
        mutedUsers: mutedUsers.size,
        mutedWords: settings.mutedWords.length,
        hiddenPosts: settings.hiddenPosts.length,
        labelPreferences: settings.labels,
      };
      
      this.debugLog('getModerationStats', 'Retrieved moderation statistics', stats);
      return stats;
    } catch (error) {
      this.debugLog('getModerationStats', 'Error getting moderation stats', error);
      return {
        blockedUsers: 0,
        mutedUsers: 0,
        mutedWords: 0,
        hiddenPosts: 0,
        labelPreferences: {},
      };
    }
  }
  
  /**
   * Test moderation with sample content
   */
  static async testModeration(): Promise<void> {
    this.debugLog('testModeration', 'Running moderation tests');
    
    const testPosts = [
      {
        post: {
          uri: 'test://post/1',
          author: { did: 'did:test:user1' },
          labels: [{ val: 'porn', src: 'test-labeler' }],
        }
      },
      {
        post: {
          uri: 'test://post/2',
          author: { did: 'did:test:user2' },
          contentWarnings: ['adult content'],
        }
      },
      {
        post: {
          uri: 'test://post/3',
          author: { did: 'did:test:user3' },
          record: { text: 'This is a normal post' },
        }
      }
    ];
    
    // Test individual moderation
    this.debugLog('testModeration', 'Testing individual moderation...');
    for (const testPost of testPosts) {
      const decision = await this.moderatePost(testPost);
      this.debugLog('testModeration', `Test post ${testPost.post.uri} decision:`, decision);
    }
    
    // Test batch moderation
    this.debugLog('testModeration', 'Testing batch moderation...');
    const batchResult = await this.batchModeratePosts(testPosts);
    this.debugLog('testModeration', 'Batch moderation stats:', batchResult.stats);
    
    this.debugLog('testModeration', 'Moderation tests completed');
  }

  /**
   * Debug API calls and show raw responses
   */
  static async debugAPICalls(): Promise<void> {
    this.debugLog('debugAPICalls', 'Starting API debug calls');
    
    try {
      // Test moderation preferences
      console.log('=== TESTING MODERATION PREFERENCES API ===');
      const preferences = await AtprotoService.getModerationPreferences();
      console.log('Moderation preferences result:', preferences);
      
      // Test blocked users
      console.log('=== TESTING BLOCKED USERS API ===');
      const blockedUsers = await AtprotoService.getBlockedUsersFromAPI();
      console.log('Blocked users result:', blockedUsers);
      
      // Test muted users
      console.log('=== TESTING MUTED USERS API ===');
      const mutedUsers = await AtprotoService.getMutedUsersFromAPI();
      console.log('Muted users result:', mutedUsers);
      
      // Test our processed settings
      console.log('=== TESTING PROCESSED SETTINGS ===');
      const settings = await this.getModerationSettings();
      console.log('Processed settings result:', settings);
      
    } catch (error) {
      console.error('Error in debug API calls:', error);
    }
    
    this.debugLog('debugAPICalls', 'API debug calls completed');
  }
  
  /**
   * Batch moderate multiple posts efficiently
   * This reduces individual moderation calls and improves performance
   */
  static async batchModeratePosts(posts: any[], context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList'): Promise<{
    filteredPosts: any[];
    moderationDecisions: Map<string, ModerationDecision>;
    stats: {
      total: number;
      filtered: number;
      blurred: number;
      allowed: number;
    };
  }> {
    if (!posts || posts.length === 0) {
      return {
        filteredPosts: [],
        moderationDecisions: new Map(),
        stats: { total: 0, filtered: 0, blurred: 0, allowed: 0 }
      };
    }
    
    // Load settings and user lists once for the entire batch
    const settings = await this.getModerationSettings();
    const blockedUsers = await this.getBlockedUsers();
    const mutedUsers = await this.getMutedUsers();
    
    const filteredPosts: any[] = [];
    const moderationDecisions = new Map<string, ModerationDecision>();
    let filteredCount = 0;
    let blurredCount = 0;
    let allowedCount = 0;
    
    // Process posts in batches for better performance
    const BATCH_SIZE = 10;
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (post) => {
        if (!post || !post.post) {
          return { post, decision: { filter: false, blur: false, informs: [] } };
        }
        
        const decision = await this.moderatePostWithCachedSettings(
          post, 
          context, 
          settings, 
          blockedUsers, 
          mutedUsers
        );
        
        return { post, decision };
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Process batch results
      for (const { post, decision } of batchResults) {
        const postUri = post?.post?.uri;
        if (postUri) {
          moderationDecisions.set(postUri, decision);
        }
        
        if (decision.filter) {
          filteredCount++;
        } else if (decision.blur) {
          blurredCount++;
          filteredPosts.push(post);
        } else {
          allowedCount++;
          filteredPosts.push(post);
        }
      }
    }
    
    const stats = {
      total: posts.length,
      filtered: filteredCount,
      blurred: blurredCount,
      allowed: allowedCount
    };
    
    return {
      filteredPosts,
      moderationDecisions,
      stats
    };
  }
  
  /**
   * Moderate a post using cached settings for batch processing
   * This avoids repeated async calls for the same settings
   */
  private static async moderatePostWithCachedSettings(
    post: any, 
    context: 'contentList' | 'contentView' | 'avatar' | 'banner',
    settings: ModerationSettings,
    blockedUsers: Set<string>,
    mutedUsers: Set<string>
  ): Promise<ModerationDecision> {
    if (!post || !post.post) {
      return { filter: false, blur: false, informs: [] };
    }
    
    const decision: ModerationDecision = {
      filter: false,
      blur: false,
      informs: [],
    };
    
    // Check if author is blocked or muted
    if (post.post.author?.did) {
      const authorDid = post.post.author.did;
      
      if (settings.hideBlockedUsers && blockedUsers.has(authorDid)) {
        decision.filter = true;
        decision.reason = 'Author is blocked';
        decision.source = 'user_block';
        return decision;
      }
      
      if (settings.hideMutedUsers && mutedUsers.has(authorDid)) {
        decision.filter = true;
        decision.reason = 'Author is muted';
        decision.source = 'user_mute';
        return decision;
      }
    }
    
    // Check if adult content is disabled - this should override label preferences
    if (!settings.adultContentEnabled) {
      const labels = post.post.labels || [];
      const hasAdultLabels = labels.some((label: any) => 
        ['porn', 'sexual', 'nudity'].includes(label.val?.toLowerCase() || '')
      );
      
      if (hasAdultLabels) {
        decision.filter = true;
        decision.reason = 'Adult content is disabled';
        decision.source = 'adult_content_disabled';
        return decision;
      }
    }

    // NEW: Check if adult-only mode is enabled - filter out non-adult content
    if (settings.adultContentOnlyMode) {
      const labels = post.post.labels || [];
      const contentWarnings = post.post.contentWarnings || [];
      
      // Check if post has adult labels or content warnings
      const hasAdultLabels = labels.some((label: any) => 
        ['porn', 'sexual', 'nudity'].includes(label.val?.toLowerCase() || '')
      );
      
      const hasAdultContentWarnings = contentWarnings.some((warning: string) => 
        ['adult', 'nsfw', 'nudity', 'sexual'].some(keyword => 
          warning.toLowerCase().includes(keyword)
        )
      );
      
      // If post doesn't have adult content, filter it out
      if (!hasAdultLabels && !hasAdultContentWarnings) {
        decision.filter = true;
        decision.reason = 'Non-adult content filtered in adult-only mode';
        decision.source = 'adult_only_mode';
        return decision;
      }
    }
    
    // Check content labels
    const labels = post.post.labels || [];
    
    for (const label of labels) {
      const labelValue = label.val?.toLowerCase() || '';
      const labelerDid = label.src || 'unknown';
      
      // Check label preferences
      const labelPreference = settings.labels[labelValue] || 'warn';
      
      switch (labelPreference) {
        case 'hide':
          decision.filter = true;
          decision.reason = `Content labeled as ${labelValue}`;
          decision.source = labelerDid;
          return decision;
          
        case 'warn':
          decision.blur = true;
          decision.informs.push(labelValue);
          // Set reason based on the label type with user-friendly descriptions
          const labelDescription = this.getLabelDescription(labelValue);
          if (!decision.reason) {
            decision.reason = `Content flagged as ${labelDescription}`;
          } else {
            decision.reason += `, ${labelDescription}`;
          }
          break;
          
        case 'ignore':
          break;
      }
    }
    
    // Check content warnings
    const contentWarnings = post.post.contentWarnings || [];
    
    for (const warning of contentWarnings) {
      const warningText = warning.toLowerCase();
      
      // Apply content warning logic based on settings
      if (settings.hideSensitiveContent && 
          (warningText.includes('sensitive') || warningText.includes('nsfw'))) {
        decision.filter = true;
        decision.reason = 'Sensitive content';
        decision.source = 'content_warning';
        return decision;
      }
      
      if (settings.hideAdultContent && 
          (warningText.includes('adult') || warningText.includes('nsfw') || warningText.includes('nudity'))) {
        decision.filter = true;
        decision.reason = 'Adult content';
        decision.source = 'content_warning';
        return decision;
      }
      
      if (settings.hideViolence && 
          (warningText.includes('violence') || warningText.includes('gore'))) {
        decision.filter = true;
        decision.reason = 'Violent content';
        decision.source = 'content_warning';
        return decision;
      }
    }
    
    // Check muted words
    if (settings.mutedWords.length > 0) {
      const postText = post.post.record?.text?.toLowerCase() || '';
      
      for (const mutedWord of settings.mutedWords) {
        if (postText.includes(mutedWord.toLowerCase())) {
          decision.filter = true;
          decision.reason = `Contains muted word: ${mutedWord}`;
          decision.source = 'muted_word';
          return decision;
        }
      }
    }
    
    // Check if post is in hidden posts list
    if (settings.hiddenPosts.includes(post.post.uri)) {
      decision.filter = true;
      decision.reason = 'Post is hidden';
      decision.source = 'user_hide';
      return decision;
    }
    
    return decision;
  }
} 