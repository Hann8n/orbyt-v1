/**
 * Actor Service - app.bsky.actor.* namespace operations
 * Handles all actor/profile-related API operations including profile retrieval, search, and updates
 */

import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import type {
  ProfileView,
  ProfileViewBasic,
  ProfileViewDetailed,
  ProfileSearchResponse,
  ActorPreferences,
  GetPreferencesOutput,
  ProfileViewWithOrbyt,
  OrbytProfileRecord,
} from '../types';
import type { AppBskyActorProfile } from '@atproto/api';

export class ActorService {
  /**
   * Get the current authenticated user's profile
   * @returns Current user's detailed profile
   */
  static async getCurrentUser(): Promise<ProfileViewDetailed> {
    try {
      // First try to get the current user DID
      const userDid = await AtprotoCore.getCurrentUserDid();
      if (!userDid) {
        logger.debug('No user DID available', { component: 'ActorService' });
        throw new Error('No session available');
      }

      // Then get the API client
      const apiClient = await AtprotoCore.getApiClient();
      if (!apiClient || !apiClient.api) {
        throw new Error('No API client available');
      }

      const { api } = apiClient;

      // Getting profile for DID using session
      const response = await api.app.bsky.actor.getProfile({ actor: userDid });

      // Cache the profile data
      if (response?.data) {
        // Successfully retrieved user profile
      }

      return response.data as ProfileViewDetailed;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting current user', error, { component: 'ActorService' });

      // Session error handling - cache is managed by userStore now
      if (errorMsg.includes('session') || errorMsg.includes('auth') || errorMsg.includes('token')) {
        logger.debug('Session error detected', { component: 'ActorService' });
      }

      throw error;
    }
  }

  /**
   * Search profiles by query
   * @param query - Search query
   * @returns Array of profile results
   */
  static async searchProfiles(query: string): Promise<ProfileViewBasic[]> {
    await AtprotoCore.ensureSession();
    try {
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.actor.searchActors({
        term: query,
        limit: 20,
      });
      return (response.data.actors || []) as ProfileViewBasic[];
    } catch {
      return [];
    }
  }

  /**
   * Search profiles by query with pagination support
   * @param query - Search query
   * @param cursor - Pagination cursor
   * @param limit - Number of results per page
   * @returns Array of profile results and next cursor
   */
  static async searchProfilesPaginated(
    query: string,
    cursor: string | null = null,
    limit: number = 20
  ): Promise<ProfileSearchResponse> {
    await AtprotoCore.ensureSession();
    try {
      const params: { term: string; limit: number; cursor?: string } = { term: query, limit };
      if (cursor) params.cursor = cursor;

      // Use the correct API endpoint with proper namespace
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.actor.searchActors(params);

      // Extract the cursor for pagination
      const nextCursor = response.data.cursor ?? null;

      // Map ProfileView to ProfileViewBasic (they're compatible, just need to assert)
      const profiles: ProfileViewBasic[] = (response.data.actors || []) as ProfileViewBasic[];

      // Return profiles with cursor
      return {
        profiles,
        cursor: nextCursor,
      };
    } catch (_error) {
      return { profiles: [], cursor: null };
    }
  }

  /**
   * Get profile by DID with orbyt record - always fetches com.getorbyt.profile in parallel
   * @param did - User DID
   * @returns Profile data with orbyt record attached
   */
  static async getProfileByDid(did: string): Promise<ProfileViewWithOrbyt | null> {
    // React Query handles caching - no custom cache needed
    const { api } = await AtprotoCore.getApiClient();
    try {
      // Fetch profile and orbyt record in parallel
      const { RepoService } = await import('../repo/RepoService');

      const [profileResponse, orbytRecordResult] = await Promise.all([
        api.app.bsky.actor.getProfile({
          actor: did,
        }),
        RepoService.getOrbytProfileRecordForDid(did).catch(() => null),
      ]);

      const profile = profileResponse.data as ProfileView;
      const orbytRecord = (orbytRecordResult as OrbytProfileRecord | null) || null;

      // Return ProfileView with orbyt record attached
      return {
        ...profile,
        orbytRecord,
      };
    } catch (_error: unknown) {
      return null;
    }
  }

