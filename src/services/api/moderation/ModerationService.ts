/**
 * Moderation Service - com.atproto.moderation.* namespace operations
 * Handles all moderation-related API operations including content reporting
 */

import { logger } from '../../../utils/logger';
import { AtprotoCore } from '../core';

export class ModerationService {
  /**
   * Report a post or user for moderation
   * @param uri - URI of the content to report (post or user)
   * @param reasonType - The reason for reporting (can be simple type or full namespace type)
   * @param reason - Optional additional context for the report
   * @param _labelerDid - Optional DID of the labeler to receive the report (default: uses Bluesky's moderation)
   * @returns A boolean indicating whether the report was successfully submitted
   */
  static async reportContent(
    uri: string, 
    reasonType: string | 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other',
    reason?: string,
    _labelerDid?: string
  ): Promise<boolean> {
    try {
      await AtprotoCore.ensureSession();
      
      // For posts, we need the CID in addition to URI for proper reporting
      let cid: string | undefined;
      let subject: { $type?: string; uri?: string; cid?: string; did?: string } = {};
      
      // Convert simple reason types to full namespace format if needed
      let fullReasonType = reasonType;
      if (!reasonType.includes('#')) {
        // Map simple reason types to full namespace format
        const reasonMap: Record<string, string> = {
          'spam': 'com.atproto.moderation.defs#reasonSpam',
          'violation': 'com.atproto.moderation.defs#reasonViolation',
          'misleading': 'com.atproto.moderation.defs#reasonMisleading',
          'sexual': 'com.atproto.moderation.defs#reasonSexual',
          'rude': 'com.atproto.moderation.defs#reasonRude',
          'other': 'com.atproto.moderation.defs#reasonOther'
        };
        fullReasonType = reasonMap[reasonType] || 'com.atproto.moderation.defs#reasonOther';
      }
      
      // Determine if we're reporting a post or user
      if (uri.includes('app.bsky.feed.post')) {
        try {
          // Try to get the post to extract its CID
          const { api } = await AtprotoCore.getApiClient();
          const postResponse = await api.app.bsky.feed.getPostThread({ 
            uri,
            depth: 0
          });
          
          const thread = postResponse.data.thread;
          
          // Type guard for ThreadViewPost
          if (thread && 
              thread.$type === 'app.bsky.feed.defs#threadViewPost' && 
              'post' in thread && 
              thread.post?.cid) {
            cid = thread.post.cid;
          }
        } catch (err) {
        }
        
        // Set the subject for a post
        subject = {
          $type: 'com.atproto.repo.strongRef' as const,
          uri,
          ...(cid && { cid })
        };
      } else if (uri.startsWith('did:')) {
        // We're reporting a user
        subject = { $type: 'com.atproto.admin.defs#repoRef' as const, did: uri };
      } else {
        // Default to repo strongRef for other content types
        subject = {
          $type: 'com.atproto.repo.strongRef' as const,
          uri
        };
      }
      
      // Get the API client
      const { api } = await AtprotoCore.getApiClient();
      
      // Create the moderation report
      await api.com.atproto.moderation.createReport({
        reasonType: fullReasonType,
        subject: subject as { $type: string; uri?: string; cid?: string; did?: string },
        reason
      });
      
      return true;
    } catch (error: unknown) {
      return false;
    }
  }
}
