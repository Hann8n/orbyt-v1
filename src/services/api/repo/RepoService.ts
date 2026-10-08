/**
 * Repo Service — `com.atproto.repo.*` namespace operations (record CRUD, blob upload).
 *
 * **Two XRPC client patterns:**
 * - **`AtprotoCore.getApiClient()`** — Session-scoped `api`: the logged-in user’s App View / PDS.
 *   Use for the current account’s records (e.g. `uploadVideo`). Orbyt profile writes live in
 *   `src/services/orbyt/profileRecords.ts`.
 * - **`getAgentForRepo(did)`** then **`agent.api.com.atproto.repo.*`** — Repo-scoped agent aimed at **that
 *   actor’s PDS**. Required to read arbitrary DIDs’ records (`getOrbytProfileRecordForDid`)
 *   because `com.getorbyt.profile` / `app.bsky.actor.profile` live on the subject’s repo, not necessarily on the viewer’s PDS.
 */

import { BlobRef } from '@atproto/lexicon';
import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import { getAgentForRepo } from '../pdsEndpointResolver';

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

export class RepoService {
  /**
   * Upload a video file to Bluesky
   * @param videoPath - Path to the video file
   * @returns Blob reference for the uploaded video
   */
  static async uploadVideo(videoPath: string): Promise<BlobRef> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        throw new Error('Offline write mock failure: uploadVideo');
      }
      return createOfflineBlobRef(`bafk-offline-video-${Date.now()}`, 'video/mp4');
    }

    await AtprotoCore.ensureSession();

    if (!videoPath.startsWith('file://')) {
      throw new Error('Unsupported video format');
    }

    const response = await fetch(videoPath);
    const videoBlob = await response.blob();

    const { api } = await AtprotoCore.getApiClient();
    const uploadResult = await api.uploadBlob(videoBlob, {
      encoding: 'video/mp4',
    });

    return uploadResult.data.blob;
  }

  /**
   * Fetch `com.getorbyt.profile` for **any** DID via `getAgentForRepo` (subject’s PDS, not session-only).
   * @param did - DID to fetch record for
   * @returns orbyt profile record or null
   */
  static async getOrbytProfileRecordForDid(did: string): Promise<unknown | null> {
    try {
      if (!did) return null;
      const agent = await getAgentForRepo(did);
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
   * Delete the Germ declaration record from the current user's profile.
   * This disconnects Germ DM from the profile (removes the Germ DM button).
   * @returns True if successfully deleted or record did not exist
   */
  static async deleteGermDeclaration(): Promise<boolean> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        return false;
      }
      return true;
    }

    try {
      const userDid = AtprotoCore.getCurrentUserDid();
      if (!userDid) return false;

      const { api } = await AtprotoCore.getApiClient();

      // com.germnetwork.declaration uses rkey "self" (literal:self in lexicon)
      await api.com.atproto.repo.deleteRecord({
        repo: userDid,
        collection: 'com.germnetwork.declaration',
        rkey: 'self',
      });

      return true;
    } catch (error) {
      // Record may not exist (e.g. never connected Germ) - treat as success
      const err = error as { status?: number; error?: string };
      if (err?.status === 404 || err?.error === 'RecordNotFound') {
        return true;
      }
      logger.error('Error deleting com.germnetwork.declaration', error, {
        component: 'RepoService',
        action: 'deleteGermDeclaration',
      });
      return false;
    }
  }
}