  /**
   * Get profile by handle with orbyt record - always fetches com.getorbyt.profile in parallel
   * @param handle - User handle
   * @returns Profile data with orbyt record attached
   */
  static async getProfile(handle: string): Promise<ProfileViewWithOrbyt | null> {
    // React Query handles caching - no custom cache needed
    const { api } = await AtprotoCore.getApiClient();
    try {
      const response = await api.app.bsky.actor.getProfile({
        actor: handle,
      });

      const profile = response.data as ProfileView;

      // Fetch orbyt record for the profile's DID
      if (profile.did) {
        const { RepoService } = await import('../repo/RepoService');
        const orbytRecord = (await RepoService.getOrbytProfileRecordForDid(profile.did).catch(
          () => null
        )) as OrbytProfileRecord | null;

        return {
          ...profile,
          orbytRecord: orbytRecord || null,
        };
      }

      return {
        ...profile,
        orbytRecord: null,
      };
    } catch (_error: unknown) {
      return null;
    }
  }

  /**
   * Batch fetch multiple actor profiles efficiently with orbyt records
   * Uses Bluesky's native batch endpoint to fetch up to 25 profiles per request
   * Automatically deduplicates and chunks requests into batches of 25
   * Fetches orbyt records in parallel for all profiles
   *
   * @param handles - Array of actor handles to fetch
   * @returns Array of actor profiles with orbyt records attached
   */
  static async getProfilesInBatch(handles: string[]): Promise<ProfileViewWithOrbyt[]> {
    if (!handles || handles.length === 0) {
      return [];
    }

    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();

      // Deduplicate and normalize handles
      const uniqueHandles = Array.from(
        new Set(handles.map(h => h?.toLowerCase()).filter(h => !!h && typeof h === 'string'))
      );

      if (uniqueHandles.length === 0) {
        return [];
      }

      // Single handle optimization - use getProfile which already fetches orbyt record
      if (uniqueHandles.length === 1) {
        try {
          const profile = await this.getProfile(uniqueHandles[0]);
          return profile ? [profile] : [];
        } catch (error: unknown) {
          logger.warn(`Failed to fetch profile ${uniqueHandles[0]}:`, {
            component: 'ActorService',
            error,
          });
          return [];
        }
      }

      // Batch into chunks of 25 (API limit)
      const BATCH_SIZE = 25;
      const batches: string[][] = [];

      for (let i = 0; i < uniqueHandles.length; i += BATCH_SIZE) {
        batches.push(uniqueHandles.slice(i, i + BATCH_SIZE));
      }

      // Fetch all batches in parallel
      const batchPromises = batches.map(batch =>
        api.app.bsky.actor
          .getProfiles({ actors: batch })
          .then(response => (response?.data?.profiles || []) as ProfileView[])
          .catch((error: unknown) => {
            logger.warn(`Failed to fetch batch of profiles:`, { component: 'ActorService', error });
            return [] as ProfileView[];
          })
      );

      const profileResults = await Promise.all(batchPromises);
      const profiles = profileResults.flat();

      // Fetch orbyt records in parallel for all profiles
      const { RepoService } = await import('../repo/RepoService');
      const orbytRecordPromises = profiles.map(profile =>
        profile?.did
          ? RepoService.getOrbytProfileRecordForDid(profile.did)
              .catch(() => null)
              .then(record => ({ profile, orbytRecord: record as OrbytProfileRecord | null }))
          : Promise.resolve({ profile, orbytRecord: null as OrbytProfileRecord | null })
      );

      const results = await Promise.allSettled(orbytRecordPromises);

      // Combine profiles with orbyt records
      const profilesWithOrbyt: ProfileViewWithOrbyt[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.profile) {
          profilesWithOrbyt.push({
            ...(result.value.profile as ProfileView),
            orbytRecord: result.value.orbytRecord || null,
          } as ProfileViewWithOrbyt);
        }
      }

