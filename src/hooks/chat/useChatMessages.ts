import { useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ChatService } from '@/services/api/chat/ChatService';
import { queryKeys } from '@/utils/query/queryKeys';
import { QUERY_CONSTANTS } from '@/utils/constants';
import type { MessageView } from '@/services/api/types';

const POLLING_INTERVAL_ACTIVE = 5000;

type MessagesResponse = { messages: MessageView[]; cursor: string | null };
type ChatInfiniteData = InfiniteData<MessagesResponse, string | null>;

function getQueryKey(convoId: string | undefined) {
  return queryKeys.chat.messages.infinite(convoId ?? '');
}

export function useChatMessages(convoId: string | undefined) {
  const queryKey = getQueryKey(convoId);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const res = await ChatService.getMessages(convoId!, pageParam);
      return { messages: res.messages as MessageView[], cursor: res.cursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: last => last.cursor ?? undefined,
    enabled: !!convoId,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    gcTime: QUERY_CONSTANTS.GC_TIME,
    refetchInterval: POLLING_INTERVAL_ACTIVE,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const messages = query.data?.pages.flatMap(p => p.messages) ?? [];

  return {
    messages,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}

export function useSendMessage(convoId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = getQueryKey(convoId);

  return useMutation({
    mutationFn: (text: string) => ChatService.sendMessage(convoId!, { text }),
    onSuccess: data => {
      queryClient.setQueryData<ChatInfiniteData>(queryKey, old => {
        if (!old?.pages.length) return old;
        const first = old.pages[0];
        if (first.messages.some(m => m.id === data.id)) return old;
        return {
          ...old,
          pages: [{ ...first, messages: [data, ...first.messages] }, ...old.pages.slice(1)],
        };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
    },
    onError: () => {
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
  const queryKey = getQueryKey(convoId);
  const onErrorRef = useRef(options?.onError);
  useEffect(() => {
    onErrorRef.current = options?.onError;
  }, [options?.onError]);
  const previousDataRef = useRef<ChatInfiniteData | undefined>(undefined);

  const rollback = useCallback(() => {
    if (previousDataRef.current) {
      queryClient.setQueryData(queryKey, previousDataRef.current);
    }
  }, [queryClient, queryKey]);

  return useMutation({
    mutationFn: ({ messageId, value, add }: { messageId: string; value: string; add: boolean }) =>
      add
        ? ChatService.addReaction(convoId!, messageId, value)
        : ChatService.removeReaction(convoId!, messageId, value),

    onMutate: async ({ messageId, value, add }) => {
      await queryClient.cancelQueries({ queryKey });
      previousDataRef.current = queryClient.getQueryData<ChatInfiniteData>(queryKey);

      queryClient.setQueryData<ChatInfiniteData>(queryKey, old => {
        if (!old?.pages.length) return old;
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            messages: page.messages.map(msg => {
              if (msg.id !== messageId) return msg;
              const reactions = [...(msg.reactions ?? [])];
              if (add) {
                reactions.push({ value, sender: { did: currentUserDid ?? '' }, createdAt: new Date().toISOString() });
              } else {
                const idx = reactions.findIndex(r => r.value === value && r.sender?.did === currentUserDid);
                if (idx >= 0) reactions.splice(idx, 1);
              }
              return { ...msg, reactions };
            }),
          })),
        };
      });
    },

    onError: () => {
      rollback();
      onErrorRef.current?.();
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
