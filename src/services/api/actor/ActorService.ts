import { Agent } from '@atproto/api';
import { AtprotoCore } from '../core';
import type {
  ProfileView,
  ProfileViewBasic,
  ProfileViewDetailed,
  ProfileSearchResponse,
  ProfileViewWithOrbyt,
} from '../types';
import { BlobRef } from '@atproto/lexicon';
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

export class ActorService {
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
      const profileResponse = await api.app.bsky.actor.getProfile({ actor: did });

      const profile = profileResponse.data as ProfileView;
      return {
        ...profile,
        orbytRecord: null,
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
      return {
        ...profile,
        orbytRecord: null,
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

      return profiles.map(profile => ({
        ...profile,
        orbytRecord: null,
      }));
    } catch {
      return [];
    }
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
