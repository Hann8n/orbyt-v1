/**
 * Repo Service - com.atproto.repo.* namespace operations
 * Handles all repository-related API operations including record creation, retrieval, and updates
 */

import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import type {
  ProfileRecord,
  OrbytProfileRecord,
  GetRecordOutput,
  ListRecordsOutput,
} from '../types';
import type { SubscribedChannel } from '../../../stores/userStore';

export class RepoService {
  /**
   * Upload a video file to Bluesky
   * @param videoPath - Path to the video file
   * @returns Blob reference for the uploaded video
   */
  static async uploadVideo(videoPath: string): Promise<{ ref: { $link: string }; mimeType: string; size: number }> {
    try {
      await AtprotoCore.ensureSession();
      
      if (!videoPath.startsWith('file://')) {
        throw new Error('Unsupported video format');
      }

      // Fetch the video file
      const response = await fetch(videoPath);
      const videoBlob = await response.blob();

      // Upload the video to Bluesky
      const { api } = await AtprotoCore.getApiClient();
      const uploadResult = await api.uploadBlob(videoBlob, {
        encoding: 'video/mp4'
      });

      return uploadResult.data.blob;
    } catch (error: unknown) {
      throw error;
    }
  }

  /**
   * Get the orbyt profile record for the current user
   * @returns Orbyt profile record or null
   */
  static async getOrbytProfileRecord(): Promise<unknown | null> {
    try {
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) return null;
      const { api } = await AtprotoCore.getApiClient();
      try {
        const rec = await api.com.atproto.repo.getRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        return rec?.data?.value || null;
      } catch (e) {
        // Fallback: try listRecords once
        try {
          const list = await api.com.atproto.repo.listRecords({
            repo: userDid,
            collection: 'com.getorbyt.profile',
            limit: 1,
          });
          const first = list?.data?.records?.[0]?.value;
          return first || null;
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }
  }

  /**
   * Fetch the orbyt profile record for any DID by hitting that DID's PDS directly
   * @param did - DID to fetch record for
   * @returns Orbyt profile record or null
   */
  static async getOrbytProfileRecordForDid(did: string): Promise<unknown | null> {
    try {
      if (!did) return null;
      // Use dynamic import to avoid circular dependency with AtprotoService
      const { default: AtprotoService } = await import('../AtprotoService');
      const agent = await AtprotoService.getAgentForRepo(did);
      if (!agent) return null;
      // Prefer stable rkey 'self'
      try {
        const rec = await agent.api.com.atproto.repo.getRecord({
          repo: did,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        return rec?.data?.value || null;
      } catch {
        try {
          const list = await agent.api.com.atproto.repo.listRecords({
            repo: did,
            collection: 'com.getorbyt.profile',
            limit: 1,
          });
          return list?.data?.records?.[0]?.value || null;
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }
  }

  /**
   * Fetch both profile records (standard and custom) using listRecords in parallel
   * This ensures both records are always fetched together
   * @param did - DID to fetch records for
   * @returns Object with profileRecord and orbytRecord
   */
  static async getProfileRecordsForDid(did: string): Promise<{
    profileRecord: ProfileRecord | null;
    orbytRecord: OrbytProfileRecord | null;
  }> {
    try {
      if (!did) return { profileRecord: null, orbytRecord: null };
      
      // Use dynamic import to avoid circular dependency with AtprotoService
      const { default: AtprotoService } = await import('../AtprotoService');
      const agent = await AtprotoService.getAgentForRepo(did);
      if (!agent) return { profileRecord: null, orbytRecord: null };

      // Fetch both records in parallel using listRecords
      const [profileRecords, orbytRecords] = await Promise.all([
        agent.api.com.atproto.repo.listRecords({
          repo: did,
          collection: 'app.bsky.actor.profile',
          limit: 1,
        }).catch((err) => {
          logger.error('Failed to fetch profile records', err, { component: 'RepoService', action: 'getProfileRecordsForDid' });
          return { data: { records: [], cursor: undefined } } as { data: ListRecordsOutput };
        }),
        agent.api.com.atproto.repo.listRecords({
          repo: did,
          collection: 'com.getorbyt.profile',
          limit: 1,
        }).catch((err) => {
          logger.error('Failed to fetch orbyt records', err, { component: 'RepoService', action: 'getProfileRecordsForDid' });
          return { data: { records: [], cursor: undefined } } as { data: ListRecordsOutput };
        })
      ]);

      const profileRecord = (profileRecords?.data?.records?.[0]?.value as ProfileRecord | undefined) || null;
      const orbytRecord = (orbytRecords?.data?.records?.[0]?.value as OrbytProfileRecord | undefined) || null;

      return {
        profileRecord,
        orbytRecord,
      };
    } catch {
      return { profileRecord: null, orbytRecord: null };
    }
  }

  /**
   * Create or update the orbyt profile record with a stable rkey 'self'
   * @param update - Update object with profile fields
   * @returns True if successful
   */
  static async upsertOrbytProfileRecord(update: {
    joinDate?: string;
    colors?: { backgroundColor: string; textColor: string } | null;
    subscribedChannels?: string[];
    algorithmicFeedProvider?: string | null;
  }): Promise<boolean> {
    try {
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) return false;
      const apiClient = await AtprotoCore.getApiClient();
      if (!apiClient) {
        return false;
      }
      const { api } = apiClient;

      // Read existing
      let existing: OrbytProfileRecord | null = null;
      try {
        const rec = await api.com.atproto.repo.getRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
        });
        const output: GetRecordOutput = rec.data;
        existing = (output.value as OrbytProfileRecord) || null;
      } catch {}

      const nowIso = new Date().toISOString();
      const existingRecord = existing;
      const nextRecord: Record<string, unknown> = {
        $type: 'com.getorbyt.profile',
        joinDate: existingRecord?.joinDate || update.joinDate || nowIso,
        updatedAt: nowIso,
        // Preserve prior fields unless overridden
        colors: update.colors === undefined ? existingRecord?.colors || null : update.colors,
        subscribedChannels: update.subscribedChannels ?? existingRecord?.subscribedChannels ?? [],
        algorithmicFeedProvider: update.algorithmicFeedProvider === undefined ? existingRecord?.algorithmicFeedProvider ?? null : update.algorithmicFeedProvider,
      };

      if (existing) {
        // putRecord
        await api.com.atproto.repo.putRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
          record: nextRecord,
        });
      } else {
        // createRecord
        await api.com.atproto.repo.createRecord({
          repo: userDid,
          collection: 'com.getorbyt.profile',
          rkey: 'self',
          record: nextRecord,
        });
      }
      return true;
    } catch (error) {
      logger.error('Error upserting com.getorbyt.profile', error, { component: 'RepoService' });
      return false;
    }
  }

