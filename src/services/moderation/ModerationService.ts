import { ModerationSettings } from './ModerationTypes';
import { logger } from '../../utils/logger';
import { queryClient } from '../../utils/query/queryClient';
import { queryKeys } from '../../utils/query/queryKeys';
import type { Agent } from '@atproto/api';
import type { ActorPreferences, GetPreferencesOutput } from '../api/types';

/**
 * Moderation Service for Bluesky content filtering
 * Uses user preferences from API to filter and blur content appropriately
 */
export class ModerationService {
  private static currentSettings: ModerationSettings | null = null;

  /**
   * Get cached moderation settings (synchronous version for immediate UI access)
   * Tries to read from React Query cache first, then falls back to static cache
   */
  static getCachedModerationSettings(userDid?: string): ModerationSettings {
    // Try to read from React Query cache first
    if (userDid) {
      const queryData = queryClient.getQueryData<ModerationSettings>(
        queryKeys.moderation.byUser(userDid)
      );
      if (queryData) {
        return queryData;
      }
    }

    // Fall back to static cache (for backward compatibility)
    return this.currentSettings ?? this.createSafeDefaultSettings();
  }

  /**
   * Clear moderation settings cache (for account switching)
   * This ensures fresh settings are fetched for the new account
   */
  static clearModerationSettings(): void {
    this.currentSettings = null;
  }

  /**
   * Fetch moderation settings from API (no caching)
   * Used by React Query hook for account-scoped caching
   * @deprecated Use useModerationSettings() hook instead for React Query integration
   */
  static async fetchModerationSettings(agent?: Agent): Promise<ModerationSettings> {
    // If no agent, return safe defaults (fail-safe)
    if (!agent) {
      logger.warn('No agent provided for moderation settings, using safe defaults', {
        component: 'ModerationService',
      });
      return this.createSafeDefaultSettings();
    }

    try {
      // Fetch preferences from API
      const response = await agent.api.app.bsky.actor.getPreferences();
      const output = response.data as GetPreferencesOutput;
      const preferences = (Array.isArray(output?.preferences)
        ? output.preferences
        : []) as unknown as ActorPreferences[];

      const settings = this.convertPreferencesToSettings(preferences);

      return settings;
    } catch (error) {
      // Fail-safe: return strict defaults if API call fails
      logger.error('Failed to fetch moderation settings from API, using safe defaults', error, {
        component: 'ModerationService',
      });
      return this.createSafeDefaultSettings();
    }
  }

  /**
   * Get moderation settings from API or cache
   * Fails safe: returns strict defaults if API fails
   * @deprecated Use useModerationSettings() hook instead for React Query integration
   */
  static async getModerationSettings(agent?: Agent): Promise<ModerationSettings> {
    // Return cached settings if available (for backward compatibility)
    if (this.currentSettings) {
      return this.currentSettings;
    }

    // Use fetchModerationSettings and cache the result
    const settings = await this.fetchModerationSettings(agent);
    this.currentSettings = settings;

    return settings;
  }

