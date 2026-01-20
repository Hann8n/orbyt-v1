import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import ChatService from '../services/ChatService';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import { QUERY_CONSTANTS } from '../utils/constants';
import { queryKeys } from '../utils/query/queryKeys';
import type { Notification } from '../services/api/types';

export const useUnreadCount = () => {
  const { updateFromConversations } = useChatStore();
  const isAuthenticated = useUserStore(state => state.isAuthenticated);

  const queryOptions = {
    enabled: isAuthenticated,
    refetchInterval: (isAuthenticated ? 30000 : false) as number | false,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM, // 1 minute - unread counts change moderately
  };

  // Get unread notifications count
  const { data: notificationsData } = useQuery({
    queryKey: queryKeys.notifications.count(),
    queryFn: async () => {
      const response = await AtprotoService.listNotifications(null, 100);
      return response.notifications.filter((n: Notification) => !n.isRead).length;
    },
    ...queryOptions,
  });

  // Get unread messages count - DISABLED: Chat features are disabled
  const { data: _messagesData } = useQuery({
    queryKey: queryKeys.chat.conversations.count(),
    queryFn: async () => {
      const response = await ChatService.getConversations();
      if (response.conversations) {
        updateFromConversations(response.conversations);
      }
      return response.conversations.reduce((total, conv) => total + conv.unreadCount, 0);
    },
    ...queryOptions,
    enabled: false, // Chat features disabled - prevent API calls
  });

  const notificationsCount = notificationsData || 0;
  const messagesCount = 0; // Chat features disabled - always return 0
  const totalUnreadCount = notificationsCount + messagesCount;

  return {
    notificationsCount,
    messagesCount,
    totalUnreadCount,
    hasUnread: totalUnreadCount > 0,
  };
};