  /**
   * Initialize "com.getorbyt.profile" on first login if missing
   */
  static async initOrbytProfileIfNeeded(): Promise<void> {
    try {
      const existing = await this.getOrbytProfileRecord();
      if (existing) return;

      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) return;

      // No legacy migration; initialize without colors by default
      let colors: { backgroundColor: string; textColor: string } | null = null;

      // Pull current subscribed channels from userStore (filter built-ins)
      let subscribedChannels: string[] = [];
      try {
        const { useUserStore } = await import('../../../stores/userStore');
        const channels = useUserStore.getState().subscribedChannels || [];
        const allUris = channels.map((c: SubscribedChannel) => c.uri).filter(Boolean);
        // Filter out built-in channels
        const BUILT_IN_CHANNELS = ['following', 'your-mix'];
        subscribedChannels = allUris.filter((uri: string) => !BUILT_IN_CHANNELS.includes(uri));
      } catch {}

      // Pull current algorithmic feed provider from userStore
      let algorithmicFeedProvider: string | null = null;
      try {
        const { useUserStore, ALGORITHMIC_FEED_PROVIDERS } = await import('../../../stores/userStore');
        const provider = useUserStore.getState().algorithmicFeedProvider;
        // Use current value or default to Bluesky Video
        algorithmicFeedProvider = provider ?? ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri;
      } catch {}

      await this.upsertOrbytProfileRecord({
        joinDate: new Date().toISOString(),
        colors,
        subscribedChannels,
        algorithmicFeedProvider,
      });
    } catch {
      // best-effort only
    }
  }

  /**
   * Update only colors in orbyt profile record
   * @param backgroundColor - Background color
   * @param textColor - Text color
   */
  static async updateOrbytProfileColors(backgroundColor: string, textColor: string): Promise<void> {
    await this.upsertOrbytProfileRecord({
      colors: { backgroundColor, textColor },
    });
  }

  /**
   * Update subscribed channels in orbyt profile record
   * @param channelUris - Array of channel URIs
   */
  static async updateOrbytProfileChannels(channelUris: string[]): Promise<void> {
    // Filter out built-in channels before saving
    const BUILT_IN_CHANNELS = ['following', 'your-mix'];
    const filteredUris = (channelUris || []).filter(uri => !BUILT_IN_CHANNELS.includes(uri));
    await this.upsertOrbytProfileRecord({
      subscribedChannels: Array.from(new Set(filteredUris)),
    });
  }

  /**
   * Update algorithmic feed provider in orbyt profile record
   * @param uri - Feed provider URI or null
   */
  static async updateOrbytProfileAlgorithmicFeedProvider(uri: string | null): Promise<void> {
    await this.upsertOrbytProfileRecord({
      algorithmicFeedProvider: uri,
    });
  }
}
