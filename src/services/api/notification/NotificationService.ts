/**
 * Notification Service - app.bsky.notification.* namespace operations
 * Handles all notification-related API operations including listing notifications and activity subscriptions
 */

import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';
import type { NotificationsResponse, PutActivitySubscriptionOutput, ProfileView } from '../types';

export class NotificationService {
  /**
   * List notifications for the current user
   * @param cursor - Pagination cursor
   * @param limit - Number of notifications to fetch
   * @returns Promise with notifications data
   */
  static async listNotifications(
    cursor: string | null = null,
    limit = 50
  ): Promise<NotificationsResponse> {
    await AtprotoCore.ensureSession();
    try {
      const apiClient = await AtprotoCore.getApiClient();
      if (!apiClient) {
        return { notifications: [], cursor: null };
      }

      const { api } = apiClient;

      // Verify we have a valid API client
      if (!api || !api.app || !api.app.bsky || !api.app.bsky.notification) {
        logger.error('Invalid API client structure for listNotifications', {
          component: 'NotificationService',
        });
        throw new Error('Invalid API client');
      }

      const params: { cursor?: string; limit: number } = {
        limit,
      };
      if (cursor !== null) {
        params.cursor = cursor;
      }

      const response = await api.app.bsky.notification.listNotifications(params);

      return {
        notifications: response.data.notifications || [],
        cursor: response.data.cursor || null,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error fetching notifications', error, {
        component: 'NotificationService',
        cursor,
        limit,
        errorMessage: errorMsg,
      });
      throw error; // Re-throw so the UI can handle it properly
    }
  }

  /**
   * Mark all notifications as seen for the current user
   * @returns Promise indicating success
   */
  static async updateNotificationSeen(): Promise<void> {
    await AtprotoCore.ensureSession();
    try {
      const apiClient = await AtprotoCore.getApiClient();
      if (!apiClient) {
        return; // Non-critical operation, fail silently
      }

      const { api } = apiClient;
      // Call the Bluesky API to mark notifications as seen
      // This uses the current timestamp as the seenAt parameter
      await api.app.bsky.notification.updateSeen({
        seenAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      // Non-critical operation, fail silently
    }
  }

  /**
   * Subscribe to activity notifications from a user
   * @param did - DID of the user to subscribe to
   * @param preferences - Activity subscription preferences (post/reply). Defaults to both true.
   * @returns Promise resolving to subscription status
   */
  static async putActivitySubscription(
    did: string,
    preferences: { post: boolean; reply: boolean } = { post: true, reply: true }
  ): Promise<PutActivitySubscriptionOutput> {
    try {
      const { api } = await AtprotoCore.getApiClient();

      if (!api) {
        throw new Error('No API client available');
      }

      // Cannot subscribe to yourself
      const currentUserDid = await AtprotoCore.getCurrentUserDid();
      if (currentUserDid === did) {
        throw new Error('Cannot subscribe to your own activity');
      }

      const response = await api.app.bsky.notification.putActivitySubscription({
        subject: did,
        activitySubscription: {
          post: preferences.post,
          reply: preferences.reply,
        },
      });

      const output: PutActivitySubscriptionOutput = response.data;
      return output;
    } catch (error) {
      logger.error('Error subscribing to activity', error, {
        component: 'NotificationService',
        did,
      });
      throw error;
    }
  }

  /**
   * Unsubscribe from activity notifications from a user
   * @param did - DID of the user to unsubscribe from
   * @returns Promise resolving to subscription status
   */
  static async deleteActivitySubscription(did: string): Promise<void> {
    try {
      const { api } = await AtprotoCore.getApiClient();

      if (!api) {
        throw new Error('No API client available');
      }

      await api.app.bsky.notification.putActivitySubscription({
        subject: did,
        activitySubscription: {
          post: false,
          reply: false,
        },
      });
    } catch (error) {
      logger.error('Error unsubscribing from activity', error, {
        component: 'NotificationService',
        did,
      });
      throw error;
    }
  }

  /**
   * List all activity subscriptions (users you're subscribed to)
   * @param cursor - Pagination cursor
   * @returns Promise with list of subscribed profiles
   */
  static async listActivitySubscriptions(
    cursor?: string
  ): Promise<{ cursor?: string; subscriptions: ProfileView[] }> {
    try {
      const { api } = await AtprotoCore.getApiClient();

      if (!api) {
        throw new Error('No API client available');
      }

      const params: { cursor?: string } = {};
      if (cursor) {
        params.cursor = cursor;
      }

      const response = await api.app.bsky.notification.listActivitySubscriptions(params);

      return {
        cursor: response.data.cursor,
        subscriptions: response.data.subscriptions || [],
      };
    } catch (error) {
      logger.error('Error listing activity subscriptions', error, {
        component: 'NotificationService',
      });
      return { subscriptions: [] };
    }
  }

  /**
   * Check if subscribed to a specific user's activity
   * @param did - DID of the user to check
   * @returns Promise resolving to true if subscribed
   */
  static async isSubscribedToActivity(did: string): Promise<boolean> {
    try {
      // Fetch all subscriptions and check if this DID is in the list
      const { subscriptions } = await this.listActivitySubscriptions();
      return subscriptions.some(sub => sub.did === did);
    } catch (error) {
      logger.error('Error checking subscription status', error, {
        component: 'NotificationService',
        did,
      });
      return false;
    }
  }
}
