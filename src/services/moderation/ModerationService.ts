/**
 * Unified Moderation Service
 * Handles moderation preferences, label definitions, and content reporting.
 * Uses @atproto/api types - ModerationPrefs is the single source of truth.
 */

import { logger } from '../../utils/logger';
import { BLUESKY_APPVIEW_PROXY } from '../orbyt/serviceInfo';
import { queryClient } from '../../utils/query/queryClient';
import { queryKeys } from '../../utils/query/queryKeys';
import {
  AppBskyActorDefs,
  type Agent,
  type ModerationPrefs,
  type ModerationOpts,
} from '@atproto/api';
import { AtprotoCore } from '../api/core';
import { isValidDid } from '../../utils/atproto/uriValidation';

const MANAGED_LABEL_KEYS = ['porn', 'sexual', 'nudity', 'graphic-media'] as const;

export class ModerationService {
  /**
   * Fetch moderationPrefs and labelDefs via agent.getPreferences (which also
   * calls configureLabelers). Used by useModerationSettings and optionally
   * for prewarming the cache.
   */
  static async getModerationPrefsAndLabelDefs(agent: Agent | null | undefined): Promise<{
    moderationPrefs: ModerationPrefs;
    labelDefs: Record<string, import('@atproto/api').InterpretedLabelValueDefinition[]>;
  } | null> {
    if (!agent) return null;
    try {
      const prefs = await agent.getPreferences();
      const labelDefs = await agent.getLabelDefinitions(prefs.moderationPrefs);
      return { moderationPrefs: prefs.moderationPrefs, labelDefs };
    } catch (error) {
      logger.error('Failed to fetch moderation prefs and label defs', error, {
        component: 'ModerationService',
      });
      return null;
    }
  }