  /**
   * Save moderation settings to the API
   */
  static async saveModerationSettings(
    settings: ModerationSettings,
    agent?: Agent,
    userDid?: string
  ): Promise<void> {
    try {
      if (!agent) {
        throw new Error('No agent provided. Cannot save moderation settings.');
      }

      // Fetch existing preferences first to preserve all preference types
      let existingPreferences: ActorPreferences[] = [];
      try {
        const response = await agent.api.app.bsky.actor.getPreferences();
        const output = response.data as GetPreferencesOutput;
        existingPreferences = (Array.isArray(output?.preferences)
          ? output.preferences
          : []) as unknown as ActorPreferences[];
      } catch (error) {
        logger.warn('Could not fetch existing preferences before saving', {
          error,
          component: 'ModerationService',
        });
      }

      // Convert settings to preferences format, merging with existing preferences
      const preferences = this.convertSettingsToPreferences(settings, existingPreferences);

      // Save all preferences to the API
      await agent.api.app.bsky.actor.putPreferences({ preferences: preferences as any });

      // Update cached settings after successful save (for backward compatibility)
      this.currentSettings = settings;

      // Invalidate React Query cache for this user's moderation settings
      if (userDid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.moderation.byUser(userDid),
          exact: true,
        });
      } else {
        // If no DID provided, invalidate all moderation queries (fallback)
        queryClient.invalidateQueries({
          queryKey: queryKeys.moderation.all,
          exact: false,
        });
      }
    } catch (error) {
      logger.error('Failed to save moderation settings', error, { component: 'ModerationService' });
      throw error;
    }
  }

  /**
   * Sync moderation settings from the API
   */
  static async syncModerationSettings(agent?: Agent): Promise<void> {
    try {
      if (!agent) {
        logger.warn('No agent provided for sync, skipping', { component: 'ModerationService' });
        return;
      }

      const response = await agent.api.app.bsky.actor.getPreferences();
      const output = response.data as GetPreferencesOutput;
      const preferences = (Array.isArray(output?.preferences)
        ? output.preferences
        : []) as unknown as ActorPreferences[];
      const settings = this.convertPreferencesToSettings(preferences);
      this.currentSettings = settings;
    } catch (error) {
      logger.error('Failed to sync moderation settings', error, { component: 'ModerationService' });
      throw error;
    }
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
  private static convertPreferencesToSettings(preferences: ActorPreferences[]): ModerationSettings {
    const settings = this.createSafeDefaultSettings();

    if (!preferences || !Array.isArray(preferences)) {
      return settings;
    }

    for (const pref of preferences) {
      if (
        !pref ||
        typeof pref !== 'object' ||
        !('$type' in pref) ||
        typeof pref.$type !== 'string'
      ) {
        continue;
      }

      switch (pref.$type) {
        case 'app.bsky.actor.defs#adultContentPref': {
          const adultPref = pref as any;
          if ('enabled' in adultPref && typeof adultPref.enabled === 'boolean') {
            settings.adultContentEnabled = adultPref.enabled;
          }
          break;
        }

        case 'app.bsky.actor.defs#contentLabelPref': {
          const labelPref = pref as any;
          if (
            'label' in labelPref &&
            typeof labelPref.label === 'string' &&
            'visibility' in labelPref &&
            typeof labelPref.visibility === 'string'
          ) {
            const validVisibility = ['hide', 'warn', 'ignore'].includes(labelPref.visibility)
              ? (labelPref.visibility as 'hide' | 'warn' | 'ignore')
              : 'hide'; // Fail-safe: default to hide
            settings.labels[labelPref.label] = validVisibility;
          }
          break;
        }

        case 'app.bsky.actor.defs#hiddenPostsPref': {
          const hiddenPref = pref as any;
          if ('items' in hiddenPref && Array.isArray(hiddenPref.items)) {
            settings.hiddenPosts = hiddenPref.items
              .map((item: unknown) =>
                item && typeof item === 'object' && 'uri' in item && typeof item.uri === 'string'
                  ? item.uri
                  : ''
              )
              .filter(Boolean);
          }
          break;
        }

        case 'app.bsky.actor.defs#labelersPref': {
          const labelersPref = pref as any;
          if ('labelers' in labelersPref && Array.isArray(labelersPref.labelers)) {
            settings.labelers = labelersPref.labelers
              .map((labeler: unknown) => {
                if (
                  labeler &&
                  typeof labeler === 'object' &&
                  'did' in labeler &&
                  typeof labeler.did === 'string'
                ) {
                  return {
                    did: labeler.did,
                    labels:
                      'labels' in labeler && typeof labeler.labels === 'object' && labeler.labels
                        ? (labeler.labels as Record<string, string>)
                        : {},
                  };
                }
                return null;
              })
              .filter((l: any): l is { did: string; labels: Record<string, string> } => l !== null);
          }
          break;
        }

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
    existingPreferences: ActorPreferences[]
  ): ActorPreferences[] {
    const managedLabels = new Set(['nsfw', 'suggestive', 'nudity', 'gore']);
    const preservedPreferences: ActorPreferences[] = [];

    // Preserve non-managed preferences
    for (const pref of existingPreferences || []) {
      if (
        !pref ||
        typeof pref !== 'object' ||
        !('$type' in pref) ||
        typeof pref.$type !== 'string'
      ) {
        continue;
      }

      if (pref.$type === 'app.bsky.actor.defs#adultContentPref') {
        // We'll replace this one
        continue;
      } else if (pref.$type === 'app.bsky.actor.defs#contentLabelPref') {
        // Only preserve content label prefs we don't manage
        const labelPref = pref as any;
        if (
          'label' in labelPref &&
          typeof labelPref.label === 'string' &&
          !managedLabels.has(labelPref.label)
        ) {
          preservedPreferences.push(pref);
        }
      } else {
        // Preserve all other preference types
        preservedPreferences.push(pref);
      }
    }

    // Build preferences array
    const preferences: ActorPreferences[] = [];

    // Add adult content preference
    preferences.push({
      $type: 'app.bsky.actor.defs#adultContentPref',
      enabled: settings.adultContentEnabled || false,
    } as unknown as ActorPreferences);

    // Add content label preferences for labels we manage
    const labelKeys = ['nsfw', 'suggestive', 'nudity', 'gore'];
    for (const labelKey of labelKeys) {
      const visibility = settings.labels[labelKey] || 'hide';
      preferences.push({
        $type: 'app.bsky.actor.defs#contentLabelPref',
        label: labelKey,
        visibility: visibility,
      } as unknown as ActorPreferences);
    }

    // Add all preserved preferences
    preferences.push(...preservedPreferences);

    return preferences;
  }
}
