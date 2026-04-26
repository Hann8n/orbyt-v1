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

export function getVideoFeedbackFromStorage(postUri: string): StoredVideoFeedback | null {
  const raw = storage.getString(feedbackKey(postUri));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isValidStoredFeedback(parsed) ? parsed : null;
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