  /**
   * Save ModerationPrefs to the API: merges updated moderation preferences into
   * the raw preferences array and calls putPreferences. The raw preferences array
   * is required to preserve other preference types that are not managed by this service.
   * agent.getPreferences() returns structured BskyPreferences with moderationPrefs
   * extracted, but does not expose the raw array needed for merging.
   */
  static async saveModerationPrefs(
    prefs: ModerationPrefs,
    agent: Agent | undefined,
    userDid: string | undefined
  ): Promise<void> {
    if (!agent) throw new Error('No agent provided. Cannot save moderation prefs.');

    try {
      // Use low-level API to get raw preferences array for merging (preserves other prefs)
      const res = await agent.api.app.bsky.actor.getPreferences();
      const raw = (res.data?.preferences ?? []) as Array<{ $type?: string; label?: string }>;

      const preserved = raw.filter(p => {
        if (!p?.$type) return false;
        if (p.$type === 'app.bsky.actor.defs#adultContentPref') return false;
        if (p.$type === 'app.bsky.actor.defs#labelersPref') return false;
        if (p.$type === 'app.bsky.actor.defs#mutedWordsPref') return false;
        if (p.$type === 'app.bsky.actor.defs#hiddenPostsPref') return false;
        if (
          p.$type === 'app.bsky.actor.defs#contentLabelPref' &&
          p.label &&
          (MANAGED_LABEL_KEYS as readonly string[]).includes(p.label)
        )
          return false;
        return true;
      });

      const built: Array<Record<string, unknown>> = [
        {
          $type: 'app.bsky.actor.defs#adultContentPref',
          enabled: prefs.adultContentEnabled ?? false,
        },
      ];

      for (const k of MANAGED_LABEL_KEYS) {
        const vis = prefs.labels?.[k] ?? 'hide';
        built.push({ $type: 'app.bsky.actor.defs#contentLabelPref', label: k, visibility: vis });
      }

      // Save labelers list (just DIDs - labeler-specific labels are saved separately as contentLabelPref with labelerDid)
      built.push({
        $type: 'app.bsky.actor.defs#labelersPref',
        labelers: prefs.labelers.map(l => ({ did: l.did })),
      });

      // Save labeler-specific label preferences (each label gets its own contentLabelPref with labelerDid)
      for (const labeler of prefs.labelers) {
        if (labeler.labels) {
          for (const [label, visibility] of Object.entries(labeler.labels)) {
            built.push({
              $type: 'app.bsky.actor.defs#contentLabelPref',
              label,
              visibility: visibility as 'ignore' | 'show' | 'warn' | 'hide',
              labelerDid: labeler.did,
            });
          }
        }
      }

      built.push({
        $type: 'app.bsky.actor.defs#mutedWordsPref',
        items: prefs.mutedWords ?? [],
      });

      built.push({
        $type: 'app.bsky.actor.defs#hiddenPostsPref',
        items: (prefs.hiddenPosts ?? []).map(uri => ({ uri })),
      });

      const merged = [...built, ...preserved];
      await agent.api.app.bsky.actor.putPreferences({
        preferences: merged as AppBskyActorDefs.Preferences,
      });

      if (userDid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.moderation.byUser(userDid),
          exact: true,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.moderation.all, exact: false });
      }
    } catch (error) {
      logger.error('Failed to save moderation prefs', error, { component: 'ModerationService' });
      throw error;
    }
  }

  /**
   * Report a post or user for moderation
   * @param uri - URI of the content to report (post or user)
   * @param reasonType - The reason for reporting (can be simple type or full namespace type)
   * @param reason - Optional additional context for the report
   * @returns A boolean indicating whether the report was successfully submitted
   */
  static async reportContent(
    uri: string,
    reasonType: string | 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other',
    reason?: string
  ): Promise<boolean> {
    try {
      await AtprotoCore.ensureSession();

      // For posts, we need the CID in addition to URI for proper reporting
      let cid: string | undefined;
      let subject: { $type?: string; uri?: string; cid?: string; did?: string } = {};

      // Convert simple reason types to full namespace format if needed
      let fullReasonType = reasonType;
      if (!reasonType.includes('#')) {
        const reasonMap: Record<string, string> = {
          spam: 'com.atproto.moderation.defs#reasonSpam',
          violation: 'com.atproto.moderation.defs#reasonViolation',
          misleading: 'com.atproto.moderation.defs#reasonMisleading',
          sexual: 'com.atproto.moderation.defs#reasonSexual',
          rude: 'com.atproto.moderation.defs#reasonRude',
          other: 'com.atproto.moderation.defs#reasonOther',
        };
        fullReasonType = reasonMap[reasonType] || 'com.atproto.moderation.defs#reasonOther';
      }

      // Determine if we're reporting a post or user
      if (uri.includes('app.bsky.feed.post')) {
        try {
          const { api } = await AtprotoCore.getApiClient();
          const postResponse = await api.app.bsky.feed.getPostThread({ uri, depth: 0 });
          const thread = postResponse.data.thread;
          if (
            thread &&
            thread.$type === 'app.bsky.feed.defs#threadViewPost' &&
            'post' in thread &&
            thread.post?.cid
          ) {
            cid = thread.post.cid;
          }
        } catch (_error: unknown) {
          // ignore
        }
        subject = { $type: 'com.atproto.repo.strongRef' as const, uri, ...(cid && { cid }) };
      } else if (isValidDid(uri)) {
        subject = { $type: 'com.atproto.admin.defs#repoRef' as const, did: uri };
      } else {
        subject = { $type: 'com.atproto.repo.strongRef' as const, uri };
      }

      const subjectPayload = subject as { $type: string; uri?: string; cid?: string; did?: string };

      // Reports go to Bluesky's AppView, as in Orbyt iOS: the session's grant covers
      // `createReport` for that audience, and the PDS would otherwise pick its own report service.
      const { api } = await AtprotoCore.getApiClient();
      await api.com.atproto.moderation.createReport(
        { reasonType: fullReasonType, subject: subjectPayload, reason },
        { headers: { 'atproto-proxy': BLUESKY_APPVIEW_PROXY } }
      );

      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Get ModerationOpts from React Query cache for use in moderatePost/moderateNotification.
   * Returns null if prefs/labelDefs not loaded (batch will be skipped).
   */
  static getModerationOpts(userDid: string | undefined): ModerationOpts | null {
    if (!userDid) return null;

    const cached = queryClient.getQueryData<{
      moderationPrefs: ModerationPrefs;
      labelDefs: Record<string, import('@atproto/api').InterpretedLabelValueDefinition[]>;
    }>(queryKeys.moderation.byUser(userDid));

    if (!cached?.moderationPrefs) return null;

    return {
      userDid,
      prefs: cached.moderationPrefs,
      labelDefs: cached.labelDefs ?? undefined,
    };
  }
}
