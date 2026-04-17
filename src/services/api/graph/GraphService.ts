/**
 * Graph Service - app.bsky.graph.* namespace operations
 * Handles all social graph operations including follow, unfollow, block, mute, and relationship queries
 */

import { AtprotoCore } from '../core';
import { deduplicateRequest } from '../inFlightDedup';
import type { ProfileViewBasic, ProfileView, FollowersResponse, FollowingResponse } from '../types';

export class GraphService {
  /**
   * Follow a user
   * @param did - User DID to follow
   * @returns Follow URI
   */
  static async follow(did: string): Promise<string> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        throw new Error('Offline write mock failure: follow');
      }
      return `at://did:plc:offline-debug/app.bsky.graph.follow/mock-follow-${Date.now()}`;
    }

    const cacheKey = `follow:${did}`;
    return deduplicateRequest(cacheKey, async () => {
      const { api } = await AtprotoCore.getApiClient();

      // Get the current user DID from userStore
      const { useUserStore } = await import('../../../stores/userStore');
      const userStore = useUserStore.getState();
      if (!userStore.currentUser?.did) {
        throw new Error('No OAuth session available');
      }
      const userDid = userStore.currentUser.did;

      const record = {
        $type: 'app.bsky.graph.follow' as const,
        subject: did,
        createdAt: new Date().toISOString(),
      };

      const response = await api.app.bsky.graph.follow.create({ repo: userDid }, record);
      return response.uri;
    });
  }

  /**
   * Unfollow a user
   * @param did - User DID to unfollow
   * @param followUri - Optional AT URI from `GraphService.follow`; avoids getProfile when indexer is briefly stale
   * @returns True if successful
   */
  static async unfollow(did: string, followUri?: string): Promise<boolean> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        return false;
      }
      return true;
    }

    const cacheKey = `unfollow:${did}`;
    return deduplicateRequest(cacheKey, async () => {
      const { api } = await AtprotoCore.getApiClient();

      // Get the current user DID from userStore
      const { useUserStore } = await import('../../../stores/userStore');
      const userStore = useUserStore.getState();
      if (!userStore.currentUser?.did) {
        throw new Error('No OAuth session available');
      }
      const userDid = userStore.currentUser.did;

      try {
        let uri = followUri?.trim();
        const isPlaceholder = !uri || uri === 'at://placeholder';

        if (isPlaceholder) {
          const profileResponse = await api.app.bsky.actor.getProfile({ actor: did });
          if (!profileResponse.data.viewer?.following) {
            return false;
          }
          uri = profileResponse.data.viewer.following;
        }
        if (!uri) {
          return false;
        }

        // Extract the rkey from the follow URI
        // URI format: at://did:plc:xxxx/app.bsky.graph.follow/rkey
        const uriParts = uri.split('/');
        const rkey = uriParts[uriParts.length - 1];

        if (!rkey) {
          return false;
        }

        await api.app.bsky.graph.follow.delete({
          repo: userDid,
          rkey: rkey,
        });

        return true;
      } catch (_error: unknown) {
        return false;
      }
    });
  }

  /**
   * Block a user
   * @param did - User DID to block
   */
  static async blockUser(did: string): Promise<void> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        throw new Error('Offline write mock failure: blockUser');
      }
      return;
    }

    await AtprotoCore.ensureSession();

    const record = {
      $type: 'app.bsky.graph.block' as const,
      subject: did,
      createdAt: new Date().toISOString(),
    };

    const { api } = await AtprotoCore.getApiClient();
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');

    await api.app.bsky.graph.block.create({ repo: userDid }, record);
  }

  /**
   * Unblock a user
   * @param did - User DID to unblock
   */
  static async unblockUser(did: string): Promise<void> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        throw new Error('Offline write mock failure: unblockUser');
      }
      return;
    }

    await AtprotoCore.ensureSession();

    const { api } = await AtprotoCore.getApiClient();
    const userDid = AtprotoCore.getCurrentUserDid();
    if (!userDid) throw new Error('No authenticated user');

    // Get the profile to get the viewer.blocking URI
    const profileResponse = await api.app.bsky.actor.getProfile({ actor: did });
    if (!profileResponse.data.viewer?.blocking) {
      // User is not blocked, nothing to do
      return;
    }

    // Extract the rkey from the block URI
    // URI format: at://did:plc:xxxx/app.bsky.graph.block/rkey
    const uriParts = profileResponse.data.viewer.blocking.split('/');
    const rkey = uriParts[uriParts.length - 1];

    if (!rkey) {
      throw new Error('Could not extract rkey from block URI');
    }

    // Delete the block using the record key
    await api.app.bsky.graph.block.delete({
      repo: userDid,
      rkey: rkey,
    });
  }

  /**
   * Mute a user
   * @param did - User DID to mute
   * @returns Promise indicating success
   */
  static async muteUser(did: string): Promise<boolean> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        return false;
      }
      return true;
    }

    try {
      await AtprotoCore.ensureSession();

      const { api } = await AtprotoCore.getApiClient();

      await api.app.bsky.graph.muteActor({
        actor: did,
      });

      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Unmute a user
   * @param did - User DID to unmute
   * @returns Promise indicating success
   */
  static async unmuteUser(did: string): Promise<boolean> {
    if (AtprotoCore.isOutgoingApiBlocked()) {
      if (AtprotoCore.shouldFailOfflineWriteMock()) {
        return false;
      }
      return true;
    }

    try {
      await AtprotoCore.ensureSession();

      const { api } = await AtprotoCore.getApiClient();

      await api.app.bsky.graph.unmuteActor({
        actor: did,
      });

      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Check if a user is blocked
   * @param did - User DID to check
   * @returns True if blocked
   */
  static async isBlocked(did: string): Promise<boolean> {
    await AtprotoCore.ensureSession();

    try {
      // Use the correct parameter name 'filter' instead of 'actor'
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.graph.getBlocks({
        limit: 50, // Use a reasonable limit since we need to search through the results
      });

      // Check if the given DID is in the blocks list
      return response.data.blocks.some((block: { did: string }) => block.did === did);
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Get followers for a user
   * @param actor - User DID or handle
   * @param cursor - Pagination cursor
   * @param limit - Number of followers to fetch
   * @returns Promise with followers data
   */
  static async getFollowers(
    actor: string,
    cursor: string | null = null,
    limit: number = 100
  ): Promise<FollowersResponse> {
    await AtprotoCore.ensureSession();
    try {
      const params: { actor: string; limit: number; cursor?: string } = { actor, limit };
      if (cursor) params.cursor = cursor;
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.graph.getFollowers(params);
      return {
        followers: (response.data.followers || []) as ProfileViewBasic[],
        cursor: response.data.cursor ?? null,
      };
    } catch (_error: unknown) {
      return { followers: [], cursor: null };
    }
  }

  /**
   * Get following list for a user
   * @param actor - User DID or handle
   * @param cursor - Pagination cursor
   * @param limit - Number of following to fetch
   * @returns Promise with following data
   */
  static async getFollowing(
    actor: string,
    cursor: string | null = null,
    limit: number = 100
  ): Promise<FollowingResponse> {
    await AtprotoCore.ensureSession();
    try {
      const params: { actor: string; limit: number; cursor?: string } = { actor, limit };
      if (cursor) params.cursor = cursor;
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.graph.getFollows(params);
      return {
        following: (response.data.follows || []) as ProfileViewBasic[],
        cursor: response.data.cursor ?? null,
      };
    } catch (_error: unknown) {
      return { following: [], cursor: null };
    }
  }

  /**
   * Get all followers for a user (paginated)
   * @param actor - User DID or handle
   * @returns Promise with all followers
   */
  static async getAllFollowers(actor: string): Promise<ProfileViewBasic[]> {
    const allFollowers = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getFollowers(actor, cursor, 100);
      allFollowers.push(...response.followers);
      cursor = response.cursor;
      hasMore = !!cursor;
    }

    return allFollowers;
  }

  /**
   * Get all following for a user (paginated)
   * @param actor - User DID or handle
   * @returns Promise with all following
   */
  static async getAllFollowing(actor: string): Promise<ProfileViewBasic[]> {
    const allFollowing = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getFollowing(actor, cursor, 100);
      allFollowing.push(...response.following);
      cursor = response.cursor;
      hasMore = !!cursor;
    }

    return allFollowing;
  }

  /**
   * Get mutual connections (users you follow who also follow you)
   * @param userDid - User DID
   * @returns Promise with mutual connections
   */
  static async getMutualConnections(userDid: string): Promise<ProfileViewBasic[]> {
    try {
      const [followers, following] = await Promise.all([
        this.getAllFollowers(userDid),
        this.getAllFollowing(userDid),
      ]);

      // Find mutual connections
      const followerDids = new Set(followers.map(f => f.did));
      const mutualConnections = following.filter(followingUser =>
        followerDids.has(followingUser.did)
      );

      return mutualConnections;
    } catch (_error: unknown) {
      return [];
    }
  }

  /**
   * Get user's blocked users list from Bluesky
   * @returns Promise with blocked users
   */
  static async getBlockedUsersFromAPI(): Promise<string[]> {
    await AtprotoCore.ensureSession();
    try {
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.graph.getBlocks({
        limit: 100,
      });
      return response.data.blocks?.map((block: ProfileView) => block.did) || [];
    } catch (_error: unknown) {
      return [];
    }
  }

  /**
   * Get user's muted users list from Bluesky
   * @returns Promise with muted users
   */
  static async getMutedUsersFromAPI(): Promise<string[]> {
    await AtprotoCore.ensureSession();
    try {
      const { api } = await AtprotoCore.getApiClient();
      const response = await api.app.bsky.graph.getMutes({
        limit: 100,
      });
      return response.data.mutes?.map((mute: ProfileView) => mute.did) || [];
    } catch (_error: unknown) {
      return [];
    }
  }
}
