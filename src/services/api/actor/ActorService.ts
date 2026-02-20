/**
 * Actor Service - app.bsky.actor.* namespace operations
 * Handles all actor/profile-related API operations including profile retrieval, search, and updates
 */

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
// @ts-expect-error - multiformats/cid has type resolution issues with package.json exports
import { CID } from 'multiformats/cid';
import { batchFetchColors, orbytColorKeys } from '../../colors';
import { queryClient } from '../../../utils/query/queryClient';
import { RepoService } from '../repo/RepoService';

/**
 * Converts JSON blob objects (from getRecord) to BlobRef instances.
 * When manually fetching records via getRecord, blobs come as JSON objects
 * like { $type: "blob", ref: { $link: "..." }, mimeType: "...", size: ... }.
 * The validator requires BlobRef instances, so we need to convert them.
 */
function convertJsonBlobToBlobRef(blob: unknown): BlobRef | null {
  if (!blob) return null;
  if (blob instanceof BlobRef) return blob;

  const blobObj = blob as {
    $type?: string;
    ref?: { $link?: string } | CID;
    mimeType?: string;
    size?: number;
  };

  // Try asBlobRef first (handles various formats)
  const converted = BlobRef.asBlobRef(blobObj);
  if (converted) return converted;

  // Manual conversion for { ref: { $link: string } } format from getRecord
  if (
    blobObj.ref &&
    typeof blobObj.ref === 'object' &&
    '$link' in blobObj.ref &&
    typeof blobObj.ref.$link === 'string'
  ) {
    const cid = CID.parse(blobObj.ref.$link);
    return new BlobRef(cid, blobObj.mimeType || 'application/octet-stream', blobObj.size ?? -1);
  }

  // Handle direct CID format
  if (blobObj.ref instanceof CID && blobObj.mimeType) {
    return new BlobRef(blobObj.ref, blobObj.mimeType, blobObj.size ?? -1);
  }

  return null;
}

