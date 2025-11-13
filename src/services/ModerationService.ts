import { ModerationSettings, ModerationDecision, ModerationOpts as BlueskyModerationOpts } from './ModerationTypes';
import { logger } from '../utils/logger';

/**
 * Moderation Service for Bluesky content filtering
 * Uses user preferences from API to filter and blur content appropriately
 */
export class ModerationService {
  private static currentSettings: ModerationSettings | null = null;
  private static currentModerationOpts: BlueskyModerationOpts | null = null;
  private static moderationCache = new Map<string, ModerationDecision>();

  /**
   * Get cached moderation settings (synchronous version for immediate UI access)
   */
  static getCachedModerationSettings(): ModerationSettings {
    return this.currentSettings ?? this.createSafeDefaultSettings();
  }

  /**
   * Clear the in-memory moderation cache
   */
  static clearModerationCache(): void {
    this.moderationCache.clear();
  }

  /**
   * Moderate a profile (simplified implementation)
   */
  static async moderateProfile(profile: any, context: 'profileList' | 'profileView' | 'avatar' | 'banner' = 'profileList'): Promise<ModerationDecision> {
    return { filter: false, blur: false, informs: [] };
  }

  /**
   * Moderate a notification (simplified implementation)
   */
  static async moderateNotification(notification: any): Promise<ModerationDecision> {
    return { filter: false, blur: false, informs: [] };
  }

  /**
   * Get moderation settings from API or cache
   * Fails safe: returns strict defaults if API fails
   */
  static async getModerationSettings(agent?: any): Promise<ModerationSettings> {
    // Return cached settings if available
    if (this.currentSettings) {
      return this.currentSettings;
    }

    // If no agent, return safe defaults (fail-safe)
    if (!agent) {
      logger.warn('No agent provided for moderation settings, using safe defaults', { component: 'ModerationService' });
      return this.createSafeDefaultSettings();
    }

    try {
      // Fetch preferences from API
      const response = await agent.api.app.bsky.actor.getPreferences();
      const preferences = response.data?.preferences || [];
      
      if (!Array.isArray(preferences)) {
        logger.warn('Invalid preferences format from API', { component: 'ModerationService' });
        return this.createSafeDefaultSettings();
      }

      const settings = this.convertPreferencesToSettings(preferences);
      this.currentSettings = settings;
      
      logger.debug('Moderation settings loaded from API', { 
        component: 'ModerationService',
        adultContentEnabled: settings.adultContentEnabled,
        labelCount: Object.keys(settings.labels).length
      });
      
      return settings;
    } catch (error) {
      // Fail-safe: return strict defaults if API call fails
      logger.error('Failed to fetch moderation settings from API, using safe defaults', error, { component: 'ModerationService' });
      return this.createSafeDefaultSettings();
    }
  }

  /**
   * Save moderation settings to the API
   */
  static async saveModerationSettings(settings: ModerationSettings, agent?: any): Promise<void> {
    try {
      if (!agent) {
        throw new Error('No agent provided. Cannot save moderation settings.');
      }

      // Fetch existing preferences first to preserve all preference types
      let existingPreferences: any[] = [];
      try {
        const response = await agent.api.app.bsky.actor.getPreferences();
        existingPreferences = response.data?.preferences || [];
      } catch (error) {
        logger.warn('Could not fetch existing preferences before saving', { error, component: 'ModerationService' });
      }

      // Convert settings to preferences format, merging with existing preferences
      const preferences = this.convertSettingsToPreferences(settings, existingPreferences);

      // Save all preferences to the API
      await agent.api.app.bsky.actor.putPreferences({ preferences });
      
      // Update cached settings after successful save
      this.currentSettings = settings;
      this.currentModerationOpts = null;
      
      // Clear moderation decisions cache so posts are re-evaluated with new settings
      this.clearModerationCache();
      
      logger.debug('Moderation settings saved successfully', { component: 'ModerationService' });
    } catch (error) {
      logger.error('Failed to save moderation settings', error, { component: 'ModerationService' });
      throw error;
    }
  }

