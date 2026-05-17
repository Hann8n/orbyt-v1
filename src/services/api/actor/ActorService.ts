import { Agent } from '@atproto/api';
import { AtprotoCore } from '../core';
import type {
  ProfileView,
  ProfileViewBasic,
  ProfileViewDetailed,
  ProfileSearchResponse,
  ProfileViewWithOrbyt,
} from '../types';
import type { AppBskyActorProfile } from '@atproto/api';
import { BlobRef } from '@atproto/lexicon';
import { CID } from 'multiformats';
import {
  batchFetchColors,
  getOrbytColorQueryOptions,
  getOrbytColorKey,
  syncOrbytColorsQuery,
} from '../../colors/OrbytColors';
import { queryClient } from '../../../utils/query/queryClient';
import { RepoService } from '../repo/RepoService';
import { logger } from '../../../utils/logger';

/** Unauthenticated App View for sign-in / pre-OAuth discovery (`app.bsky.actor.searchActors`). */
let publicAppviewAgent: Agent | null = null;

function getPublicAppviewAgent(): Agent {
  if (!publicAppviewAgent) {
    publicAppviewAgent = new Agent({ service: 'https://public.api.bsky.app' });
  }
  return publicAppviewAgent;
}

function createOfflineBlobRef(link: string, mimeType: string): BlobRef {
  const blob = BlobRef.asBlobRef({
    $type: 'blob',
    ref: { $link: link },
    mimeType,
    size: 0,
  });
  if (!blob) {
    throw new Error('Failed to create offline mock blob ref');
  }
  return blob;
}

function convertJsonBlobToBlobRef(blob: unknown): BlobRef | null {
  if (!blob) return null;
  if (blob instanceof BlobRef) return blob;

  const blobObj = blob as {
    $type?: string;
    ref?: { $link?: string } | CID;
    mimeType?: string;
    size?: number;
  };

  const converted = BlobRef.asBlobRef(blobObj);
  if (converted) return converted;

  if (
    blobObj.ref &&
    typeof blobObj.ref === 'object' &&
    '$link' in blobObj.ref &&
    typeof blobObj.ref.$link === 'string'
  ) {
    const cid = CID.parse(blobObj.ref.$link);
    return new BlobRef(cid, blobObj.mimeType || 'application/octet-stream', blobObj.size ?? -1);
  }

  if (blobObj.ref instanceof CID && blobObj.mimeType) {
    return new BlobRef(blobObj.ref, blobObj.mimeType, blobObj.size ?? -1);
  }

  return null;
}

function convertProfileBlobsToBlobRefs(
  profile: AppBskyActorProfile.Record
): AppBskyActorProfile.Record {
  const converted: AppBskyActorProfile.Record = { ...profile };

  if (converted.avatar) {
    const blobRef = convertJsonBlobToBlobRef(converted.avatar);
    if (blobRef) {
      converted.avatar = blobRef;
    }
  }

  if (converted.banner) {
    const blobRef = convertJsonBlobToBlobRef(converted.banner);
    if (blobRef) {
      converted.banner = blobRef;
    }
  }

  return converted;
}

export class ActorService {
  private static async resolveOrbytColors(
    did: string,
    record: {
      colors?: { backgroundColor: string; textColor: string } | null;
      joinDate?: string;
      updatedAt?: string;
    } | null
  ) {
    let apiColors = null;
    try {
      apiColors = await queryClient.fetchQuery(getOrbytColorQueryOptions(did));
    } catch {
      apiColors = null;
    }
    if (apiColors) {
      syncOrbytColorsQuery(did, apiColors);
      return apiColors;
    }

    const colors = record?.colors;
    if (!colors?.backgroundColor || !colors?.textColor) {
      return null;
    }

    const cached = queryClient.getQueryData<{
      isBeta?: boolean;
    } | null>(getOrbytColorKey(did));

    return {
      backgroundColor: colors.backgroundColor,
      textColor: colors.textColor,
      joinedAt: record?.joinDate ?? record?.updatedAt ?? new Date().toISOString(),
      isBeta: cached?.isBeta ?? false,
    };
  }

