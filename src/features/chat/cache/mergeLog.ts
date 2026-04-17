/**
 * Pure reducer for chat.bsky.convo.getLog events.
 *
 * Consumes a batch of log entries and returns the cache patches needed for:
 *  - messages per conversation (prepend/update/delete)
 *  - conversations list (bump lastMessage + unread, handle mute/leave/accept)
 *
 * Unit-testable in isolation (no QueryClient). Callers apply the patches via
 * queryClient.setQueryData / invalidateQueries.
 */

import type { OutputSchema as GetLogOutputSchema } from '@atproto/api/dist/client/types/chat/bsky/convo/getLog';

type LogEntry = GetLogOutputSchema['logs'][number];

const LOG_CREATE_MESSAGE = 'chat.bsky.convo.defs#logCreateMessage';
const LOG_DELETE_MESSAGE = 'chat.bsky.convo.defs#logDeleteMessage';
const LOG_ADD_REACTION = 'chat.bsky.convo.defs#logAddReaction';
const LOG_REMOVE_REACTION = 'chat.bsky.convo.defs#logRemoveReaction';
const LOG_READ_MESSAGE = 'chat.bsky.convo.defs#logReadMessage';
const LOG_ACCEPT_CONVO = 'chat.bsky.convo.defs#logAcceptConvo';
const LOG_LEAVE_CONVO = 'chat.bsky.convo.defs#logLeaveConvo';
const LOG_MUTE_CONVO = 'chat.bsky.convo.defs#logMuteConvo';
const LOG_UNMUTE_CONVO = 'chat.bsky.convo.defs#logUnmuteConvo';

export interface MessageLike {
  id: string;
  rev?: string;
  sender?: { did: string };
  sentAt?: string;
  [k: string]: unknown;
}

export interface ConvoMessagesCache {
  messages: MessageLike[];
  cursor: string | null;
}

export interface MergeLogResult {
  /** Map of convoId -> updated messages cache (only for convos that changed). */
  messageUpdates: Map<
    string,
    (prev: ConvoMessagesCache | undefined) => ConvoMessagesCache | undefined
  >;
  /** Convo ids whose list entry (lastMessage/unread/etc.) should be refreshed. */
  touchedConvoIds: Set<string>;
  /** Convo ids that have been left; the list should drop them. */
  leftConvoIds: Set<string>;
  /** True when at least one `logCreateMessage` landed — callers may bump unread. */
  hasNewMessage: boolean;
  /** True when any event was successfully applied. */
  didChange: boolean;
}

function isMessageLike(m: unknown): m is MessageLike {
  return !!m && typeof (m as { id?: unknown }).id === 'string';
}

function typeOf(entry: LogEntry): string | undefined {
  return (entry as { $type?: string }).$type;
}

function convoIdOf(entry: LogEntry): string | undefined {
  return (entry as { convoId?: string }).convoId;
}

function messageOf(entry: LogEntry): MessageLike | undefined {
  const m = (entry as { message?: unknown }).message;
  return isMessageLike(m) ? m : undefined;
}

/**
 * Given previous messages + a log batch, compute patches.
 * Does not mutate input; returns updater functions the caller applies per key.
 */
export function mergeLog(
  logs: GetLogOutputSchema['logs'],
  getPrev: (convoId: string) => ConvoMessagesCache | undefined
): MergeLogResult {
  const messageUpdates = new Map<
    string,
    (prev: ConvoMessagesCache | undefined) => ConvoMessagesCache | undefined
  >();
  const touchedConvoIds = new Set<string>();
  const leftConvoIds = new Set<string>();
  let hasNewMessage = false;
  let didChange = false;

  // Work in a local map so repeated events for the same convo compose.
  const working = new Map<string, ConvoMessagesCache>();
  const ensure = (convoId: string): ConvoMessagesCache | undefined => {
    if (working.has(convoId)) return working.get(convoId);
    const prev = getPrev(convoId);
    if (!prev) return undefined;
    const copy: ConvoMessagesCache = { ...prev, messages: [...prev.messages] };
    working.set(convoId, copy);
    return copy;
  };

  for (const entry of logs) {
    const type = typeOf(entry);
    const convoId = convoIdOf(entry);
    if (!convoId) continue;

    switch (type) {
      case LOG_CREATE_MESSAGE: {
        const msg = messageOf(entry);
        if (!msg) break;
        const state = ensure(convoId);
        if (state) {
          const i = state.messages.findIndex(m => m.id === msg.id);
          if (i >= 0) state.messages[i] = { ...state.messages[i], ...msg };
          else state.messages.unshift(msg); // newest-first
          didChange = true;
        }
        touchedConvoIds.add(convoId);
        hasNewMessage = true;
        break;
      }
      case LOG_DELETE_MESSAGE: {
        const msg = messageOf(entry);
        if (!msg) break;
        const state = ensure(convoId);
        if (state) {
          const i = state.messages.findIndex(m => m.id === msg.id);
          if (i >= 0) {
            state.messages[i] = { ...state.messages[i], ...msg };
            didChange = true;
          }
        }
        touchedConvoIds.add(convoId);
        break;
      }
      case LOG_ADD_REACTION:
      case LOG_REMOVE_REACTION: {
        const msg = messageOf(entry);
        if (!msg) break;
        const state = ensure(convoId);
        if (state) {
          const i = state.messages.findIndex(m => m.id === msg.id);
          if (i >= 0) {
            state.messages[i] = { ...state.messages[i], ...msg };
            didChange = true;
          }
        }
        touchedConvoIds.add(convoId);
        break;
      }
      case LOG_READ_MESSAGE:
      case LOG_ACCEPT_CONVO:
      case LOG_MUTE_CONVO:
      case LOG_UNMUTE_CONVO: {
        touchedConvoIds.add(convoId);
        break;
      }
      case LOG_LEAVE_CONVO: {
        leftConvoIds.add(convoId);
        touchedConvoIds.add(convoId);
        break;
      }
      default: {
        // Unknown event type — ignore. Cursor still advances in caller.
        break;
      }
    }
  }

  for (const [convoId, state] of working) {
    messageUpdates.set(convoId, prev => (prev ? state : undefined));
  }

  return { messageUpdates, touchedConvoIds, leftConvoIds, hasNewMessage, didChange };
}