  /**
   * Sync moderation settings from the API
   */
  static async syncModerationSettings(agent?: any): Promise<void> {
    try {
      if (!agent) {
        logger.warn('No agent provided for sync, skipping', { component: 'ModerationService' });
        return;
      }

      const response = await agent.api.app.bsky.actor.getPreferences();
      const preferences = response.data?.preferences || [];
      const settings = this.convertPreferencesToSettings(preferences);
      this.currentSettings = settings;
      
      // Clear cache when settings are synced
      this.clearModerationCache();
      
      logger.debug('Moderation settings synced from API', { component: 'ModerationService' });
    } catch (error) {
      logger.error('Failed to sync moderation settings', error, { component: 'ModerationService' });
      throw error;
    }
  }

  /**
   * Moderate a single post based on labels and user preferences
   * Fail-safe: defaults to hiding sensitive content if moderation fails
   */
  static async moderatePost(
    post: any, 
    context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList', 
    agent?: any
  ): Promise<ModerationDecision> {
    if (!post || !post.post) {
      return { filter: false, blur: false, informs: [] };
    }

    const uri = post.post.uri;
    if (!uri) {
      return { filter: false, blur: false, informs: [] };
    }

    // Check cache first
    if (this.moderationCache.has(uri)) {
      return this.moderationCache.get(uri)!;
    }

    // Fail-safe decision: if moderation fails, hide sensitive content
    const failSafeDecision: ModerationDecision = {
      filter: true,
      blur: false,
      informs: [],
      reason: 'Content Warning'
    };

    try {
      // Get settings - will return safe defaults if API fails
      const settings = await this.getModerationSettings(agent);
      
      // Get labels from post
      const labels = post.post.labels || post.labels || [];
      const text = post.post.text?.toLowerCase() || '';

      const decision: ModerationDecision = {
        filter: false,
        blur: false,
        informs: [],
        reason: undefined
      };

      const reasons: string[] = [];

      // Check each content type and apply user preferences
      const contentChecks = [
        { 
          detected: this.detectContentType('nsfw', text, labels),
          preference: settings.labels.nsfw,
          reason: 'NSFW Content'
        },
        {
          detected: this.detectContentType('suggestive', text, labels),
          preference: settings.labels.suggestive,
          reason: 'Suggestive Content'
        },
        {
          detected: this.detectContentType('nudity', text, labels),
          preference: settings.labels.nudity,
          reason: 'Nudity'
        },
        {
          detected: this.detectContentType('gore', text, labels),
          preference: settings.labels.gore,
          reason: 'Graphic Media'
        }
      ];

      for (const check of contentChecks) {
        if (check.detected) {
          if (check.preference === 'hide') {
            decision.filter = true;
            if (!reasons.includes(check.reason)) {
              reasons.push(check.reason);
            }
          } else if (check.preference === 'warn') {
            decision.blur = true;
            if (!reasons.includes(check.reason)) {
              reasons.push(check.reason);
            }
          }
          // Track content type for informs
          decision.informs.push(check.detected);
        }
      }

      // Set reason field for UI display
      if (reasons.length > 0) {
        decision.reason = reasons.join(', ');
      }

      // Cache the decision
      this.moderationCache.set(uri, decision);
      return decision;
    } catch (error) {
      // Fail-safe: if moderation fails, hide content by default
      logger.error('Error moderating post, using fail-safe decision', error, { 
        component: 'ModerationService',
        uri: uri.substring(0, 50)
      });
      
      // Cache fail-safe decision to avoid repeated errors
      this.moderationCache.set(uri, failSafeDecision);
      return failSafeDecision;
    }
  }

