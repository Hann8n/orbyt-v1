import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { NotificationService } from '../services/api/notification/NotificationService';
import { ChatService } from '../services/api/chat/ChatService';
import { useUserStore, selectIsSessionValid } from '../stores/userStore';
import { QUERY_CONSTANTS } from '../utils/constants';
import { queryKeys } from '../utils/query/queryKeys';
import { chatReactQueryOptions } from '../utils/query/chatQueryOptions';

/** Matches ChatsTab default "chats" segment — shared React Query cache for listConvos. */
const CHAT_LIST_FILTER_ACCEPTED = { status: 'accepted' as const };
const CHAT_LIST_FILTER_REQUESTS = { status: 'request' as const };

export const useUnreadCount = () => {
  const sessionValid = useUserStore(selectIsSessionValid);

  const { data: notificationsCount = 0 } = useQuery({
    queryKey: [...queryKeys.unread.summary(), 'notifications'],
    queryFn: async () => (await NotificationService.getUnreadCount()).count,
    enabled: sessionValid,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM,
    ...chatReactQueryOptions,
  });

  const { data: messagesCount = 0 } = useInfiniteQuery({
    queryKey: queryKeys.chat.conversations.list(undefined, CHAT_LIST_FILTER_ACCEPTED),
    queryFn: async ({ pageParam }) =>
      ChatService.listConvos(pageParam as string | null, CHAT_LIST_FILTER_ACCEPTED),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    enabled: sessionValid,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    ...chatReactQueryOptions,
    select: data =>
      data.pages
        .flatMap(p => p.conversations ?? [])
        .reduce((sum, c) => sum + (c.muted ? 0 : c.unreadCount), 0),
  });

  // Two selects on the same query key — RQ deduplicates the network request.
  const { data: requestsCount = 0 } = useInfiniteQuery({
    queryKey: queryKeys.chat.conversations.list(undefined, CHAT_LIST_FILTER_REQUESTS),
    queryFn: async ({ pageParam }) =>
      ChatService.listConvos(pageParam as string | null, CHAT_LIST_FILTER_REQUESTS),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    enabled: sessionValid,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    ...chatReactQueryOptions,
    select: data => data.pages.flatMap(p => p.conversations ?? []).length,
  });

  const { data: hasUnseenRequests = false } = useInfiniteQuery({
    queryKey: queryKeys.chat.conversations.list(undefined, CHAT_LIST_FILTER_REQUESTS),
    queryFn: async ({ pageParam }) =>
      ChatService.listConvos(pageParam as string | null, CHAT_LIST_FILTER_REQUESTS),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    enabled: sessionValid,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    ...chatReactQueryOptions,
    select: data => data.pages.flatMap(p => p.conversations ?? []).some(c => c.unreadCount > 0),
  });

  const totalUnreadCount = notificationsCount + messagesCount;

  return {
    notificationsCount,
    messagesCount,
    requestsCount,
    hasUnseenRequests,
    totalUnreadCount,
    hasUnread: totalUnreadCount > 0,
  };
};
