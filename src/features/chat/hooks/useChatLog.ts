/**
 * Global chat log polling.
 *
 * chat.bsky.convo.getLog is a query, not a subscription — so we poll on a cursor.
 * Mount this hook once at the app root (not per thread). It drives:
 *   - prepending messages in the active thread's messages cache
 *   - refreshing the conversations list (last message + unread)
 *   - refreshing the unread summary badge
 *
 * Adaptive cadence keyed on AppState:
 *   - foreground → 5s
 *   - background → paused
 *   - on resume → immediate flush
 *
 * Cursor is persisted to MMKV so cold start diffs instead of re-pulling.
 */

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ChatService } from '../../../services/api/chat/ChatService';
import { queryKeys } from '../../../utils/query/queryKeys';
import { mergeLog, type ConvoMessagesCache } from '../cache/mergeLog';
import { storage } from '../../../utils/storage/storage';
import { useUserStore } from '../../../stores/userStore';

const CURSOR_KEY = 'chat.getLog.cursor.v1';
const FOREGROUND_INTERVAL_MS = 5000;

function readCursor(): string | null {
  return storage.getString(CURSOR_KEY) ?? null;
}

function writeCursor(cursor: string | null) {
  if (cursor == null) storage.delete(CURSOR_KEY);
  else storage.set(CURSOR_KEY, cursor);
}

export function useChatLog(): void {
  const queryClient = useQueryClient();
  const currentDid = useUserStore(s => s.currentUser?.did);
  const cursorRef = useRef<string | null>(readCursor());
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!currentDid) return;

    const runOnce = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { cursor: nextCursor, logs } = await ChatService.getLog(cursorRef.current);
        if (logs.length > 0) {
          const result = mergeLog(logs, id =>
            queryClient.getQueryData<ConvoMessagesCache>(queryKeys.chat.messages.byConversation(id))
          );
          for (const [convoId, updater] of result.messageUpdates) {
            queryClient.setQueryData<ConvoMessagesCache>(
              queryKeys.chat.messages.byConversation(convoId),
              curr => updater(curr)
            );
          }
          if (result.touchedConvoIds.size > 0 || result.leftConvoIds.size > 0) {
            queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.unread.summary() });
          }
        }
        if (nextCursor != null) {
          cursorRef.current = nextCursor;
          writeCursor(nextCursor);
        }
      } catch {
        // Transient failures are fine — next tick retries. chatClient handles 429 backoff.
      } finally {
        inFlightRef.current = false;
      }
    };

    const schedule = () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
      if (appStateRef.current !== 'active') return;
      timerRef.current = setTimeout(async () => {
        await runOnce();
        schedule();
      }, FOREGROUND_INTERVAL_MS);
    };

    const handleAppState = (status: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = status;
      if (status === 'active' && prev !== 'active') {
        runOnce().then(schedule);
      } else if (status !== 'active') {
        if (timerRef.current != null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    runOnce().then(schedule);
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      sub.remove();
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [queryClient, currentDid]);
}
