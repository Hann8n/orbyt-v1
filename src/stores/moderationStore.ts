/**
 * Store for ModerationPrefs and labelDefs so non-React code (e.g. FeedService)
 * can build ModerationOpts when running the moderation batch.
 */

import { create } from 'zustand';
import type {
  ModerationPrefs,
  ModerationOpts,
  InterpretedLabelValueDefinition,
} from '@atproto/api';
import { storage } from '../utils/storage/storage';
import { logger } from '../utils/logger';

const moderationKey = (did: string) => 'moderation:' + did;

interface ModerationState {
  moderationPrefs: ModerationPrefs | null;
  labelDefs: Record<string, InterpretedLabelValueDefinition[]> | null;
  setModeration: (
    opts: {
      moderationPrefs: ModerationPrefs;
      labelDefs: Record<string, InterpretedLabelValueDefinition[]>;
    },
    userDid?: string
  ) => void;
  clearModeration: (userDid?: string) => void;
  hydrateFromCache: (did: string) => void;
}

export const useModerationStore = create<ModerationState>(set => ({
  moderationPrefs: null,
  labelDefs: null,
  setModeration: ({ moderationPrefs, labelDefs }, userDid) => {
    set({ moderationPrefs, labelDefs });
    if (userDid) {
      storage.set(moderationKey(userDid), JSON.stringify({ moderationPrefs, labelDefs }));
      logger.info('Moderation prefs persisted to MMKV', { component: 'moderationStore', userDid });
    }
  },
  clearModeration: userDid => {
    set({ moderationPrefs: null, labelDefs: null });
    if (userDid) {
      storage.delete(moderationKey(userDid));
      logger.info('Moderation prefs cleared from MMKV', { component: 'moderationStore', userDid });
    }
  },
  hydrateFromCache: did => {
    const cachedStr = storage.getString(moderationKey(did));
    if (!cachedStr) {
      logger.info('No cached moderation prefs in MMKV, will use fetch', {
        component: 'moderationStore',
        action: 'hydrateFromCache',
        did,
      });
      return;
    }
    try {
      const cached = JSON.parse(cachedStr) as {
        moderationPrefs: ModerationPrefs;
        labelDefs: Record<string, InterpretedLabelValueDefinition[]>;
      };
      set({ moderationPrefs: cached.moderationPrefs, labelDefs: cached.labelDefs });
      logger.info('Moderation prefs hydrated from MMKV', {
        component: 'moderationStore',
        action: 'hydrateFromCache',
        did,
      });
    } catch (e) {
      logger.warn('Failed to parse cached moderation prefs, fetch will repopulate', {
        component: 'moderationStore',
        action: 'hydrateFromCache',
        did,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
}));

/**
 * Get ModerationOpts for use in moderatePost/moderateNotification.
 * Returns null if prefs/labelDefs not loaded (batch will be skipped).
 */
export function getModerationOpts(userDid: string | undefined): ModerationOpts | null {
  const { moderationPrefs, labelDefs } = useModerationStore.getState();
  if (!moderationPrefs || !userDid) return null;
  return {
    userDid,
    prefs: moderationPrefs,
    labelDefs: labelDefs ?? undefined,
  };
}
