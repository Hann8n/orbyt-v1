import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import { ChatService } from '../services/api/chat/ChatService';
import { useUserStore } from '../stores/userStore';
import { QUERY_CONSTANTS } from '../utils/constants';
import { queryKeys } from '../utils/query/queryKeys';

export type UnreadSummary = {
  notificationsCount: number;
  messagesCount: number;
};

export const useUnreadCount = () => {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);

  const { data } = useQuery<UnreadSummary>({
    queryKey: queryKeys.unread.summary(),
    queryFn: async (): Promise<UnreadSummary> => {
      const [{ count: notificationsCount }, { conversations }] = await Promise.all([
        AtprotoService.getUnreadCount(),
        ChatService.listConvos(null),
      ]);
      const messagesCount = conversations.reduce(
        (sum, c) => sum + (c.muted ? 0 : c.unreadCount),
        0
      );
      return { notificationsCount, messagesCount };
    },
    enabled: isAuthenticated,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM,
  });

  const notificationsCount = data?.notificationsCount ?? 0;
  const messagesCount = data?.messagesCount ?? 0;
  const totalUnreadCount = notificationsCount + messagesCount;

  return {
    notificationsCount,
    messagesCount,
    totalUnreadCount,
    hasUnread: totalUnreadCount > 0,
  };
};
