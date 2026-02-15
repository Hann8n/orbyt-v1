/**
 * Chat real-time updates per AT Protocol API.
 *
 * The lexicon defines chat.bsky.convo.getLog as type "query" (HTTP GET), not
 * "subscription". There is no WebSocket/livestream for chat; only sync and labels
 * have subscription endpoints. So the prescribed way to get new chat events is
 * cursor-based polling: call getLog(cursor), merge logs for the current convo into
 * local state, then pass the returned cursor on the next poll.
 *
 * @see https://github.com/bluesky-social/atproto/blob/main/lexicons/chat/bsky/convo/getLog.json
 * @see https://atproto.com/specs/xrpc (cursor pagination)
 */

import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ChatService } from '../services/api/chat/ChatService';
import type { MessageView } from '@atproto/api/dist/client/types/chat/bsky/convo/defs';
import { queryKeys } from '../utils/query/queryKeys';

const BASE_POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 15000;
const BACKOFF_MULTIPLIER = 2;

const LOG_CREATE_MESSAGE = 'chat.bsky.convo.defs#logCreateMessage';
const LOG_DELETE_MESSAGE = 'chat.bsky.convo.defs#logDeleteMessage';
const LOG_ADD_REACTION = 'chat.bsky.convo.defs#logAddReaction';
const LOG_REMOVE_REACTION = 'chat.bsky.convo.defs#logRemoveReaction';

function isMessageView(m: unknown): m is MessageView {
  return !!m && typeof (m as { id?: string }).id === 'string';
}

/**
 * While the chat screen is mounted, poll getLog(cursor) and apply events for the
 * current convo to the messages query cache so new messages and reactions appear
 * without a full refetch.
 */
export function useChatLogPolling(convoId: string | undefined, queryClient: QueryClient): void {
  const cursorRef = useRef<string | null>(null);
  const currentDelayRef = useRef(BASE_POLL_INTERVAL_MS);

  useEffect(() => {
    if (!convoId) return;
    const ac = new AbortController();
    currentDelayRef.current = BASE_POLL_INTERVAL_MS;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (ac.signal.aborted) return;
      try {
        const key = queryKeys.chat.messages.byConversation(convoId);
        const prev = queryClient.getQueryData<{ messages: unknown[]; cursor: string | null }>(key);
        if (!prev?.messages || !Array.isArray(prev.messages)) {
          timeoutId = setTimeout(poll, BASE_POLL_INTERVAL_MS);
          return;
        }

        const { cursor: nextCursor, logs } = await ChatService.getLog(cursorRef.current);
        if (ac.signal.aborted) return;

        let nextMessages = [...prev.messages] as Array<Record<string, unknown> & { id: string }>;
        let didChange = false;

        for (const entry of logs) {
          if (!('convoId' in entry) || entry.convoId !== convoId) continue;

          const type = entry.$type;

          if (
            type === LOG_CREATE_MESSAGE &&
            'message' in entry &&
            entry.message &&
            isMessageView(entry.message)
          ) {
            const msg = entry.message as {
              id: string;
              rev: string;
              sender?: { did: string };
              sentAt?: string;
              text?: string;
              reactions?: unknown[];
            };
            const existing = nextMessages.findIndex(m => m.id === msg.id);
            if (existing >= 0) {
              nextMessages[existing] = { ...nextMessages[existing], ...msg };
            } else {
              // Prepend so cache stays newest-first; screen reverse() then shows new message at bottom
              nextMessages.unshift(msg as (typeof nextMessages)[0]);
            }
            didChange = true;
          } else if (
            (type === LOG_DELETE_MESSAGE ||
              type === LOG_ADD_REACTION ||
              type === LOG_REMOVE_REACTION) &&
            'message' in entry &&
            entry.message &&
            isMessageView(entry.message)
          ) {
            const msg = entry.message as {
              id: string;
              rev: string;
              sender?: { did: string };
              sentAt?: string;
              text?: string;
              reactions?: unknown[];
            };
            const idx = nextMessages.findIndex(m => m.id === msg.id);
            if (idx >= 0) {
              nextMessages[idx] = { ...nextMessages[idx], ...msg };
              didChange = true;
            }
          }
        }

        if (didChange) {
          queryClient.setQueryData(key, { ...prev, messages: nextMessages });
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
          currentDelayRef.current = BASE_POLL_INTERVAL_MS;
        } else {
          const next = Math.min(currentDelayRef.current * BACKOFF_MULTIPLIER, MAX_POLL_INTERVAL_MS);
          currentDelayRef.current = next;
        }

        if (nextCursor != null) cursorRef.current = nextCursor;
      } catch {
        // Ignore errors (e.g. network); next poll will retry
      }

      if (!ac.signal.aborted) {
        timeoutId = setTimeout(poll, currentDelayRef.current);
      }
    };

    poll();

    return () => {
      ac.abort();
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [convoId, queryClient]);
}
