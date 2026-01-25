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

interface ModerationState {
  moderationPrefs: ModerationPrefs | null;
  labelDefs: Record<string, InterpretedLabelValueDefinition[]> | null;
  setModeration: (opts: {
    moderationPrefs: ModerationPrefs;
    labelDefs: Record<string, InterpretedLabelValueDefinition[]>;
  }) => void;
  clearModeration: () => void;
}

export const useModerationStore = create<ModerationState>(set => ({
  moderationPrefs: null,
  labelDefs: null,
  setModeration: ({ moderationPrefs, labelDefs }) => set({ moderationPrefs, labelDefs }),
  clearModeration: () => set({ moderationPrefs: null, labelDefs: null }),
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
