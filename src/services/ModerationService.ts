import AsyncStorage from '@react-native-async-storage/async-storage';
import AtprotoService from './api/AtprotoService';
import { ModerationSettings, LabelPreference, ModerationFilters, ModerationDecision, ModerationOpts, LabelDefinition } from './ModerationTypes';

export class ModerationService {
  private static readonly MODERATION_SETTINGS_KEY = 'moderation_settings';
  private static readonly BLOCKED_USERS_KEY = 'blocked_users';
  private static readonly MUTED_USERS_KEY = 'muted_users';
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
   * Get current moderation settings with Bluesky compatibility
   */
  static async getModerationSettings(): Promise<ModerationSettings> {
    try {
      const settingsStr = await AsyncStorage.getItem(this.MODERATION_SETTINGS_KEY);
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        return settings;
      }
    } catch (error) {
      this.debugLog('getModerationSettings', 'Error loading settings', error);
    }
    
    // Return default settings compatible with Bluesky
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
   * Save moderation settings
   */
  static async saveModerationSettings(settings: ModerationSettings): Promise<void> {
    try {
      this.debugLog('saveModerationSettings', 'Saving settings', settings);
      await AsyncStorage.setItem(this.MODERATION_SETTINGS_KEY, JSON.stringify(settings));
      this.debugLog('saveModerationSettings', 'Settings saved successfully');
    } catch (error) {
      this.debugLog('saveModerationSettings', 'Error saving settings', error);
    }
  }
  
  /**
   * Get cached blocked users
   */
  static async getBlockedUsers(): Promise<Set<string>> {
    try {
      const blockedStr = await AsyncStorage.getItem(this.BLOCKED_USERS_KEY);
      if (blockedStr) {
        const blockedUsers = new Set(JSON.parse(blockedStr) as string[]);
        return blockedUsers;
      }
    } catch (error) {
      this.debugLog('getBlockedUsers', 'Error loading blocked users', error);
    }
    return new Set();
  }
  
  /**
   * Get cached muted users
   */
  static async getMutedUsers(): Promise<Set<string>> {
    try {
      const mutedStr = await AsyncStorage.getItem(this.MUTED_USERS_KEY);
      if (mutedStr) {
        const mutedUsers = new Set(JSON.parse(mutedStr) as string[]);
        return mutedUsers;
      }
    } catch (error) {
      this.debugLog('getMutedUsers', 'Error loading muted users', error);
    }
    return new Set();
  }
  
  /**
   * Cache blocked users
   */
  static async cacheBlockedUsers(userDids: string[]): Promise<void> {
    try {
      this.debugLog('cacheBlockedUsers', `Caching ${userDids.length} blocked users`);
      await AsyncStorage.setItem(this.BLOCKED_USERS_KEY, JSON.stringify(userDids));
      this.debugLog('cacheBlockedUsers', 'Blocked users cached successfully');
    } catch (error) {
      this.debugLog('cacheBlockedUsers', 'Error caching blocked users', error);
    }
  }
  
  /**
   * Cache muted users
   */
  static async cacheMutedUsers(userDids: string[]): Promise<void> {
    try {
      this.debugLog('cacheMutedUsers', `Caching ${userDids.length} muted users`);
      await AsyncStorage.setItem(this.MUTED_USERS_KEY, JSON.stringify(userDids));
      this.debugLog('cacheMutedUsers', 'Muted users cached successfully');
    } catch (error) {
      this.debugLog('cacheMutedUsers', 'Error caching muted users', error);
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
   * Sync moderation settings from Bluesky
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
      
      // TODO: Implement actual Bluesky API calls to fetch user preferences
      // This would involve calling Bluesky's moderation preferences endpoints
      
      // For now, we'll use local settings and log the sync attempt
      this.debugLog('syncModerationSettings', 'Moderation settings sync completed (local only)');
      
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