      return profilesWithOrbyt;
    } catch (error: unknown) {
      logger.error('Error in getProfilesInBatch:', error);
      return [];
    }
  }

  /**
   * Get profile information for a DID (verifier)
   * @param did - DID of the verifier
   * @returns Profile data or null
   */
  static async getVerifierProfile(did: string): Promise<ProfileView | null> {
    try {
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.actor.getProfile({
        actor: did,
      });
      return response.data as ProfileView;
    } catch (_error: unknown) {
      return null;
    }
  }

  /**
   * Update profile information
   * @param updates - Object containing profile updates
   * @returns Updated profile data
   */
  static async updateProfile(updates: {
    displayName?: string;
    description?: string;
    avatar?: string; // Base64 encoded image or file URI
    customColors?: {
      backgroundColor: string;
      textColor: string;
    };
  }): Promise<ProfileViewDetailed> {
    await AtprotoCore.ensureSession();

    // Use the correct upsertProfile method as per Bluesky documentation
    const { api } = await AtprotoCore.getApiClient();
    await api.upsertProfile((existingProfile: AppBskyActorProfile.Record | undefined) => {
      const existing: AppBskyActorProfile.Record = existingProfile || {};

      // Update display name if provided
      if (updates.displayName !== undefined) {
        existing.displayName = updates.displayName;
      }

      // Update description if provided
      if (updates.description !== undefined) {
        existing.description = updates.description;
      }

      return existing;
    });

    // Handle avatar upload separately if provided
    if (updates.avatar) {
      try {
        // Check if this is a CDN URL (existing avatar) - we can't re-upload these
        if (updates.avatar.startsWith('https://') && updates.avatar.includes('cdn.bsky.app')) {
          // Don't proceed with upload for existing avatars - profile already updated
          // Return the updated profile by fetching it
          return await this.getCurrentUser();
        }

        let imageBlob: Blob;

        if (updates.avatar.startsWith('data:')) {
          // Handle base64 data URL
          const response = await fetch(updates.avatar);
          imageBlob = await response.blob();
        } else if (updates.avatar.startsWith('file://')) {
          // Handle file URI
          const response = await fetch(updates.avatar);
          imageBlob = await response.blob();
        } else {
          throw new Error('Unsupported avatar format');
        }

        // Upload the image to Bluesky
        const { api } = await AtprotoCore.getApiClient();
        const uploadResult = await api.uploadBlob(imageBlob, {
          encoding: 'image/jpeg',
        });

        // Update profile with the new avatar
        // Extract the blob data in the correct format for the profile record
        const blobRef = uploadResult.data.blob;
        await api.upsertProfile((existingProfile: AppBskyActorProfile.Record | undefined) => {
          const existing: AppBskyActorProfile.Record = existingProfile || {};
          existing.avatar = blobRef;
          return existing;
        });
      } catch (_error) {
        throw new Error('Failed to upload avatar image');
      }
    }

    // Return the updated profile
    return await this.getCurrentUser();
  }

  /**
   * Upload an image and return the blob reference
   * @param imageUri - URI of the image to upload (file:// or data:)
   * @returns Blob reference for the uploaded image
   */
  static async uploadImage(
    imageUri: string
  ): Promise<{ ref: { $link: string }; mimeType: string; size: number }> {
    await AtprotoCore.ensureSession();

    let imageBlob: Blob;

    if (imageUri.startsWith('data:')) {
      // Handle base64 data URL
      const response = await fetch(imageUri);
      imageBlob = await response.blob();
    } else if (imageUri.startsWith('file://')) {
      // Handle file URI
      const response = await fetch(imageUri);
      imageBlob = await response.blob();
    } else {
      throw new Error('Unsupported image format');
    }

    // Upload the image to Bluesky
    const { api } = await AtprotoCore.getApiClient();
    const uploadResult = await api.uploadBlob(imageBlob, {
      encoding: 'image/jpeg',
    });

    return uploadResult.data.blob;
  }

  /**
   * Fetch suggested accounts to follow using the Bluesky API
   * @param limit - Number of suggestions to fetch (default 20)
   * @returns Array of suggested profile objects
   */
  static async getSuggestedAccounts(limit: number = 20): Promise<ProfileViewBasic[]> {
    const { api } = await AtprotoCore.getApiClient();
    try {
      const response = await api.app.bsky.actor.getSuggestions({ limit });
      return (response.data.actors || []) as ProfileViewBasic[];
    } catch {
      return [];
    }
  }

  /**
   * Get user's moderation preferences from Bluesky
   * @returns Promise with moderation preferences
   */
  static async getModerationPreferences(): Promise<ActorPreferences | null> {
    await AtprotoCore.ensureSession();
    try {
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.actor.getPreferences();
      const output: GetPreferencesOutput = response.data;
      return output.preferences as ActorPreferences;
    } catch (_error: unknown) {
      return null;
    }
  }

  /**
   * Update user's moderation preferences on Bluesky
   * @param preferences - Full preferences object to update
   * @returns Promise indicating success
   */
  static async updateModerationPreferences(preferences: ActorPreferences): Promise<boolean> {
    await AtprotoCore.ensureSession();
    try {
      const { api } = await AtprotoCore.getApiClient();
      await api.app.bsky.actor.putPreferences({
        preferences: Array.isArray(preferences) ? preferences : [preferences],
      });
      return true;
    } catch (_error: unknown) {
      return false;
    }
  }
}