/**
 * Converts blob fields (avatar, banner) in a profile record from JSON to BlobRef instances.
 * This is necessary when manually fetching profiles via getRecord, as the API returns
 * blobs as JSON objects but the validator requires BlobRef instances.
 */
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
  /**
   * Get the current authenticated user's profile
   * @returns Current user's detailed profile
   */
  static async getCurrentUser(): Promise<ProfileViewDetailed> {
    // First try to get the current user DID
    const userDid = await AtprotoCore.getCurrentUserDid();
    if (!userDid) {
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
   * Get profile by DID (includes orbyt colors in one request for avatar rings)
   * @param did - User DID
   * @returns Profile data with orbytColors attached
   */
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
      const colors = record?.colors;
      const orbytColors =
        colors?.backgroundColor && colors?.textColor
          ? {
              backgroundColor: colors.backgroundColor,
              textColor: colors.textColor,
              joinedAt: record?.joinDate ?? record?.updatedAt ?? new Date().toISOString(),
              isBeta: false,
            }
          : null;
      if (orbytColors) {
        queryClient.setQueryData(orbytColorKeys.color(did), orbytColors);
      }
      return {
        ...profile,
        orbytRecord: null,
        orbytColors,
      };
    } catch (_error: unknown) {
      return null;
    }
  }

  /**
   * Get profile by handle (includes orbyt colors in one request for avatar rings)
   * @param handle - User handle
   * @returns Profile data with orbytColors attached
   */
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
      const colors = record?.colors;
      const orbytColors =
        colors?.backgroundColor && colors?.textColor
          ? {
              backgroundColor: colors.backgroundColor,
              textColor: colors.textColor,
              joinedAt: record?.joinDate ?? record?.updatedAt ?? new Date().toISOString(),
              isBeta: false,
            }
          : null;
      if (profile.did && orbytColors) {
        queryClient.setQueryData(orbytColorKeys.color(profile.did), orbytColors);
      }
      return {
        ...profile,
        orbytRecord: null,
        orbytColors,
      };
    } catch (_error: unknown) {
      return null;
    }
  }

  /**
   * Batch fetch multiple actor profiles efficiently
   * Uses Bluesky's native batch endpoint to fetch up to 25 profiles per request
   * Automatically deduplicates and chunks requests into batches of 25
   * Note: Colors come from orbyt API (profile.orbytColors when fetched, or useOrbytColors)
   *
   * @param handles - Array of actor handles to fetch
   * @returns Array of actor profiles
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

      // Single handle optimization
      if (uniqueHandles.length === 1) {
        try {
          const profile = await this.getProfile(uniqueHandles[0]);
          return profile ? [profile] : [];
        } catch {
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
          .catch(() => {
            return [] as ProfileView[];
          })
      );

      const profileResults = await Promise.all(batchPromises);
      const profiles = profileResults.flat();

      const dids = [...new Set(profiles.map(p => p.did).filter(Boolean))] as string[];
      const colorMap = dids.length > 0 ? await batchFetchColors(dids) : {};
      for (const [d, data] of Object.entries(colorMap)) {
        if (data) queryClient.setQueryData(orbytColorKeys.color(d), data);
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

    // Manually fetch the existing profile record to ensure we have all fields for merging
    // The API's upsertProfile may pass undefined if validation fails, so we fetch it ourselves
    let manuallyFetchedProfile: AppBskyActorProfile.Record | undefined;
    try {
      const repo = await AtprotoCore.getCurrentUserDid();
      if (repo) {
        const existingRecordResponse = await api.com.atproto.repo
          .getRecord({
            repo,
            collection: 'app.bsky.actor.profile',
            rkey: 'self',
          })
          .catch(() => undefined);

        if (existingRecordResponse?.data?.value) {
          manuallyFetchedProfile = existingRecordResponse.data.value as AppBskyActorProfile.Record;
        }
      }
    } catch {
      // Fallback to API callback if manual fetch fails
    }
    await api.upsertProfile((existingProfile: AppBskyActorProfile.Record | undefined) => {
      // Use manually fetched profile if API callback provides undefined, otherwise use API's version
      // This ensures we always have the existing data to merge with
      let profileToUse = existingProfile || manuallyFetchedProfile;

      // Convert blob fields (avatar, banner) to BlobRef instances if they're JSON objects
      // The manually fetched profile has blobs as JSON, but the validator requires BlobRef instances
      if (profileToUse) {
        profileToUse = convertProfileBlobsToBlobRefs(profileToUse);
      }

      // Start with existing profile or empty object, ensuring we preserve all fields
      const existing: AppBskyActorProfile.Record = profileToUse
        ? { ...profileToUse } // Spread to preserve all fields
        : { $type: 'app.bsky.actor.profile' }; // New profile needs $type

      // Build the updated record by spreading existing and only updating provided fields
      const updated: AppBskyActorProfile.Record = {
        ...existing, // Preserve ALL existing fields
        ...(updates.displayName !== undefined && { displayName: updates.displayName }),
        ...(updates.description !== undefined && { description: updates.description }),
      };

      return updated;
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
        const { api: apiForUpload } = await AtprotoCore.getApiClient();
        const uploadResult = await apiForUpload.uploadBlob(imageBlob, {
          encoding: 'image/jpeg',
        });

        // Capture the blob value BEFORE the callback to avoid closure issues
        const uploadedBlob = uploadResult.data.blob;
        if (!uploadedBlob) {
          throw new Error('Upload result does not contain a blob reference');
        }

        // Manually fetch the existing profile record to ensure we have all fields for merging
        // The API's upsertProfile may pass undefined if validation fails, so we fetch it ourselves
        let manuallyFetchedProfileForAvatar: AppBskyActorProfile.Record | undefined;
        try {
          const repo = await AtprotoCore.getCurrentUserDid();
          if (repo) {
            const existingRecordResponse = await apiForUpload.com.atproto.repo
              .getRecord({
                repo,
                collection: 'app.bsky.actor.profile',
                rkey: 'self',
              })
              .catch(() => undefined);

            if (existingRecordResponse?.data?.value) {
              manuallyFetchedProfileForAvatar = existingRecordResponse.data
                .value as AppBskyActorProfile.Record;
            }
          }
        } catch {
          // Fallback to API callback if manual fetch fails
        }
        // Update profile with the new avatar
        // Note: The avatar field expects a BlobRef instance
        await apiForUpload.upsertProfile(
          (existingProfile: AppBskyActorProfile.Record | undefined) => {
            // Use manually fetched profile if API callback provides undefined, otherwise use API's version
            let profileToUse = existingProfile || manuallyFetchedProfileForAvatar;

            // Convert blob fields (avatar, banner) to BlobRef instances if they're JSON objects
            // The manually fetched profile has blobs as JSON, but the validator requires BlobRef instances
            if (profileToUse) {
              profileToUse = convertProfileBlobsToBlobRefs(profileToUse);
            }

            // Preserve all existing fields
            const existing: AppBskyActorProfile.Record = profileToUse
              ? { ...profileToUse }
              : { $type: 'app.bsky.actor.profile' };
            // Ensure we have a proper BlobRef instance (validator requires instanceof BlobRef)
            let blobRef: BlobRef;

            // Check if it's already a BlobRef instance
            if (uploadedBlob instanceof BlobRef) {
              blobRef = uploadedBlob;
            } else if (uploadedBlob && typeof uploadedBlob === 'object') {
              // Try asBlobRef first (handles both typed and untyped formats)
              const converted = BlobRef.asBlobRef(uploadedBlob);
              if (converted) {
                blobRef = converted;
              } else {
                // If asBlobRef fails, manually construct BlobRef from API response format
                // The API returns { ref: { $link: string }, mimeType: string, size: number }
                // We need to parse the CID from ref.$link and construct a BlobRef instance
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
                  // Parse CID from the $link string
                  const cid = CID.parse(blobObj.ref.$link);
                  const mimeType = blobObj.mimeType || 'application/octet-stream';
                  const size = blobObj.size ?? -1;

                  // Construct BlobRef instance
                  blobRef = new BlobRef(cid, mimeType, size);
                } else if (blobObj.ref instanceof CID && blobObj.mimeType) {
                  // Already has a CID, construct directly
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

            // Create updated record preserving all fields
            const updated: AppBskyActorProfile.Record = {
              ...existing, // Preserve ALL existing fields
              avatar: blobRef, // Update only avatar
            };

            return updated;
          }
        );
      } catch {
        throw new Error('Failed to upload avatar image');
      }
    }

    // Return the updated profile
    return await this.getCurrentUser();
  }

  /**
   * Upload an image and return the blob reference
   * @param imageUri - URI of the image to upload (file:// or data:)
   * @returns BlobRef instance for the uploaded image
   */
  static async uploadImage(imageUri: string): Promise<BlobRef> {
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
}
