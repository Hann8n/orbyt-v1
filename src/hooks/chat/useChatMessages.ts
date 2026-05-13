
import { useEffect, useRef } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { ChatService } from '@/services/api/chat/ChatService';
import { queryKeys } from '@/utils/query/queryKeys';
import { chatReactQueryOptions } from '@/utils/query/chatQueryOptions';
import type { MessageView } from '@/services/api/types';
import { ChatBskyConvoDefs } from '@atproto/api';
import type {
  LogCreateMessage,
  LogDeleteMessage,
  LogAddReaction,
  LogRemoveReaction,
} from '@atproto/api/dist/client/types/chat/bsky/convo/defs';

const POLLING_INTERVAL_ACTIVE = 5000; // 5s when chat is active
const STALE_TIME = 3000;
const NO_CONVO_SENTINEL = '__no_convo__';

interface MessagesResponse {
  messages: MessageView[];
  cursor: string | null;
}

function convoQueryKey(convoId: string | undefined) {
  return queryKeys.chat.messages.byConversation(convoId ?? NO_CONVO_SENTINEL);
}

async function snapshotAndCancel(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: ReturnType<typeof convoQueryKey>
) {
  await queryClient.cancelQueries({ queryKey });
  return queryClient.getQueryData<MessagesResponse>(queryKey);
}

function rollback(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: ReturnType<typeof convoQueryKey>,
  previousData: MessagesResponse | undefined
) {
  if (previousData) queryClient.setQueryData(queryKey, previousData);
}

interface LogResponse {
  logs: Array<
    | LogCreateMessage
    | LogDeleteMessage
    | LogAddReaction
    | LogRemoveReaction
    | { $type: string; convoId?: string; rev?: string }
  >;
  cursor?: string;
}