  /**
   * Batch moderate multiple posts efficiently
   * Fail-safe: filters out posts if moderation fails
   */
  static async batchModeratePosts(
    posts: any[], 
    context: 'contentList' | 'contentView' | 'avatar' | 'banner' = 'contentList', 
    agent?: any
  ): Promise<{
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

    // Pre-fetch settings once for all posts (more efficient)
    let settings: ModerationSettings;
    try {
      settings = await this.getModerationSettings(agent);
    } catch (error) {
      logger.error('Failed to load moderation settings for batch moderation, using safe defaults', error, { component: 'ModerationService' });
      settings = this.createSafeDefaultSettings();
    }

    const moderationDecisions = new Map<string, ModerationDecision>();
    const filteredPosts: any[] = [];
    let filteredCount = 0;
    let blurredCount = 0;
    let allowedCount = 0;

    // Process posts - can be parallelized if needed, but sequential is safer for now
    for (const post of posts) {
      try {
        const decision = await this.moderatePost(post, context, agent);
        const postUri = post?.post?.uri;
        
        if (postUri) {
          moderationDecisions.set(postUri, decision);
          
          // Attach the moderation decision to the post
          if (post.post) {
            post.post.moderationDecision = decision;
          }
          if (post) {
            post.moderationDecision = decision;
          }
        }
        
        // Apply filtering based on decision
        if (decision.filter) {
          filteredCount++;
          // Don't include filtered posts in feed
        } else if (decision.blur) {
          blurredCount++;
          filteredPosts.push(post);
        } else {
          allowedCount++;
          filteredPosts.push(post);
        }
      } catch (error) {
        // Fail-safe: if moderation fails for a post, filter it out (don't show)
        logger.warn('Error moderating post in batch, filtering out', { 
          error, 
          component: 'ModerationService',
          uri: post?.post?.uri?.substring(0, 50)
        });
        filteredCount++;
        // Don't include the post in filteredPosts (fail-safe)
      }
    }

    return {
      filteredPosts,
      moderationDecisions,
      stats: {
        total: posts.length,
        filtered: filteredCount,
        blurred: blurredCount,
        allowed: allowedCount
      }
    };
  }

  /**
   * Basic fail-safe filtering: filter out posts with sensitive labels
   * Used when moderation service is unavailable
   */
  static filterSensitiveByLabels(posts: any[]): any[] {
    if (!posts || posts.length === 0) {
      return [];
    }

    const sensitiveLabels = ['nsfw', 'porn', 'sexual', 'suggestive', 'nudity', 'gore', 'graphic-media'];
    
    return posts.filter((post: any) => {
      const labels = post?.post?.labels || post?.labels || [];
      const hasSensitiveLabel = labels.some((label: any) => {
        const val = label?.val || label?.value || label;
        if (typeof val !== 'string') return false;
        const lowerVal = val.toLowerCase();
        return sensitiveLabels.some(sensitive => lowerVal.includes(sensitive));
      });
      return !hasSensitiveLabel;
    });
  }

  /**
   * Unified content detection method
   * Detects content type based on labels and text
   */
  private static detectContentType(type: 'nsfw' | 'suggestive' | 'nudity' | 'gore', text: string, labels: any[]): string | null {
    if (!labels || !Array.isArray(labels)) {
      labels = [];
    }

    const typeConfig = {
      nsfw: {
        labelValues: ['nsfw', 'porn', 'sexual'],
        keywords: ['nsfw', 'porn', 'sex', 'adult', 'explicit']
      },
      suggestive: {
        labelValues: ['suggestive', 'sexual'],
        keywords: ['suggestive', 'provocative', 'sexy', 'hot']
      },
      nudity: {
        labelValues: ['nudity', 'artistic-nudity'],
        keywords: ['nude', 'nudity', 'naked', 'artistic']
      },
      gore: {
        labelValues: ['gore', 'graphic-media'],
        keywords: ['gore', 'blood', 'violence', 'graphic']
      }
    };

    const config = typeConfig[type];
    
    // Check labels
    const hasLabel = labels.some(label => {
      const labelVal = label?.val || label?.value || label;
      if (typeof labelVal !== 'string') return false;
      
      const lowerVal = labelVal.toLowerCase();
      return config.labelValues.some(val => 
        lowerVal === val || lowerVal.includes(val)
      );
    });

    // Check keywords in text
    const hasKeyword = config.keywords.some(keyword => text.includes(keyword));

    return (hasLabel || hasKeyword) ? type : null;
  }

