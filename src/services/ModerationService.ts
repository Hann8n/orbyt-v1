import AtprotoService from './api/AtprotoService';
import { ModerationSettings, LabelPreference, ModerationDecision, ModerationOpts, LabelDefinition } from './ModerationTypes';

// In-memory cache for moderation decisions
const moderationCache = new Map<string, ModerationDecision>();

export class ModerationService {
  // Cached settings used by filters and UI for instant access
  private static currentSettings: ModerationSettings | null = null;

  private static createDefaultSettings(): ModerationSettings {
    return {
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
        porn: 'hide',
        sexual: 'warn',
        nudity: 'warn',
        violence: 'warn',
        gore: 'hide',
        spam: 'hide',
        misleading: 'warn',
        hate: 'hide',
        intolerant: 'warn',
        impersonation: 'hide',
        scam: 'hide',
      },
      labelers: [],
      hiddenPosts: [],
    };
  }

  // Synchronous getter to use immediately in UI without awaiting API
  static getCachedModerationSettings(): ModerationSettings {
    return this.currentSettings ?? this.createDefaultSettings();
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
    // If we have cached settings, return them immediately and refresh in background
    if (this.currentSettings) {
      // Fire-and-forget background refresh to keep cache fresh
      this.refreshModerationSettingsFromAPI().catch(() => {});
      return this.currentSettings;
    }
    try {
      
      // Get preferences from Bluesky API
      const apiPreferences = await AtprotoService.getModerationPreferences();
      
      if (apiPreferences) {
        
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
          hiddenPosts: [],
        };
        
        this.currentSettings = settings;
        return settings;
      }
    } catch (error) {
      // Removed debugLog
    }
    
    // Return default settings if API call fails
    const defaultSettings: ModerationSettings = this.createDefaultSettings();
    this.currentSettings = defaultSettings;
    return defaultSettings;
  }

  private static async refreshModerationSettingsFromAPI(): Promise<void> {
    try {
      const apiPreferences = await AtprotoService.getModerationPreferences();
      if (!apiPreferences) return;
      const adultContentPref = apiPreferences.preferences?.find((pref: any) => 
        pref.$type === 'app.bsky.actor.defs#adultContentPref'
      );
      const adultContentEnabled = adultContentPref?.enabled ?? false;
      const labelPrefs = apiPreferences.preferences?.filter((pref: any) => 
        pref.$type === 'app.bsky.actor.defs#contentLabelPref'
      ) || [];
      const labels: Record<string, LabelPreference> = {};
      labelPrefs.forEach((pref: any) => {
        let preference: LabelPreference = 'warn';
        switch (pref.visibility) {
          case 'hide': preference = 'hide'; break;
          case 'warn': preference = 'warn'; break;
          case 'ignore': preference = 'ignore'; break;
          default: preference = 'warn';
        }
        labels[pref.label] = preference;
      });
      this.currentSettings = {
        hideSensitiveContent: true,
        hideAdultContent: true,
        hideViolence: true,
        hideSpam: true,
        hideMisleading: true,
        hideBlockedUsers: true,
        hideMutedUsers: true,
        showContentWarnings: true,
        autoExpandContentWarnings: false,
        adultContentEnabled,
        labels: {
          porn: labels.porn || 'hide',
          sexual: labels.sexual || 'warn',
          nudity: labels.nudity || 'warn',
          violence: labels.violence || 'warn',
          gore: labels.gore || 'hide',
          spam: labels.spam || 'hide',
          misleading: labels.misleading || 'warn',
          hate: labels.hate || 'hide',
          intolerant: labels.intolerant || 'warn',
          impersonation: labels.impersonation || 'hide',
          scam: labels.scam || 'hide',
          ...labels,
        },
        labelers: apiPreferences.labelers || [],
        hiddenPosts: [],
      };
    } catch (_) {
      // ignore background refresh errors
    }
  }
  
  /**
   * Save moderation settings to Bluesky API
   */
  static async saveModerationSettings(settings: ModerationSettings): Promise<void> {
    try {
      // Optimistically update cache so UI and filtering reflect immediately
      this.currentSettings = settings;
      
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
      
      const success = await AtprotoService.updateModerationPreferences(updatedPreferences);
      
      if (success) {
        // Removed debugLog
      } else {
        // Removed debugLog
        throw new Error('Failed to save settings to API');
      }
    } catch (error) {
      // Removed debugLog
      throw error;
    }
  }
  
  /**
   * Get blocked users from Bluesky API
   */
  static async getBlockedUsers(): Promise<Set<string>> {
    try {
      
      const blockedUsers = await AtprotoService.getBlockedUsersFromAPI();
      
      return new Set(blockedUsers);
    } catch (error) {
      // Removed debugLog
      return new Set();
    }
  }
  
  /**
   * Get muted users from Bluesky API
   */
  static async getMutedUsers(): Promise<Set<string>> {
    try {
      
      const mutedUsers = await AtprotoService.getMutedUsersFromAPI();
      
      return new Set(mutedUsers);
    } catch (error) {
      // Removed debugLog
      return new Set();
    }
  }
  
  /**
   * Clear the in-memory moderation cache (for manual reset or testing)
   */
  static clearModerationCache() {
    moderationCache.clear();
  }

  /**
   * Moderate a post using Bluesky-compatible logic, with in-memory caching
   */
  static async moderatePost(post: any, context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList'): Promise<ModerationDecision> {
    if (!post || !post.post) {
      return { filter: false, blur: false, informs: [] };
    }
    const uri = post.post.uri;
    if (moderationCache.has(uri)) {
      return moderationCache.get(uri)!;
    }
    
    const settings = await this.getModerationSettings();
    const blockedUsers = await this.getBlockedUsers();
    const mutedUsers = await this.getMutedUsers();
    
    const decision: ModerationDecision = {
      filter: false,
      blur: false,
      informs: [],
    };
    
    // Filter by blocked or muted users (always on)
    if (post.post.author?.did) {
      const authorDid = post.post.author.did;
      if (blockedUsers.has(authorDid)) {
        decision.filter = true;
        decision.reason = 'Author is blocked';
        decision.source = 'user_block';
        return decision;
      }
      if (mutedUsers.has(authorDid)) {
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
    
    // Muted words feature removed
    
    // Check if post is in hidden posts list
    if (settings.hiddenPosts.includes(post.post.uri)) {
      decision.filter = true;
      decision.reason = 'Post is hidden';
      decision.source = 'user_hide';
      return decision;
    }
    
    moderationCache.set(uri, decision);
    return decision;
  }
  

  

  
  /**
   * Sync moderation settings from Bluesky API
   */
  static async syncModerationSettings(): Promise<void> {
    try {
      
      // Get current user
      const currentUser = await AtprotoService.getCurrentUser();
      if (!currentUser?.did) {
        return;
      }
      
      // Fetch moderation preferences from API
      const apiPreferences = await AtprotoService.getModerationPreferences();
      if (apiPreferences) {
        // Removed debugLog
      } else {
        // Removed debugLog
      }
      
      // Fetch blocked and muted users from API (noop retained)
      await Promise.all([]);
      
      // Removed debugLog
      
    } catch (error) {
      // Removed debugLog
    }
  }
  
  /**
   * Open Bluesky moderation settings in the browser
   */
  static async openBlueskyModerationSettings(): Promise<void> {
    try {
      
      // Get current user to construct the settings URL
      const currentUser = await AtprotoService.getCurrentUser();
      if (currentUser?.did) {
        const settingsUrl = `https://bsky.app/settings/moderation`;
        
        // Removed debugLog
        
        // In a real implementation, you would use:
        // import { Linking } from 'react-native';
        // await Linking.openURL(settingsUrl);
      } else {
        // Removed debugLog
      }
    } catch (error) {
      // Removed debugLog
    }
  }
  
  /**
   * Get moderation statistics for debugging
   */
  static async getModerationStats(): Promise<{
    hiddenPosts: number;
    labelPreferences: Record<string, LabelPreference>;
  }> {
    try {
      const settings = await this.getModerationSettings();
      const stats = {
        hiddenPosts: settings.hiddenPosts.length,
        labelPreferences: settings.labels,
      };
      
      return stats;
    } catch (error) {
      // Removed debugLog
      return {
        hiddenPosts: 0,
        labelPreferences: {},
      };
    }
  }
  
  /**
   * Batch moderate multiple posts efficiently, using the in-memory cache
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
        const uri = post.post.uri;
        if (moderationCache.has(uri)) {
          return { post, decision: moderationCache.get(uri)! };
        }
        const decision = await this.moderatePostWithCachedSettings(
          post, 
          context, 
          settings,
          blockedUsers,
          mutedUsers
        );
        moderationCache.set(uri, decision);
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
    
    // Filter by blocked or muted users (always on)
    if (post.post.author?.did) {
      const authorDid = post.post.author.did;
      if (blockedUsers.has(authorDid)) {
        decision.filter = true;
        decision.reason = 'Author is blocked';
        decision.source = 'user_block';
        return decision;
      }
      if (mutedUsers.has(authorDid)) {
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
    
    // Muted words feature removed
    
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