  static async getCurrentUser(): Promise<ProfileViewDetailed> {
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) {
      throw new Error('No session available');
    }

    const apiClient = await AtprotoCore.getApiClient();
    if (!apiClient || !apiClient.api) {
      throw new Error('No API client available');
    }

    const { api } = apiClient;
    const response = await api.app.bsky.actor.getProfile({ actor: userDid });
    return response.data as ProfileViewDetailed;
  }

  static async searchActorsPublic(
    term: string,
    options?: { limit?: number; cursor?: string | null }
  ): Promise<ProfileSearchResponse> {
    const q = term.trim().replace(/^@+/, '');
    if (q.length < 1) {
      return { profiles: [], cursor: null };
    }
    try {
      const agent = getPublicAppviewAgent();
      const limit = Math.min(100, Math.max(1, options?.limit ?? 8));
      const params: { term: string; limit: number; cursor?: string } = { term: q, limit };
      if (options?.cursor) params.cursor = options.cursor;
      const response = await agent.app.bsky.actor.searchActors(params);
      return {
        profiles: (response.data.actors ?? []) as ProfileViewBasic[],
        cursor: response.data.cursor ?? null,
      };
    } catch (error) {
      logger.warn('Public actor search failed', { error, term: q });
      return { profiles: [], cursor: null };
    }
  }

  static async searchProfilesPaginated(
    query: string,
    cursor: string | null = null,
    limit: number = 20
  ): Promise<ProfileSearchResponse> {
    await AtprotoCore.ensureSession();
    try {
      const params: { term: string; limit: number; cursor?: string } = { term: query, limit };
      if (cursor) params.cursor = cursor;

      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.actor.searchActors(params);
      const profiles: ProfileViewBasic[] = (response.data.actors || []) as ProfileViewBasic[];
      return {
        profiles,
        cursor: response.data.cursor ?? null,
      };
    } catch (_error) {
      return { profiles: [], cursor: null };
    }
  }

  static async getProfileByDid(did: string): Promise<ProfileViewWithOrbyt | null> {
    const { api } = await AtprotoCore.getApiClient();
    try {
      const [profileResponse, rawOrbytRecord] = await Promise.all([
        api.app.bsky.actor.getProfile({ actor: did }),
        RepoService.getOrbytProfileRecordForDid(did),
      ]);

      const profile = profileResponse.data as ProfileView;
      const record = rawOrbytRecord as {
        colors?: { backgroundColor: string; textColor: string } | null;
        joinDate?: string;
        updatedAt?: string;
      } | null;
      const orbytColors = await this.resolveOrbytColors(did, record);
      return {
        ...profile,
        orbytRecord: null,
        orbytColors,
      };
    } catch (_error: unknown) {
      return null;
    }
  }

  static async getProfile(handle: string): Promise<ProfileViewWithOrbyt | null> {
    const { api } = await AtprotoCore.getApiClient();
    try {
      const response = await api.app.bsky.actor.getProfile({
        actor: handle,
      });

      const profile = response.data as ProfileView;
      const rawOrbytRecord = profile.did
        ? await RepoService.getOrbytProfileRecordForDid(profile.did)
        : null;
      const record = rawOrbytRecord as {
        colors?: { backgroundColor: string; textColor: string } | null;
        joinDate?: string;
        updatedAt?: string;
      } | null;
      const orbytColors = profile.did ? await this.resolveOrbytColors(profile.did, record) : null;
      return {
        ...profile,
        orbytRecord: null,
        orbytColors,
      };
    } catch (_error: unknown) {
      return null;
    }
  }

  static async getProfilesInBatch(handles: string[]): Promise<ProfileViewWithOrbyt[]> {
    if (!handles || handles.length === 0) {
      return [];
    }

    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();

      const uniqueHandles = Array.from(
        new Set(handles.map(h => h?.toLowerCase()).filter(h => !!h && typeof h === 'string'))
      );

      if (uniqueHandles.length === 0) {
        return [];
      }

      if (uniqueHandles.length === 1) {
        try {
          const profile = await this.getProfile(uniqueHandles[0]);
          return profile ? [profile] : [];
        } catch {
          return [];
        }
      }

      const BATCH_SIZE = 25;
      const batches: string[][] = [];

      for (let i = 0; i < uniqueHandles.length; i += BATCH_SIZE) {
        batches.push(uniqueHandles.slice(i, i + BATCH_SIZE));
      }

      const batchPromises = batches.map(batch =>
        api.app.bsky.actor
          .getProfiles({ actors: batch })
          .then(response => (response?.data?.profiles || []) as ProfileView[])
          .catch(() => [] as ProfileView[])
      );

      const profileResults = await Promise.all(batchPromises);
      const profiles = profileResults.flat();

      const dids = [...new Set(profiles.map(p => p.did).filter(Boolean))] as string[];
      const colorMap = dids.length > 0 ? await batchFetchColors(dids) : {};
      for (const [d, data] of Object.entries(colorMap)) {
        if (data) queryClient.setQueryData(getOrbytColorKey(d), data);
      }

      return profiles.map(profile => ({
        ...profile,
        orbytRecord: null,
        orbytColors: (profile.did ? (colorMap[profile.did] ?? null) : null) ?? null,
      }));
    } catch {
      return [];
    }
  }

  static async updateProfile(updates: {
    displayName?: string;
    description?: string;
    avatar?: string; // Base64 encoded image or file URI
    customColors?: {
      backgroundColor: string;
      textColor: string;
    };
  }): Promise<ProfileViewDetailed> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        throw new Error('Offline write mock failure: updateProfile');
      }
      return this.getCurrentUser();
    }

    await AtprotoCore.ensureSession();
    const { api } = await AtprotoCore.getApiClient();

    // upsertProfile may pass undefined when validation fails; pre-fetch as fallback
    let manuallyFetchedProfile: AppBskyActorProfile.Record | undefined;
    const repo = AtprotoCore.getCurrentUserDid();
    if (repo) {
      const existingRecordResponse = await api.com.atproto.repo
        .getRecord({ repo, collection: 'app.bsky.actor.profile', rkey: 'self' })
        .catch(() => undefined);
      if (existingRecordResponse?.data?.value) {
        manuallyFetchedProfile = existingRecordResponse.data.value as AppBskyActorProfile.Record;
      }
    }

    await api.upsertProfile((existingProfile: AppBskyActorProfile.Record | undefined) => {
      let profileToUse = existingProfile || manuallyFetchedProfile;
      // Manually fetched records return blobs as JSON; validator requires BlobRef instances
      if (profileToUse) profileToUse = convertProfileBlobsToBlobRefs(profileToUse);
      const existing: AppBskyActorProfile.Record = profileToUse
        ? { ...profileToUse }
        : { $type: 'app.bsky.actor.profile' };
      return {
        ...existing,
        ...(updates.displayName !== undefined && { displayName: updates.displayName }),
        ...(updates.description !== undefined && { description: updates.description }),
      };
    });

    if (updates.avatar) {
      try {
        if (updates.avatar.startsWith('https://') && updates.avatar.includes('cdn.bsky.app')) {
          return await this.getCurrentUser();
        }

        let imageBlob: Blob;
        if (updates.avatar.startsWith('data:') || updates.avatar.startsWith('file://')) {
          const response = await fetch(updates.avatar);
          imageBlob = await response.blob();
        } else {
          throw new Error('Unsupported avatar format');
        }

        const { api: apiForUpload } = await AtprotoCore.getApiClient();
        const uploadResult = await apiForUpload.uploadBlob(imageBlob, { encoding: 'image/jpeg' });
        // Capture before callback — closure would capture stale value otherwise
        const uploadedBlob = uploadResult.data.blob;
        if (!uploadedBlob) throw new Error('Upload result does not contain a blob reference');

        let manuallyFetchedProfileForAvatar: AppBskyActorProfile.Record | undefined;
        const repo = AtprotoCore.getCurrentUserDid();
        if (repo) {
          const existingRecordResponse = await apiForUpload.com.atproto.repo
            .getRecord({ repo, collection: 'app.bsky.actor.profile', rkey: 'self' })
            .catch(() => undefined);
          if (existingRecordResponse?.data?.value) {
            manuallyFetchedProfileForAvatar = existingRecordResponse.data
              .value as AppBskyActorProfile.Record;
          }
        }

        await apiForUpload.upsertProfile(
          (existingProfile: AppBskyActorProfile.Record | undefined) => {
            let profileToUse = existingProfile || manuallyFetchedProfileForAvatar;
            if (profileToUse) profileToUse = convertProfileBlobsToBlobRefs(profileToUse);
            const existing: AppBskyActorProfile.Record = profileToUse
              ? { ...profileToUse }
              : { $type: 'app.bsky.actor.profile' };

            let blobRef: BlobRef;
            if (uploadedBlob instanceof BlobRef) {
              blobRef = uploadedBlob;
            } else if (uploadedBlob && typeof uploadedBlob === 'object') {
              const converted = BlobRef.asBlobRef(uploadedBlob);
              if (converted) {
                blobRef = converted;
              } else {
                // uploadBlob may return { ref: { $link }, mimeType, size } rather than BlobRef
                const blobObj = uploadedBlob as {
                  ref?: { $link?: string } | CID;
                  mimeType?: string;
                  size?: number;
                };
                if (
                  blobObj.ref &&
                  typeof blobObj.ref === 'object' &&
                  '$link' in blobObj.ref &&
                  typeof blobObj.ref.$link === 'string'
                ) {
                  blobRef = new BlobRef(
                    CID.parse(blobObj.ref.$link),
                    blobObj.mimeType || 'application/octet-stream',
                    blobObj.size ?? -1
                  );
                } else if (blobObj.ref instanceof CID && blobObj.mimeType) {
                  blobRef = new BlobRef(blobObj.ref, blobObj.mimeType, blobObj.size ?? -1);
                } else {
                  throw new Error(
                    'Failed to convert uploaded blob to BlobRef instance. ' +
                      'Invalid blob structure: expected ref.$link (string) or ref (CID), mimeType, and size.'
                  );
                }
              }
            } else {
              throw new Error(
                'Invalid blob reference from upload: expected BlobRef instance or valid blob object'
              );
            }

            return { ...existing, avatar: blobRef };
          }
        );
      } catch {
        throw new Error('Failed to upload avatar image');
      }
    }

    return await this.getCurrentUser();
  }

  static async uploadImage(imageUri: string): Promise<BlobRef> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        throw new Error('Offline write mock failure: uploadImage');
      }
      return createOfflineBlobRef(`bafk-offline-image-${Date.now()}`, 'image/jpeg');
    }

    await AtprotoCore.ensureSession();

    let imageBlob: Blob;
    if (imageUri.startsWith('data:') || imageUri.startsWith('file://')) {
      const response = await fetch(imageUri);
      imageBlob = await response.blob();
    } else {
      throw new Error('Unsupported image format');
    }

    const { api } = await AtprotoCore.getApiClient();
    const uploadResult = await api.uploadBlob(imageBlob, { encoding: 'image/jpeg' });
    return uploadResult.data.blob;
  }

  static async getSuggestedAccounts(limit: number = 20): Promise<ProfileViewBasic[]> {
    const { api } = await AtprotoCore.getApiClient();
    try {
      const response = await api.app.bsky.actor.getSuggestions({ limit });
      return (response.data.actors || []) as ProfileViewBasic[];
    } catch {
      return [];
    }
  }
}