  /**
   * Create safe default settings (fail-safe: hide sensitive content by default)
   */
  private static createSafeDefaultSettings(): ModerationSettings {
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
      // Fail-safe: hide sensitive content by default
      labels: {
        nsfw: 'hide',
        suggestive: 'hide',
        nudity: 'hide',
        gore: 'hide',
      },
      labelers: [],
      hiddenPosts: [],
    };
  }

  /**
   * Convert API preferences to ModerationSettings
   */
  private static convertPreferencesToSettings(preferences: any[]): ModerationSettings {
    const settings = this.createSafeDefaultSettings();
    
    if (!preferences || !Array.isArray(preferences)) {
      return settings;
    }
    
    for (const pref of preferences) {
      if (!pref || !pref.$type) {
        continue;
      }
      
      switch (pref.$type) {
        case 'app.bsky.actor.defs#adultContentPref':
          if (typeof pref.enabled === 'boolean') {
            settings.adultContentEnabled = pref.enabled;
          }
          break;
          
        case 'app.bsky.actor.defs#contentLabelPref':
          if (pref.label && typeof pref.visibility === 'string') {
            const validVisibility = ['hide', 'warn', 'ignore'].includes(pref.visibility) 
              ? pref.visibility as 'hide' | 'warn' | 'ignore'
              : 'hide'; // Fail-safe: default to hide
            settings.labels[pref.label] = validVisibility;
          }
          break;
          
        case 'app.bsky.actor.defs#hiddenPostsPref':
          if (pref.items && Array.isArray(pref.items)) {
            settings.hiddenPosts = pref.items
              .map((item: any) => item.uri || '')
              .filter(Boolean);
          }
          break;
          
        case 'app.bsky.actor.defs#labelersPref':
          if (pref.labelers && Array.isArray(pref.labelers)) {
            settings.labelers = pref.labelers
              .map((labeler: any) => ({
                did: labeler.did || '',
                labels: labeler.labels || {}
              }))
              .filter((l: any) => l.did);
          }
          break;
          
        // Other preference types are preserved but not parsed
        default:
          break;
      }
    }
    
    return settings;
  }

  /**
   * Convert ModerationSettings to Bluesky preferences format
   * Merges with existing preferences to preserve all preference types
   */
  private static convertSettingsToPreferences(
    settings: ModerationSettings,
    existingPreferences: any[]
  ): any[] {
    const managedLabels = new Set(['nsfw', 'suggestive', 'nudity', 'gore']);
    const preservedPreferences: any[] = [];
    
    // Preserve non-managed preferences
    for (const pref of existingPreferences || []) {
      if (!pref || !pref.$type) {
        continue;
      }
      
      if (pref.$type === 'app.bsky.actor.defs#adultContentPref') {
        // We'll replace this one
        continue;
      } else if (pref.$type === 'app.bsky.actor.defs#contentLabelPref') {
        // Only preserve content label prefs we don't manage
        if (pref.label && !managedLabels.has(pref.label)) {
          preservedPreferences.push(pref);
        }
      } else {
        // Preserve all other preference types
        preservedPreferences.push(pref);
      }
    }
    
    // Build preferences array
    const preferences: any[] = [];
    
    // Add adult content preference
    preferences.push({
      $type: 'app.bsky.actor.defs#adultContentPref',
      enabled: settings.adultContentEnabled || false
    });
    
    // Add content label preferences for labels we manage
    const labelKeys = ['nsfw', 'suggestive', 'nudity', 'gore'];
    for (const labelKey of labelKeys) {
      const visibility = settings.labels[labelKey] || 'hide';
      preferences.push({
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: labelKey,
        visibility: visibility
      });
    }
    
    // Add all preserved preferences
    preferences.push(...preservedPreferences);
    
    return preferences;
  }
}
