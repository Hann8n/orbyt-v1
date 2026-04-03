/**
 * MMKV persistence for video feedback (show more / show less). Centralizes the storage contract.
 */
import { storage } from '../../../utils/storage/storage';

export type StoredVideoFeedback = {
  postUri: string;
  type: 'interested' | 'not_interested';
  timestamp: string;
  userDid: string;
  targetFeed: string | null;
};

export type VideoFeedbackPublic = {
  type: 'interested' | 'not_interested';
  timestamp: string;
  userDid: string;
};

function feedbackKey(postUri: string): string {
  return `video_feedback_${postUri}`;
}

function isValidStoredFeedback(raw: unknown): raw is StoredVideoFeedback {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.postUri === 'string' &&
    (o.type === 'interested' || o.type === 'not_interested') &&
    typeof o.timestamp === 'string' &&
    typeof o.userDid === 'string' &&
    (o.targetFeed === null || typeof o.targetFeed === 'string')
  );
}

export function getVideoFeedbackFromStorage(postUri: string): VideoFeedbackPublic | null {
  const key = feedbackKey(postUri);
  const feedbackStr = storage.getString(key) ?? null;
  if (!feedbackStr) return null;
  try {
    const parsed: unknown = JSON.parse(feedbackStr);
    if (!isValidStoredFeedback(parsed)) {
      storage.delete(key);
      return null;
    }
    return {
      type: parsed.type,
      timestamp: parsed.timestamp,
      userDid: parsed.userDid,
    };
  } catch {
    return null;
  }
}

export function setVideoFeedbackInStorage(data: StoredVideoFeedback): void {
  storage.set(feedbackKey(data.postUri), JSON.stringify(data));
}

export function removeVideoFeedbackFromStorage(postUri: string): void {
  storage.delete(feedbackKey(postUri));
}