function applyLogEvents(
  currentMessages: MessageView[],
  logs: LogResponse['logs'],
  convoId: string
): MessageView[] {
  if (!logs.length) return currentMessages;

  const messageMap = new Map(currentMessages.map(m => [m.id, m]));

  for (const entry of logs) {
    const type = entry.$type;

    if (!('convoId' in entry) || entry.convoId !== convoId) continue;

    switch (type) {
      case 'chat.bsky.convo.defs#logCreateMessage': {
        const logEntry = entry as LogCreateMessage;
        const msg = logEntry.message;
        if (ChatBskyConvoDefs.isMessageView(msg) && !messageMap.has(msg.id)) {
          messageMap.set(msg.id, msg as MessageView);
        }
        break;
      }

      case 'chat.bsky.convo.defs#logDeleteMessage': {
        const logEntry = entry as LogDeleteMessage;
        const msg = logEntry.message;
        if (ChatBskyConvoDefs.isMessageView(msg) && messageMap.has(msg.id)) {
          const existing = messageMap.get(msg.id)!;
          messageMap.set(msg.id, { ...existing, text: '' } as MessageView);
        }
        break;
      }

      case 'chat.bsky.convo.defs#logAddReaction':
      case 'chat.bsky.convo.defs#logRemoveReaction': {
        const logEntry = entry as LogAddReaction | LogRemoveReaction;
        const msg = logEntry.message;
        if (
          ChatBskyConvoDefs.isMessageView(msg) &&
          'reactions' in msg &&
          messageMap.has(msg.id)
        ) {
          messageMap.set(msg.id, msg as MessageView);
        }
        break;
      }
    }
  }

  return Array.from(messageMap.values()).sort((a, b) => {
    const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
    const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function useChatMessages(convoId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = convoQueryKey(convoId);
  const logCursorCacheKey = [...queryKey, '__log_cursor__'] as const;

  const getCursor = () =>
    queryClient.getQueryData<string | null>(logCursorCacheKey) ?? null;
  const setCursor = (cursor: string | undefined) =>
    queryClient.setQueryData(logCursorCacheKey, cursor ?? null);

  const messagesQuery = useQuery<MessagesResponse, Error>({
    queryKey,
    queryFn: async () => {
      if (!convoId) throw new Error('No conversation ID');
      const response = await ChatService.getMessages(convoId, null);
      return {
        messages: response.messages as MessageView[],
        cursor: response.cursor,
      };
    },
    enabled: !!convoId,
    staleTime: STALE_TIME,
    refetchInterval: POLLING_INTERVAL_ACTIVE,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    ...chatReactQueryOptions,
  });

  const logQuery = useQuery<LogResponse, Error>({
    queryKey: [...queryKey, 'log'],
    queryFn: async () => {
      if (!convoId) throw new Error('No conversation ID');
      const response = await ChatService.getLog(getCursor());
      setCursor(response.cursor);
      return { logs: response.logs as LogResponse['logs'], cursor: response.cursor };
    },
    enabled: !!convoId && !!messagesQuery.data,
    staleTime: STALE_TIME,
    refetchInterval: POLLING_INTERVAL_ACTIVE,
    refetchIntervalInBackground: false,
    ...chatReactQueryOptions,
  });

  useEffect(() => {
    const data = logQuery.data;
    if (!data || !data.logs.length || !convoId) return;
    const current = queryClient.getQueryData<MessagesResponse>(queryKey);
    const currentMessages = current?.messages ?? [];
    const updatedMessages = applyLogEvents(currentMessages, data.logs, convoId);
    const hasChanges =
      updatedMessages.length !== currentMessages.length ||
      updatedMessages.some((msg, i) => msg !== currentMessages[i]);
    if (hasChanges) {
      queryClient.setQueryData<MessagesResponse>(queryKey, old => ({
        messages: updatedMessages,
        cursor: old?.cursor ?? null,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logQuery.data]);

  const isLoading = messagesQuery.isLoading;
  const isFetching = messagesQuery.isFetching || logQuery.isFetching;
  const messages = messagesQuery.data?.messages ?? [];

  return {
    messages,
    isLoading,
    isFetching,
    error: messagesQuery.error,
    refetch: messagesQuery.refetch,
    cursor: messagesQuery.data?.cursor ?? null,
  };
}

export function useSendMessage(convoId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = convoQueryKey(convoId);

  return useMutation({
    mutationFn: async (text: string) => {
      if (!convoId) throw new Error('No conversation ID');
      return ChatService.sendMessage(convoId, { text });
    },
    onMutate: async (text: string) => {
      const previousData = await snapshotAndCancel(queryClient, queryKey);
      const optimisticMessage: MessageView = {
        id: `optimistic-${Date.now()}`,
        rev: '',
        text,
        sentAt: new Date().toISOString(),
        sender: { did: '' },
      } as MessageView;

      queryClient.setQueryData<MessagesResponse>(queryKey, old => ({
        messages: [optimisticMessage, ...(old?.messages ?? [])],
        cursor: old?.cursor ?? null,
      }));

      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.all,
      });
    },
    onError: (_err, _variables, context) => rollback(queryClient, queryKey, context?.previousData),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useChatReactions(
  convoId: string | undefined,
  currentUserDid: string | undefined,
  options?: { onError?: () => void }
) {
  const queryClient = useQueryClient();
  const queryKey = convoQueryKey(convoId);
  const onErrorCallback = useRef(options?.onError);
  onErrorCallback.current = options?.onError;

  return useMutation({
    mutationFn: async ({
      messageId,
      value,
      add,
    }: {
      messageId: string;
      value: string;
      add: boolean;
    }) => {
      if (!convoId) throw new Error('No conversation ID');
      return add
        ? ChatService.addReaction(convoId, messageId, value)
        : ChatService.removeReaction(convoId, messageId, value);
    },
    onMutate: async ({ messageId, value, add }) => {
      const previousData = await snapshotAndCancel(queryClient, queryKey);

      queryClient.setQueryData<MessagesResponse>(queryKey, old => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map(msg => {
            if (msg.id !== messageId) return msg;
            const reactions = [...(msg.reactions ?? [])];
            if (add) {
              reactions.push({
                value,
                sender: { did: currentUserDid ?? '' },
                createdAt: new Date().toISOString(),
              });
            } else {
              const idx = reactions.findIndex(r => r.value === value && r.sender?.did === currentUserDid);
              if (idx >= 0) reactions.splice(idx, 1);
            }
            return { ...msg, reactions };
          }),
        };
      });

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      rollback(queryClient, queryKey, context?.previousData);
      onErrorCallback.current?.();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
